import { describe, expect, it } from "vitest";
import { decideProgression } from "@/domain/training/progression";
import { equipmentContext } from "@/domain/training/equipment";
import { requireExercise } from "@/domain/training/catalog";
import type { ExercisePerformance, PerformedSet } from "@/domain/training/types";
import type { Load } from "@/domain/training/units";

const eq = equipmentContext([
  { kind: "dumbbell", label: "M", loads: [6, 8, 10, 12].map((v) => ({ value: v, unit: "kg" as const })) },
  { kind: "mat", label: "E" },
]);
const kg = (v: number): Load => ({ value: v, unit: "kg" });
const set = (reps: number, load: Load | null = kg(8), extra: Partial<PerformedSet> = {}): PerformedSet =>
  ({ kind: "working", reps, seconds: null, load, rir: null, discomfort: false, ...extra });
const perf = (date: string, sets: PerformedSet[], load: Load | null = kg(8), id = "goblet_squat"): ExercisePerformance =>
  ({ localDate: date, exerciseId: id, target: { kind: "reps", min: 8, max: 12 }, plannedSets: 2, plannedLoad: load, sets });

const base = {
  exercise: requireExercise("goblet_squat"),
  defaultSets: 2,
  defaultLoad: kg(8),
  equipment: eq,
  lowReadiness: false,
  daysSinceLastTraining: 2,
  isAllowed: () => true,
};

describe("motor de progresión", () => {
  it("sin historial calibra de forma conservadora", () => {
    const o = decideProgression({ ...base, history: [] });
    expect(o.decision.kind).toBe("calibrate");
    expect(o.sets).toBe(2);
  });

  it("AC08: una sola sesión no basta para progresar", () => {
    const o = decideProgression({ ...base, history: [perf("2026-11-03", [set(12), set(12)])] });
    expect(o.decision.kind).toBe("maintain");
    expect(o.load).toEqual(kg(8));
  });

  it("progresión doble: consolida el rango dos veces y sube a la siguiente carga", () => {
    const o = decideProgression({ ...base, history: [perf("2026-11-05", [set(12), set(12)]), perf("2026-11-03", [set(12), set(12)])] });
    expect(o.decision.kind).toBe("progress");
    expect(o.load).toEqual(kg(10));
    expect(o.sets).toBe(2); // una sola palanca: no sube series a la vez
  });

  it("sin carga mayor disponible pasa a una variante más difícil", () => {
    const h = [perf("2026-11-05", [set(12, kg(12)), set(12, kg(12))], kg(12)), perf("2026-11-03", [set(12, kg(12)), set(12, kg(12))], kg(12))];
    const o = decideProgression({ ...base, defaultLoad: kg(12), history: h });
    expect(o.decision.kind).toBe("progress");
    expect(o.exerciseId).toBe("pause_goblet_squat");
    expect(o.load).toEqual(kg(12));
  });

  it("esfuerzo declarado alto impide progresar", () => {
    const hard = { rir: 0 };
    const o = decideProgression({ ...base, history: [perf("2026-11-05", [set(12, kg(8), hard), set(12, kg(8), hard)]), perf("2026-11-03", [set(12, kg(8), hard), set(12, kg(8), hard)])] });
    expect(o.decision.kind).toBe("maintain");
    expect(o.decision.reason).toContain("esfuerzo");
  });

  it("AC08: registros anómalos (repeticiones imposibles o unidad equivocada) no activan progresión", () => {
    const h = [
      perf("2026-11-05", [set(120), set(12, { value: 12, unit: "lb" })]),
      perf("2026-11-03", [set(500), set(999)]),
    ];
    const o = decideProgression({ ...base, history: h });
    expect(o.decision.kind).toBe("maintain");
    expect(o.discarded).toBeGreaterThan(0);
  });

  it("carga superior al material se descarta", () => {
    const h = [perf("2026-11-05", [set(12, kg(40)), set(12, kg(40))]), perf("2026-11-03", [set(12, kg(40)), set(12, kg(40))])];
    const o = decideProgression({ ...base, history: h });
    expect(o.decision.kind).toBe("maintain");
  });

  it("dos sesiones por debajo del rango reducen la carga", () => {
    const o = decideProgression({ ...base, history: [perf("2026-11-05", [set(5), set(4)]), perf("2026-11-03", [set(6), set(5)])] });
    expect(o.decision.kind).toBe("reduce");
    expect(o.load).toEqual(kg(6));
  });

  it("una molestia registrada sustituye por la variante más fácil", () => {
    const o = decideProgression({ ...base, history: [perf("2026-11-05", [set(10, kg(8), { discomfort: true })])] });
    expect(o.decision.kind).toBe("substitute");
    expect(o.exerciseId).toBe("box_squat_bw");
  });

  it("fatiga alta hoy: baja una serie y no progresa", () => {
    const o = decideProgression({ ...base, lowReadiness: true, history: [perf("2026-11-05", [set(12), set(12)]), perf("2026-11-03", [set(12), set(12)])] });
    expect(o.decision.kind).toBe("reduce");
    expect(o.sets).toBe(1);
    expect(o.load).toEqual(kg(8));
  });

  it("regreso tras pausa larga recalibra un paso por debajo sin acumular", () => {
    const o = decideProgression({ ...base, daysSinceLastTraining: 30, history: [perf("2026-10-01", [set(12), set(12)])] });
    expect(o.decision.kind).toBe("reduce");
    expect(o.load).toEqual(kg(6));
    expect(o.sets).toBe(2);
  });
});
