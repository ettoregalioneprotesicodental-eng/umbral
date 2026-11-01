import { describe, expect, it } from "vitest";
import { defaultTrainingDays, generateSession, makeAllowed, sessionKindFor, type PlannerContext } from "@/domain/training/planner";
import { validatePrescription } from "@/domain/training/validate";
import { equipmentContext } from "@/domain/training/equipment";
import { EXERCISES, getExercise } from "@/domain/training/catalog";
import type { ExercisePerformance } from "@/domain/training/types";

const homeDumbbells = equipmentContext([
  { kind: "dumbbell", label: "Mancuernas", count: 2, loads: [4, 6, 8, 10, 12].map((v) => ({ value: v, unit: "kg" as const })) },
  { kind: "mat", label: "Esterilla" },
]);

function ctx(over: Partial<PlannerContext> = {}): PlannerContext {
  return {
    kind: "strength_a",
    equipment: homeDumbbells,
    profileMinutes: 15,
    checkin: null,
    declaredAreas: [],
    avoid: [],
    historyByExercise: new Map(),
    lastExerciseBySlot: new Map(),
    daysSinceLastTraining: null,
    shortMode: false,
    ...over,
  };
}

describe("calendario", () => {
  it("5 días: A, B, movilidad, A, B y dos descansos", () => {
    const days = defaultTrainingDays(5);
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => sessionKindFor(d, days))).toEqual([
      "strength_a", "strength_b", "mobility", "strength_a", "strength_b", "rest", "rest",
    ]);
  });
});

describe("AC02: sesión compatible con poco tiempo y material limitado", () => {
  for (const minutes of [10, 15, 20]) {
    for (const kind of ["strength_a", "strength_b", "mobility"] as const) {
      it(`${kind} cabe en ${minutes} min con mancuernas y esterilla`, () => {
        const c = ctx({ kind, profileMinutes: minutes });
        const s = generateSession(c);
        expect(s.exercises.length).toBeGreaterThanOrEqual(kind === "mobility" ? 1 : 2);
        expect(s.estimatedMinutes).toBeLessThanOrEqual(minutes);
        const v = validatePrescription(s, { equipment: homeDumbbells, avoid: [], budgetMinutes: minutes, isAllowed: makeAllowed(c) });
        expect(v.errors).toEqual([]);
      });
    }
  }

  it("sin mancuernas solo usa ejercicios sin carga", () => {
    const eq = equipmentContext([{ kind: "mat", label: "Esterilla" }]);
    const s = generateSession(ctx({ equipment: eq }));
    for (const e of s.exercises) {
      expect(getExercise(e.exerciseId)!.equipment).not.toContain("dumbbell");
      expect(e.load).toBeNull();
    }
  });

  it("nunca prescribe más carga de la disponible", () => {
    const s = generateSession(ctx());
    for (const e of s.exercises) if (e.load) expect(e.load.value).toBeLessThanOrEqual(12);
  });

  it("la versión abreviada es más corta", () => {
    const full = generateSession(ctx({ profileMinutes: 20 }));
    const short = generateSession(ctx({ profileMinutes: 20, shortMode: true }));
    expect(short.estimatedMinutes).toBeLessThanOrEqual(10);
    expect(short.estimatedMinutes).toBeLessThan(full.estimatedMinutes);
  });

  it("respeta el tiempo disponible del chequeo", () => {
    const s = generateSession(ctx({ profileMinutes: 20, checkin: { availableMinutes: 10, energy: 3, fatigue: 2, discomfort: "none", areas: [] } }));
    expect(s.estimatedMinutes).toBeLessThanOrEqual(10);
  });
});

describe("restricciones", () => {
  it("con molestia lumbar declarada evita la bisagra con carga sobre la columna", () => {
    const s = generateSession(ctx({ kind: "strength_b", declaredAreas: ["lumbar"] }));
    const ids = s.exercises.map((e) => e.exerciseId);
    expect(ids).not.toContain("db_romanian_deadlift");
    expect(ids).toContain("glute_bridge");
    for (const id of ids) expect(getExercise(id)!.spinalLoad).toBe("low");
  });

  it("molestia de rodilla hoy retira sentadillas y zancadas", () => {
    const s = generateSession(ctx({ kind: "strength_a", checkin: { availableMinutes: 15, energy: 3, fatigue: 2, discomfort: "moderate", areas: ["rodilla"] } }));
    for (const e of s.exercises) expect(["squat", "lunge"]).not.toContain(getExercise(e.exerciseId)!.pattern);
  });

  it("AC10: una señal de alarma detiene la sesión sin ejercicios", () => {
    const s = generateSession(ctx({ checkin: { availableMinutes: 15, energy: 3, fatigue: 2, discomfort: "red_flag", areas: [] } }));
    expect(s.exercises).toHaveLength(0);
    expect(s.title).toContain("seguridad");
  });

  it("los ejercicios a evitar no aparecen", () => {
    const s = generateSession(ctx({ avoid: ["goblet_squat", "box_squat_bw"] }));
    expect(s.exercises.map((e) => e.exerciseId)).not.toContain("goblet_squat");
  });
});

describe("AC09: la validación rechaza propuestas fuera de límites", () => {
  const good = generateSession(ctx());
  const vctx = { equipment: homeDumbbells, avoid: [], budgetMinutes: 15 };
  it("demasiadas series", () => {
    const bad = { ...good, exercises: good.exercises.map((e) => ({ ...e, sets: 8 })) };
    expect(validatePrescription(bad, vctx).ok).toBe(false);
  });
  it("carga mayor que el material", () => {
    const bad = { ...good, exercises: good.exercises.map((e, i) => (i === 0 ? { ...e, load: { value: 30, unit: "kg" as const } } : e)) };
    expect(validatePrescription(bad, vctx).errors.join(" ")).toContain("supera tu material");
  });
  it("ejercicio inventado", () => {
    const bad = { ...good, exercises: [{ ...good.exercises[0]!, exerciseId: "burpee_con_salto_mortal" }] };
    expect(validatePrescription(bad, vctx).ok).toBe(false);
  });
  it("duración superior al tiempo", () => {
    expect(validatePrescription(good, { ...vctx, budgetMinutes: 5 }).ok).toBe(false);
  });
});

describe("catálogo", () => {
  it("cada ficha tiene los campos obligatorios y referencias válidas", () => {
    for (const e of EXERCISES) {
      expect(e.setup.length).toBeGreaterThan(0);
      expect(e.execution.length).toBeGreaterThan(0);
      expect(e.stopSignals.length).toBeGreaterThan(0);
      expect(e.sources.length).toBeGreaterThan(0);
      expect(e.visual).toBeNull();
      for (const ref of [e.easier, e.harder, e.otherEquipment]) if (ref) expect(getExercise(ref), `${e.id} → ${ref}`).toBeDefined();
    }
  });
  it("identificadores únicos", () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
  });
});

export const _h: ExercisePerformance[] = [];
