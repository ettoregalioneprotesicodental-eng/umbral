import type { EquipmentItem } from "@/lib/db/schema";
import type { Exercise } from "./catalog";
import type { EquipmentContext } from "./types";
import type { Load } from "./units";

export function equipmentContext(items: EquipmentItem[]): EquipmentContext {
  const dumbbells = items.filter((i) => i.kind === "dumbbell");
  const loads: Load[] = [];
  const seen = new Set<string>();
  for (const d of dumbbells) {
    for (const l of d.loads ?? []) {
      if (!(l.value > 0) || l.value > 200) continue;
      const k = `${l.value}${l.unit}`;
      if (!seen.has(k)) { seen.add(k); loads.push({ value: l.value, unit: l.unit }); }
    }
  }
  loads.sort((a, b) => a.value - b.value);
  return { hasDumbbells: dumbbells.length > 0, hasMat: items.some((i) => i.kind === "mat"), dumbbellLoads: loads };
}

export function hasEquipmentFor(ex: Exercise, ctx: EquipmentContext): boolean {
  return ex.equipment.every((k) => {
    if (k === "dumbbell") return ctx.hasDumbbells;
    if (k === "mat") return ctx.hasMat;
    return true; // "wall" (pared/mesa estable) y "none"
  });
}

export function maxLoad(ctx: EquipmentContext): Load | null {
  return ctx.dumbbellLoads.at(-1) ?? null;
}

/** Siguiente carga disponible estrictamente mayor, en la misma unidad. */
export function nextLoadUp(current: Load, ctx: EquipmentContext): Load | null {
  return ctx.dumbbellLoads.find((l) => l.unit === current.unit && l.value > current.value) ?? null;
}

export function nextLoadDown(current: Load, ctx: EquipmentContext): Load | null {
  const lower = ctx.dumbbellLoads.filter((l) => l.unit === current.unit && l.value < current.value);
  return lower.at(-1) ?? null;
}
