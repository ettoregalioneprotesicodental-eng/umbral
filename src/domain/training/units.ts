/**
 * Cantidades con unidad explícita. Nunca se guarda un «10» sin saber qué significa.
 */
export type LoadUnit = "kg" | "lb";
export interface Load { value: number; unit: LoadUnit }

export type Target =
  | { kind: "reps"; min: number; max: number }
  | { kind: "seconds"; min: number; max: number };

export const LB_PER_KG = 2.2046226218;

export function toKg(load: Load): number {
  return load.unit === "kg" ? load.value : load.value / LB_PER_KG;
}

/** Compara cargas solo si comparten unidad; si no, devuelve null (no comparable). */
export function compareLoads(a: Load | null, b: Load | null): number | null {
  if (a === null && b === null) return 0;
  if (a === null || b === null) return null;
  if (a.unit !== b.unit) return null;
  return a.value - b.value;
}

export function formatLoad(load: Load | null): string {
  if (!load) return "peso corporal";
  return `${Number.isInteger(load.value) ? load.value : load.value.toFixed(1)} ${load.unit}`;
}

export function formatTarget(t: Target): string {
  const range = t.min === t.max ? `${t.min}` : `${t.min}–${t.max}`;
  return t.kind === "reps" ? `${range} reps` : `${range} s`;
}
