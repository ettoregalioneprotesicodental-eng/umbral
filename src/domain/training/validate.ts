import { getExercise } from "./catalog";
import { hasEquipmentFor, maxLoad } from "./equipment";
import { estimateMinutes } from "./planner";
import { TRAINING_RULES_V1, type TrainingRules } from "./rules";
import type { EquipmentContext, SessionPrescription } from "./types";

export interface ValidationContext {
  equipment: EquipmentContext;
  avoid: string[];
  budgetMinutes: number;
  isAllowed?: (id: string) => boolean;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Capa de validación determinista. Toda prescripción (generada por reglas o propuesta por Claude)
 * pasa por aquí antes de guardarse. Si falla, no se guarda (AC09).
 */
export function validatePrescription(
  p: SessionPrescription,
  ctx: ValidationContext,
  rules: TrainingRules = TRAINING_RULES_V1,
): ValidationResult {
  const errors: string[] = [];
  const top = maxLoad(ctx.equipment);
  let workingSets = 0;
  const avoid = new Set(ctx.avoid);

  if (p.kind === "rest" && p.exercises.length > 0) errors.push("Un descanso no puede contener ejercicios.");

  for (const e of p.exercises) {
    const ex = getExercise(e.exerciseId);
    if (!ex) { errors.push(`Ejercicio fuera del catálogo revisado: ${e.exerciseId}`); continue; }
    if (avoid.has(ex.id)) errors.push(`${ex.name} está en tu lista de ejercicios a evitar.`);
    if (!hasEquipmentFor(ex, ctx.equipment)) errors.push(`${ex.name} requiere material que no tienes.`);
    if (ctx.isAllowed && !ctx.isAllowed(ex.id)) errors.push(`${ex.name} no es compatible con las restricciones de hoy.`);
    if (!Number.isInteger(e.sets) || e.sets < rules.exercise.minSets || e.sets > rules.exercise.maxSets) {
      errors.push(`${ex.name}: ${e.sets} series fuera del límite ${rules.exercise.minSets}–${rules.exercise.maxSets}.`);
    }
    if (e.target.kind !== ex.defaultTarget.kind) errors.push(`${ex.name}: tipo de objetivo incorrecto (${e.target.kind}).`);
    if (!(e.target.min > 0) || e.target.min > e.target.max) errors.push(`${ex.name}: rango objetivo inválido.`);
    if (e.target.kind === "reps" && e.target.max > rules.progression.maxRepsPerSet) errors.push(`${ex.name}: demasiadas repeticiones por serie.`);
    if (e.target.kind === "seconds" && e.target.max > rules.progression.maxSecondsPerSet) errors.push(`${ex.name}: duración por serie excesiva.`);
    if (e.restSeconds < 0 || e.restSeconds > 300) errors.push(`${ex.name}: descanso fuera de límites.`);
    if (e.load) {
      if (!ex.loadable) errors.push(`${ex.name} no admite carga externa.`);
      if (!(e.load.value > 0)) errors.push(`${ex.name}: carga inválida.`);
      if (!top) errors.push(`${ex.name}: no hay cargas declaradas en tu material.`);
      else if (e.load.unit !== top.unit || e.load.value > top.value) errors.push(`${ex.name}: la carga supera tu material disponible.`);
    }
    if (ex.pattern !== "mobility" && ex.pattern !== "conditioning") workingSets += e.sets;
  }

  if (workingSets > rules.session.maxWorkingSetsPerSession) {
    errors.push(`Demasiadas series efectivas en la sesión (${workingSets} > ${rules.session.maxWorkingSetsPerSession}).`);
  }
  const est = estimateMinutes(p.exercises.filter((e) => getExercise(e.exerciseId)), p.warmup, rules);
  if (est > ctx.budgetMinutes) errors.push(`La sesión estimada (${est} min) supera tu tiempo (${ctx.budgetMinutes} min).`);

  return { ok: errors.length === 0, errors };
}
