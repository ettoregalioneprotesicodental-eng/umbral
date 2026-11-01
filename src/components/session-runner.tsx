"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adjustTimer, isFinished, parseTimer, pauseTimer, remainingMs, resumeTimer, startTimer, type TimerState } from "@/domain/training/timer";
import type { Load, Target } from "@/domain/training/units";

export interface RunnerExercise {
  slot: string;
  exerciseId: string;
  name: string;
  unilateral: boolean;
  loadable: boolean;
  sets: number;
  target: Target;
  load: Load | null;
  restSeconds: number;
  rirTarget: number | null;
  reason: string;
  previous: string | null;
  alternatives: { id: string; name: string; target: Target; loadable: boolean; unilateral: boolean }[];
}

export interface RunnerSet {
  id: string;
  slot: string;
  exerciseId: string;
  setIndex: number;
  kind: "warmup" | "working" | "incomplete" | "skipped";
  reps: number | null;
  seconds: number | null;
  load: Load | null;
  rir: number | null;
  discomfort: boolean;
  note: string | null;
}

type SyncState = "device" | "pending" | "synced" | "error";
type Op = { op: "upsert"; set: RunnerSet } | { op: "delete"; id: string };

const KEY = (sid: string, k: string) => `umbral:${k}:${sid}`;

function readLS<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function writeLS(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* almacenamiento no disponible */ }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0]! & (15 >> (Number(c) / 4)))).toString(16));
}

export function SessionRunner({
  sessionId, title, exercises, initialSets, loads, warmupSteps,
}: {
  sessionId: string;
  title: string;
  exercises: RunnerExercise[];
  initialSets: RunnerSet[];
  loads: Load[];
  warmupSteps: string[];
}) {
  const router = useRouter();
  const [sets, setSets] = useState<RunnerSet[]>(initialSets);
  const [sync, setSync] = useState<Record<string, SyncState>>(() => Object.fromEntries(initialSets.map((s) => [s.id, "synced" as SyncState])));
  const [subs, setSubs] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string>(exercises[0]?.slot ?? "");
  const [timer, setTimer] = useState<TimerState>({ status: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [warmupDone, setWarmupDone] = useState(false);
  const [online, setOnline] = useState(true);
  const flushing = useRef(false);

  /* ---------- Restaurar estado local tras recarga o bloqueo ---------- */
  useEffect(() => {
    const queue = readLS<Op[]>(KEY(sessionId, "queue"), []);
    if (queue.length) {
      setSets((prev) => applyOps(prev, queue));
      setSync((prev) => {
        const next = { ...prev };
        for (const o of queue) if (o.op === "upsert") next[o.set.id] = "pending";
        return next;
      });
    }
    setSubs(readLS(KEY(sessionId, "subs"), {}));
    setTimer(parseTimer(readLS(KEY(sessionId, "timer"), null)));
    setWarmupDone(readLS(KEY(sessionId, "warmup"), false));
    const savedActive = readLS<string | null>(KEY(sessionId, "active"), null);
    if (savedActive && exercises.some((e) => e.slot === savedActive)) setActive(savedActive);
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
  }, [sessionId, exercises]);

  useEffect(() => { writeLS(KEY(sessionId, "timer"), timer); }, [sessionId, timer]);
  useEffect(() => { writeLS(KEY(sessionId, "subs"), subs); }, [sessionId, subs]);
  useEffect(() => { writeLS(KEY(sessionId, "active"), active); }, [sessionId, active]);

  /* ---------- Reloj de pantalla (el estado real vive en endsAt) ---------- */
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    const vis = () => setNow(Date.now());
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, []);
  const finishedRef = useRef(false);
  useEffect(() => {
    if (isFinished(timer, now) && !finishedRef.current) {
      finishedRef.current = true;
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* no disponible */ }
    }
    if (timer.status !== "running") finishedRef.current = false;
  }, [timer, now]);

  /* ---------- Cola de sincronización ---------- */
  const flush = useCallback(async (): Promise<boolean> => {
    if (flushing.current) return false;
    flushing.current = true;
    try {
      let queue = readLS<Op[]>(KEY(sessionId, "queue"), []);
      while (queue.length) {
        const op = queue[0]!;
        let res: Response;
        try {
          res = op.op === "upsert"
            ? await fetch(`/api/sesion/${sessionId}/series`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(op.set) })
            : await fetch(`/api/sesion/${sessionId}/series?setId=${op.id}`, { method: "DELETE" });
        } catch {
          setOnline(false);
          return false; // sin conexión: se reintenta más tarde
        }
        setOnline(true);
        if (res.status === 401 || res.status === 429 || res.status >= 500) return false;
        if (op.op === "upsert") setSync((s) => ({ ...s, [op.set.id]: res.ok ? "synced" : "error" }));
        if (!res.ok) setMessage("Una serie no se pudo guardar en el servidor. Revisa los datos marcados.");
        queue = queue.slice(1);
        writeLS(KEY(sessionId, "queue"), queue);
      }
      return true;
    } finally {
      flushing.current = false;
    }
  }, [sessionId]);

  useEffect(() => {
    void flush();
    const on = () => { setOnline(true); void flush(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const t = setInterval(() => void flush(), 15_000);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(t); };
  }, [flush]);

  const enqueue = useCallback((op: Op) => {
    const queue = readLS<Op[]>(KEY(sessionId, "queue"), []);
    writeLS(KEY(sessionId, "queue"), [...queue, op]);
    if (op.op === "upsert") setSync((s) => ({ ...s, [op.set.id]: "pending" }));
    void flush();
  }, [sessionId, flush]);

  /* ---------- Derivados ---------- */
  const exFor = (slot: string) => exercises.find((e) => e.slot === slot)!;
  const usedFor = (e: RunnerExercise) => {
    const subId = subs[e.slot];
    const alt = subId ? e.alternatives.find((a) => a.id === subId) : undefined;
    return alt ? { id: alt.id, name: alt.name, target: alt.target, loadable: alt.loadable, unilateral: alt.unilateral } : { id: e.exerciseId, name: e.name, target: e.target, loadable: e.loadable, unilateral: e.unilateral };
  };
  const slotSets = (slot: string) => sets.filter((s) => s.slot === slot).sort((a, b) => a.setIndex - b.setIndex);
  const counted = (slot: string) => slotSets(slot).filter((s) => s.kind === "working" || s.kind === "incomplete").length;
  const skipped = (slot: string) => slotSets(slot).some((s) => s.kind === "skipped");
  const totalPlanned = exercises.reduce((s, e) => s + e.sets, 0);
  const totalDone = exercises.reduce((s, e) => s + Math.min(e.sets, counted(e.slot)), 0);
  const pendingCount = Object.values(sync).filter((v) => v === "pending" || v === "device").length;

  const current = exFor(active) ?? exercises[0]!;
  const used = usedFor(current);
  const lastOfSlot = slotSets(current.slot).filter((s) => s.kind !== "skipped").at(-1);

  /* ---------- Entrada de la serie actual ---------- */
  const [reps, setReps] = useState<number>(used.target.max);
  const [seconds, setSeconds] = useState<number>(used.target.max);
  const [load, setLoad] = useState<Load | null>(current.load);
  const [rir, setRir] = useState<number | null>(null);
  const [discomfort, setDiscomfort] = useState(false);

  useEffect(() => {
    const prev = slotSets(current.slot).filter((s) => s.kind === "working").at(-1);
    setReps(prev?.reps ?? used.target.max);
    setSeconds(prev?.seconds ?? used.target.max);
    setLoad(prev?.load ?? (used.loadable ? current.load : null));
    setRir(null);
    setDiscomfort(false);
    setEditing(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, subs[current.slot]]);

  function log(kind: RunnerSet["kind"]) {
    const isSec = used.target.kind === "seconds";
    const editRow = editing ? sets.find((s) => s.id === editing) : undefined;
    const row: RunnerSet = {
      id: editRow?.id ?? uuid(),
      slot: current.slot,
      exerciseId: used.id,
      setIndex: editRow?.setIndex ?? (slotSets(current.slot).at(-1)?.setIndex ?? -1) + 1,
      kind,
      reps: kind === "skipped" || isSec ? null : reps,
      seconds: kind === "skipped" || !isSec ? null : seconds,
      load: kind === "skipped" || !used.loadable ? null : load,
      rir: kind === "skipped" ? null : rir,
      discomfort: kind === "skipped" ? false : discomfort,
      note: null,
    };
    setSets((prev) => applyOps(prev, [{ op: "upsert", set: row }]));
    setSync((s) => ({ ...s, [row.id]: "device" }));
    enqueue({ op: "upsert", set: row });
    setMessage(null);
    if (editRow) { setEditing(null); return; }
    if (kind === "skipped") { goNext(); return; }
    if (discomfort) setMessage("Molestia registrada. Si es un dolor agudo o se irradia, termina aquí: la sesión parcial también cuenta.");
    const doneAfter = counted(current.slot) + 1;
    // El descanso empieza porque registraste la serie, nunca al revés.
    if (doneAfter < current.sets || exercises.indexOf(current) < exercises.length - 1) setTimer(startTimer(Date.now(), current.restSeconds));
    if (doneAfter >= current.sets) goNext();
  }

  function goNext() {
    const idx = exercises.indexOf(current);
    const next = exercises.slice(idx + 1).concat(exercises.slice(0, idx)).find((e) => counted(e.slot) < e.sets && !skipped(e.slot) && e.slot !== current.slot);
    if (next) setActive(next.slot);
  }

  function undoLast() {
    const last = [...sets].filter((s) => s.slot === current.slot).sort((a, b) => b.setIndex - a.setIndex)[0];
    if (!last) return;
    setSets((prev) => prev.filter((s) => s.id !== last.id));
    enqueue({ op: "delete", id: last.id });
    setMessage("Última serie deshecha.");
  }

  function startEdit(s: RunnerSet) {
    setEditing(s.id);
    if (s.reps !== null) setReps(s.reps);
    if (s.seconds !== null) setSeconds(s.seconds);
    setLoad(s.load);
    setRir(s.rir);
    setDiscomfort(s.discomfort);
  }

  async function finish() {
    setFinishing(true);
    setMessage(null);
    const ok = await flush();
    if (!ok || readLS<Op[]>(KEY(sessionId, "queue"), []).length) {
      setFinishing(false);
      setMessage("Hay series guardadas solo en este dispositivo. Conéctate para cerrar la sesión; no se perderán.");
      return;
    }
    const res = await fetch(`/api/sesion/${sessionId}/finalizar`, { method: "POST" }).catch(() => null);
    if (!res || !res.ok) {
      setFinishing(false);
      setMessage("No se pudo cerrar la sesión. Tus series están guardadas; inténtalo de nuevo.");
      return;
    }
    for (const k of ["timer", "subs", "active", "warmup", "queue"]) { try { localStorage.removeItem(KEY(sessionId, k)); } catch { /* */ } }
    router.refresh();
  }

  const remaining = Math.ceil(remainingMs(timer, now) / 1000);
  const loadOptions = useMemo(() => loads.filter((l) => !current.load || l.unit === current.load.unit), [loads, current.load]);

  return (
    <div className="grid">
      <section className="system-window">
        <p className="label">Sesión en curso</p>
        <h1>{title}</h1>
        <p className="small" aria-live="polite">
          {totalDone} de {totalPlanned} series · {online ? (pendingCount ? `${pendingCount} pendientes de sincronizar` : "todo guardado") : "sin conexión: se guarda en este dispositivo"}
        </p>
      </section>

      {!warmupDone && warmupSteps.length > 0 && (
        <section className="system-window">
          <p className="label">Calentamiento · 3 min</p>
          <ol className="small">{warmupSteps.map((s) => <li key={s}>{s}</li>)}</ol>
          <button className="btn btn-block" onClick={() => { setWarmupDone(true); writeLS(KEY(sessionId, "warmup"), true); }}>Calentamiento hecho</button>
        </section>
      )}

      {timer.status !== "idle" && remaining > 0 && (
        <section className="system-window" aria-label="Descanso">
          <p className="label">Descanso</p>
          <div className="timer" role="timer" aria-live="off" data-testid="rest-timer">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => setTimer((t) => adjustTimer(t, -15, Date.now()))}>−15 s</button>
            {timer.status === "running"
              ? <button className="btn" onClick={() => setTimer((t) => pauseTimer(t, Date.now()))}>Pausar</button>
              : <button className="btn" onClick={() => setTimer((t) => resumeTimer(t, Date.now()))}>Seguir</button>}
            <button className="btn" onClick={() => setTimer((t) => adjustTimer(t, 15, Date.now()))}>+15 s</button>
            <button className="btn" onClick={() => setTimer({ status: "idle" })}>Saltar</button>
          </div>
        </section>
      )}

      <nav aria-label="Ejercicios de la sesión" className="chip-row">
        {exercises.map((e) => {
          const n = Math.min(e.sets, counted(e.slot));
          const cls = skipped(e.slot) ? "partial" : n >= e.sets ? "done" : n > 0 ? "partial" : "";
          return (
            <button key={e.slot} className={`set-chip ${cls}`} aria-current={e.slot === current.slot ? "step" : undefined} onClick={() => setActive(e.slot)} style={{ minHeight: 44, background: e.slot === current.slot ? "rgba(111,140,255,0.18)" : "transparent", color: "var(--text)", cursor: "pointer" }}>
              {usedFor(e).name} · {skipped(e.slot) ? "omitido" : `${n}/${e.sets}`}
            </button>
          );
        })}
      </nav>

      <section className="system-window" aria-labelledby="ex-actual" data-testid="current-exercise">
        <p className="label">Serie {Math.min(counted(current.slot) + 1, current.sets)} de {current.sets}{editing ? " · corrigiendo" : ""}</p>
        <h2 id="ex-actual">{used.name}</h2>
        <p className="small">Objetivo: {used.target.min}–{used.target.max} {used.target.kind === "reps" ? "reps" : "s"}{used.unilateral ? " por lado" : ""}{current.rirTarget !== null ? ` · deja unas ${current.rirTarget} en reserva` : ""}</p>
        {current.previous && <p className="small muted">Última vez: {current.previous}</p>}
        <p className="small muted">{current.reason} <a href={`/ejercicios/${used.id}`} target="_blank" rel="noreferrer">Ver ficha</a></p>

        {used.target.kind === "reps"
          ? <Stepper label="Repeticiones" value={reps} onChange={setReps} min={0} max={100} />
          : <Stepper label="Segundos" value={seconds} onChange={setSeconds} min={0} max={1200} step={5} />}

        {used.loadable && (
          <div className="field">
            <label htmlFor="load">Peso por mancuerna</label>
            <select id="load" value={load ? `${load.value}|${load.unit}` : ""} onChange={(e) => {
              const [v, u] = e.target.value.split("|");
              setLoad(v ? { value: Number(v), unit: (u as "kg" | "lb") } : null);
            }}>
              <option value="">Sin carga</option>
              {loadOptions.map((l) => <option key={`${l.value}${l.unit}`} value={`${l.value}|${l.unit}`}>{l.value} {l.unit}</option>)}
            </select>
          </div>
        )}

        <details>
          <summary>Esfuerzo (opcional)</summary>
          <p className="small muted">Repeticiones en reserva: cuántas más podrías haber hecho con buena técnica.</p>
          <div className="chip-row" role="radiogroup" aria-label="Repeticiones en reserva">
            {[null, 0, 1, 2, 3, 4, 5].map((v) => (
              <label key={String(v)} className="chip"><input type="radio" name="rir" checked={rir === v} onChange={() => setRir(v)} /><span>{v === null ? "No sé" : v === 5 ? "5+" : v}</span></label>
            ))}
          </div>
        </details>

        <label className="check"><input type="checkbox" checked={discomfort} onChange={(e) => setDiscomfort(e.target.checked)} /> He notado molestia en esta serie</label>

        <div className="grid" style={{ gap: 8, marginTop: 8 }}>
          <button className="btn btn-primary btn-block" onClick={() => log("working")} data-testid="log-set">{editing ? "Guardar corrección" : "Serie hecha"}</button>
          <div className="row">
            <button className="btn" onClick={() => log("incomplete")}>Incompleta</button>
            <button className="btn" onClick={undoLast} disabled={slotSets(current.slot).length === 0}>Deshacer</button>
            {editing ? <button className="btn" onClick={() => setEditing(null)}>Cancelar</button> : <button className="btn" onClick={() => log("skipped")}>Omitir ejercicio</button>}
          </div>
        </div>

        {slotSets(current.slot).length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p className="small muted">Registradas (toca para corregir):</p>
            <div className="chip-row">
              {slotSets(current.slot).map((s) => (
                <button key={s.id} className={`set-chip ${s.kind === "working" ? "done" : "partial"}`} onClick={() => startEdit(s)} style={{ minHeight: 40, background: "transparent", color: "var(--text)", cursor: "pointer" }} aria-label={`Corregir serie ${s.setIndex + 1}`}>
                  {describe(s)} <SyncBadge state={sync[s.id] ?? "device"} />
                </button>
              ))}
            </div>
          </div>
        )}

        {current.alternatives.length > 0 && (
          <details style={{ marginTop: 10 }}>
            <summary>Sustituir ejercicio</summary>
            <div className="grid" style={{ gap: 6, marginTop: 6 }}>
              {subs[current.slot] && <button className="btn" onClick={() => setSubs((s) => { const n = { ...s }; delete n[current.slot]; return n; })}>Volver a {current.name}</button>}
              {current.alternatives.filter((a) => a.id !== subs[current.slot]).map((a) => (
                <button key={a.id} className="btn" onClick={() => setSubs((s) => ({ ...s, [current.slot]: a.id }))}>{a.name}</button>
              ))}
            </div>
          </details>
        )}
      </section>

      {message && <div className="alert alert-info" role="status">{message}</div>}

      <div className="sticky-actions">
        <button className="btn btn-primary btn-block" onClick={finish} disabled={finishing} data-testid="finish">
          {finishing ? "Cerrando…" : totalDone >= totalPlanned ? "Terminar sesión" : "Terminar aquí (parcial)"}
        </button>
      </div>
    </div>
  );
}

function applyOps(sets: RunnerSet[], ops: Op[]): RunnerSet[] {
  let out = [...sets];
  for (const o of ops) {
    if (o.op === "upsert") out = [...out.filter((s) => s.id !== o.set.id), o.set];
    else out = out.filter((s) => s.id !== o.id);
  }
  return out;
}

function describe(s: RunnerSet): string {
  if (s.kind === "skipped") return "omitido";
  const v = s.reps !== null ? `${s.reps}` : `${s.seconds} s`;
  const l = s.load ? ` × ${s.load.value} ${s.load.unit}` : "";
  const k = s.kind === "incomplete" ? " (incompleta)" : "";
  return `${v}${l}${k}${s.discomfort ? " ⚠" : ""}`;
}

function SyncBadge({ state }: { state: SyncState }) {
  const map: Record<SyncState, [string, string]> = {
    device: ["●", "Guardada en el dispositivo"],
    pending: ["↻", "Pendiente de sincronizar"],
    synced: ["✓", "Confirmada por el servidor"],
    error: ["!", "No se pudo guardar"],
  };
  const [icon, label] = map[state];
  return <span aria-label={label} title={label}>{icon}</span>;
}

function Stepper({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number }) {
  const id = `stepper-${label}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="stepper">
        <button type="button" className="btn" aria-label={`Restar ${step}`} onClick={() => onChange(Math.max(min, value - step))}>−</button>
        <input id={id} type="number" inputMode="numeric" value={value} min={min} max={max} onChange={(e) => onChange(Math.max(min, Math.min(max, Math.round(Number(e.target.value) || 0))))} />
        <button type="button" className="btn" aria-label={`Sumar ${step}`} onClick={() => onChange(Math.min(max, value + step))}>+</button>
      </div>
    </div>
  );
}
