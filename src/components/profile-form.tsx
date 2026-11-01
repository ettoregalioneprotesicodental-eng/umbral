"use client";
import { useActionState, useEffect, useState } from "react";
import { saveOnboarding, type FormState } from "@/app/actions";

export interface ProfileFormValues {
  alias: string;
  timeZone: string | null;
  units: "metric" | "imperial";
  adultConfirmed: boolean;
  experience: string | null;
  recentActivity: string;
  primaryGoal: string | null;
  secondaryGoals: string[];
  trainingDays: number[];
  minutesPerSession: number | null;
  location: string | null;
  hasDumbbells: boolean;
  dumbbellLoads: string;
  loadUnit: "kg" | "lb";
  hasMat: boolean;
  exerciseAvoid: string[];
  exerciseLikes: string;
  constraintAreas: string[];
  constraintPattern: "occasional" | "ongoing";
  constraintNote: string;
  penaltyMode: "balanced" | "off";
  narrativeIntensity: "low" | "normal" | "high";
  reducedMotion: boolean;
}

const DAYS = [
  [1, "Lun"], [2, "Mar"], [3, "Mié"], [4, "Jue"], [5, "Vie"], [6, "Sáb"], [7, "Dom"],
] as const;

const GOALS = [
  ["strength", "Ganar fuerza"],
  ["body_composition", "Verme más definido (composición corporal)"],
  ["general_health", "Salud y forma general"],
  ["endurance", "Resistencia"],
  ["mobility", "Movilidad"],
] as const;

const EXPERIENCE = [
  ["new", "Nunca he entrenado de forma regular"],
  ["returning", "He entrenado antes y estoy retomando"],
  ["intermediate", "Entreno con regularidad"],
  ["advanced", "Entreno con regularidad desde hace años"],
] as const;

export function ProfileForm({
  initial, exercises, areas, submitLabel,
}: {
  initial: ProfileFormValues;
  exercises: { id: string; name: string }[];
  areas: { id: string; label: string }[];
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveOnboarding, {});
  const [tz, setTz] = useState(initial.timeZone ?? "Europe/Madrid");
  const [hasDb, setHasDb] = useState(initial.hasDumbbells);
  const fe = state.fieldErrors ?? {};

  useEffect(() => {
    if (!initial.timeZone) {
      try { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid"); } catch { /* sin cambios */ }
    }
  }, [initial.timeZone]);

  const err = (k: string) => fe[k] ? <span className="field-error" id={`${k}-err`} role="alert">{fe[k]}</span> : null;

  return (
    <form action={action} className="grid" noValidate>
      {state.error && <div className="alert alert-error" role="alert"><strong>Error:</strong>{state.error}</div>}

      <fieldset className="system-window">
        <legend className="label">1 · Identidad</legend>
        <div className="field">
          <label htmlFor="alias">Alias de cazador</label>
          <input id="alias" name="alias" defaultValue={initial.alias} required maxLength={40} aria-invalid={!!fe.alias} />
          {err("alias")}
        </div>
        <div className="field">
          <label htmlFor="timeZone">Zona horaria</label>
          <input id="timeZone" name="timeZone" value={tz} onChange={(e) => setTz(e.target.value)} required />
          <span className="hint">Se detecta automáticamente. Decide qué día es «hoy» para tus misiones.</span>
          {err("timeZone")}
        </div>
        <input type="hidden" name="units" value="metric" />
        <label className="check">
          <input type="checkbox" name="adultConfirmed" defaultChecked={initial.adultConfirmed} required />
          Confirmo que soy mayor de edad.
        </label>
        {err("adultConfirmed")}
      </fieldset>

      <fieldset className="system-window">
        <legend className="label">2 · Experiencia y objetivo</legend>
        <div className="field" role="radiogroup" aria-labelledby="exp-l">
          <span id="exp-l" className="field-label">Experiencia</span>
          {EXPERIENCE.map(([v, l]) => (
            <label key={v} className="check"><input type="radio" name="experience" value={v} defaultChecked={initial.experience === v} /> {l}</label>
          ))}
          {err("experience")}
        </div>
        <div className="field">
          <label htmlFor="recentActivity">Actividad reciente (opcional)</label>
          <input id="recentActivity" name="recentActivity" defaultValue={initial.recentActivity} maxLength={300} placeholder="Qué has hecho en los últimos meses" />
        </div>
        <div className="field" role="radiogroup" aria-labelledby="goal-l">
          <span id="goal-l" className="field-label">Objetivo principal</span>
          {GOALS.map(([v, l]) => (
            <label key={v} className="check"><input type="radio" name="primaryGoal" value={v} defaultChecked={initial.primaryGoal === v} /> {l}</label>
          ))}
          {err("primaryGoal")}
        </div>
        <details>
          <summary>Objetivos secundarios (opcional)</summary>
          {GOALS.map(([v, l]) => (
            <label key={v} className="check"><input type="checkbox" name="secondaryGoals" value={v} defaultChecked={initial.secondaryGoals.includes(v)} /> {l}</label>
          ))}
        </details>
      </fieldset>

      <fieldset className="system-window">
        <legend className="label">3 · Disponibilidad</legend>
        <div className="field">
          <span className="field-label" id="days-l">Días en los que quieres entrenar</span>
          <div className="chip-row" role="group" aria-labelledby="days-l">
            {DAYS.map(([v, l]) => (
              <label key={v} className="chip"><input type="checkbox" name="trainingDays" value={v} defaultChecked={initial.trainingDays.includes(v)} /><span>{l}</span></label>
            ))}
          </div>
          <span className="hint">Los demás días serán de descanso planificado, que también cuenta.</span>
          {err("trainingDays")}
        </div>
        <div className="field">
          <label htmlFor="minutesPerSession">Minutos reales por sesión (incluye calentamiento)</label>
          <input id="minutesPerSession" name="minutesPerSession" type="number" inputMode="numeric" min={10} max={90} step={1} defaultValue={initial.minutesPerSession ?? 20} required />
          {err("minutesPerSession")}
        </div>
      </fieldset>

      <fieldset className="system-window">
        <legend className="label">4 · Lugar y material</legend>
        <div className="field" role="radiogroup" aria-labelledby="loc-l">
          <span id="loc-l" className="field-label">Dónde entrenas</span>
          {([["home", "Casa"], ["gym", "Gimnasio"], ["outdoor", "Exterior"], ["mixed", "Combinación"]] as const).map(([v, l]) => (
            <label key={v} className="check"><input type="radio" name="location" value={v} defaultChecked={(initial.location ?? "home") === v} /> {l}</label>
          ))}
        </div>
        <label className="check"><input type="checkbox" name="hasDumbbells" checked={hasDb} onChange={(e) => setHasDb(e.target.checked)} /> Tengo mancuernas</label>
        {hasDb && (
          <div className="field">
            <label htmlFor="dumbbellLoads">Pesos que puedes usar con ellas</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input id="dumbbellLoads" name="dumbbellLoads" defaultValue={initial.dumbbellLoads} placeholder="p. ej. 4, 6, 8, 10, 12" style={{ flex: 1, minWidth: 0 }} aria-describedby="loads-h" aria-invalid={!!fe.dumbbellLoads} />
              <select name="loadUnit" defaultValue={initial.loadUnit} aria-label="Unidad">
                <option value="kg">kg</option>
                <option value="lb">lb</option>
              </select>
            </div>
            <span className="hint" id="loads-h">Si son fijas, escribe solo su peso. Si son ajustables, todos los pesos que puedes montar, por mancuerna.</span>
            {err("dumbbellLoads")}
          </div>
        )}
        <label className="check"><input type="checkbox" name="hasMat" defaultChecked={initial.hasMat} /> Tengo esterilla</label>
        <p className="small muted">Una mesa o encimera estable y una silla se usan como apoyo en algunos ejercicios.</p>
      </fieldset>

      <fieldset className="system-window">
        <legend className="label">5 · Limitaciones y preferencias</legend>
        <p className="small muted">Solo lo que quieras declarar. No es un diagnóstico: sirve para elegir variantes más cómodas.</p>
        <div className="chip-row" role="group" aria-label="Zonas con molestias">
          {areas.map((a) => (
            <label key={a.id} className="chip"><input type="checkbox" name="constraintAreas" value={a.id} defaultChecked={initial.constraintAreas.includes(a.id)} /><span>{a.label}</span></label>
          ))}
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label htmlFor="constraintPattern">Frecuencia</label>
          <select id="constraintPattern" name="constraintPattern" defaultValue={initial.constraintPattern}>
            <option value="occasional">De vez en cuando</option>
            <option value="ongoing">Habitual</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="constraintNote">Nota (opcional)</label>
          <input id="constraintNote" name="constraintNote" defaultValue={initial.constraintNote} maxLength={300} />
        </div>
        <details>
          <summary>Ejercicios que prefieres evitar</summary>
          <div className="grid" style={{ gap: 4, marginTop: 8 }}>
            {exercises.map((e) => (
              <label key={e.id} className="check"><input type="checkbox" name="exerciseAvoid" value={e.id} defaultChecked={initial.exerciseAvoid.includes(e.id)} /> {e.name}</label>
            ))}
          </div>
        </details>
        <div className="field" style={{ marginTop: 10 }}>
          <label htmlFor="exerciseLikes">Ejercicios o actividades que te gustan (opcional)</label>
          <input id="exerciseLikes" name="exerciseLikes" defaultValue={initial.exerciseLikes} maxLength={300} placeholder="Separados por comas" />
        </div>
      </fieldset>

      <fieldset className="system-window">
        <legend className="label">6 · Juego</legend>
        <div className="field">
          <label htmlFor="penaltyMode">Penalizaciones</label>
          <select id="penaltyMode" name="penaltyMode" defaultValue={initial.penaltyMode}>
            <option value="balanced">Equilibradas (recomendado)</option>
            <option value="off">Sin penalizaciones</option>
          </select>
          <span className="hint">Equilibradas: si omites una misión sin reprogramarla, baja un poco la barra de impulso. Nunca se pierde nivel, XP ni equipo.</span>
        </div>
        <div className="field">
          <label htmlFor="narrativeIntensity">Narrativa</label>
          <select id="narrativeIntensity" name="narrativeIntensity" defaultValue={initial.narrativeIntensity}>
            <option value="low">Breve</option>
            <option value="normal">Normal</option>
            <option value="high">Inmersiva</option>
          </select>
        </div>
        <label className="check"><input type="checkbox" name="reducedMotion" defaultChecked={initial.reducedMotion} /> Reducir animaciones</label>
        <p className="small muted">Peso, medidas y fotos no se piden: no son necesarios para tu plan ni para progresar en el juego.</p>
      </fieldset>

      <button className="btn btn-primary btn-block" type="submit" disabled={pending}>{pending ? "Guardando…" : submitLabel}</button>
    </form>
  );
}
