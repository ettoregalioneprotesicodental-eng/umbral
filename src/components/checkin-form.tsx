"use client";
import { useActionState, useState } from "react";
import { submitCheckin, type FormState } from "@/app/actions";

export function CheckinForm({
  defaultMinutes, areas, redFlags, initial,
}: {
  defaultMinutes: number;
  areas: { id: string; label: string }[];
  redFlags: readonly { id: string; label: string }[];
  initial?: { availableMinutes: number | null; energy: number | null; fatigue: number | null; discomfort: string; areas: string[] } | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitCheckin, {});
  const [discomfort, setDiscomfort] = useState(initial?.discomfort === "red_flag" ? "moderate" : (initial?.discomfort ?? "none"));
  return (
    <form action={action} aria-labelledby="checkin-title">
      {state.error && <div className="alert alert-error" role="alert">{state.error}</div>}
      <div className="field">
        <label htmlFor="availableMinutes">¿Cuántos minutos tienes hoy?</label>
        <input id="availableMinutes" name="availableMinutes" type="number" inputMode="numeric" min={5} max={180} step={1} defaultValue={initial?.availableMinutes ?? defaultMinutes} />
      </div>
      <Scale name="energy" label="Energía" low="muy baja" high="muy alta" initial={initial?.energy ?? 3} />
      <Scale name="fatigue" label="Cansancio muscular" low="ninguno" high="mucho" initial={initial?.fatigue ?? 2} />
      <div className="field" role="radiogroup" aria-labelledby="disc-l">
        <span id="disc-l" className="field-label">Molestias</span>
        {([["none", "Ninguna"], ["mild", "Leves, puedo entrenar con normalidad"], ["moderate", "Notables, prefiero adaptar"]] as const).map(([v, l]) => (
          <label key={v} className="check"><input type="radio" name="discomfort" value={v} checked={discomfort === v} onChange={() => setDiscomfort(v)} /> {l}</label>
        ))}
      </div>
      {discomfort !== "none" && (
        <div className="field">
          <span className="field-label" id="areas-l">¿Dónde?</span>
          <div className="chip-row" role="group" aria-labelledby="areas-l">
            {areas.map((a) => (
              <label key={a.id} className="chip"><input type="checkbox" name="areas" value={a.id} defaultChecked={initial?.areas.includes(a.id)} /><span>{a.label}</span></label>
            ))}
          </div>
        </div>
      )}
      <details>
        <summary>¿Tienes alguno de estos síntomas ahora?</summary>
        <div style={{ marginTop: 6 }}>
          {redFlags.map((f) => (
            <label key={f.id} className="check"><input type="checkbox" name="redFlags" value={f.id} /> {f.label}</label>
          ))}
        </div>
      </details>
      <button className="btn btn-primary btn-block" type="submit" disabled={pending} style={{ marginTop: 12 }}>
        {pending ? "Ajustando…" : "Ajustar misión"}
      </button>
    </form>
  );
}

function Scale({ name, label, low, high, initial }: { name: string; label: string; low: string; high: string; initial: number }) {
  return (
    <div className="field">
      <span className="field-label" id={`${name}-l`}>{label} <span className="small muted">(1 = {low}, 5 = {high})</span></span>
      <div className="scale" role="radiogroup" aria-labelledby={`${name}-l`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="chip"><input type="radio" name={name} value={n} defaultChecked={initial === n} aria-label={`${label} ${n}`} /><span>{n}</span></label>
        ))}
      </div>
    </div>
  );
}
