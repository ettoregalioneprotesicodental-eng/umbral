import { getExercise, type Exercise } from "./catalog";
import { maxLoad, nextLoadDown, nextLoadUp } from "./equipment";
import { TRAINING_RULES_V1, type TrainingRules } from "./rules";
import type { EquipmentContext, ExercisePerformance, PerformedSet, ProgressionDecision } from "./types";
import type { Load, Target } from "./units";

export interface ProgressionInput {
  exercise: Exercise;
  /** Prescripción por defecto si no hay historial. */
  defaultSets: number;
  defaultLoad: Load | null;
  /** Historial del mismo ejercicio, del más reciente al más antiguo. */
  history: ExercisePerformance[];
  equipment: EquipmentContext;
  /** Si el chequeo de hoy indica fatiga alta o energía baja. */
  lowReadiness: boolean;
  /** Días desde la última sesión de entrenamiento registrada (null = nunca). */
  daysSinceLastTraining: number | null;
  /** Ejercicios permitidos hoy (material, preferencias, molestias). */
  isAllowed: (id: string) => boolean;
}

export interface ProgressionOutput {
  exerciseId: string;
  sets: number;
  target: Target;
  load: Load | null;
  decision: ProgressionDecision;
  /** Registros descartados por anómalos (para trazabilidad). */
  discarded: number;
}

/** Filtra series con datos imposibles o no comparables (AC08). */
export function cleanSets(
  sets: PerformedSet[],
  target: Target,
  equipment: EquipmentContext,
  rules: TrainingRules = TRAINING_RULES_V1,
): { valid: PerformedSet[]; discarded: number } {
  const p = rules.progression;
  const top = maxLoad(equipment);
  const valid: PerformedSet[] = [];
  let discarded = 0;
  for (const s of sets) {
    if (s.kind !== "working") continue;
    let ok = true;
    if (target.kind === "reps") {
      if (s.reps === null || !Number.isInteger(s.reps) || s.reps < 0) ok = false;
      else if (s.reps > p.maxRepsPerSet || s.reps > target.max * p.anomalyRepsFactor) ok = false;
    } else {
      if (s.seconds === null || s.seconds < 0 || s.seconds > p.maxSecondsPerSet || s.seconds > target.max * p.anomalyRepsFactor) ok = false;
    }
    if (s.load) {
      if (!(s.load.value > 0)) ok = false;
      if (top && s.load.unit !== top.unit) ok = false;
      if (top && s.load.unit === top.unit && s.load.value > top.value) ok = false;
    }
    if (ok) valid.push(s);
    else discarded++;
  }
  return { valid, discarded };
}

function value(s: PerformedSet, target: Target): number {
  return target.kind === "reps" ? (s.reps ?? 0) : (s.seconds ?? 0);
}

function sameLoad(a: Load | null, b: Load | null): boolean {
  if (a === null || b === null) return a === b;
  return a.unit === b.unit && a.value === b.value;
}

export function decideProgression(input: ProgressionInput, rules: TrainingRules = TRAINING_RULES_V1): ProgressionOutput {
  const { exercise, equipment } = input;
  const p = rules.progression;
  const target = exercise.defaultTarget;
  const last = input.history[0];

  // 0) Sin historial: calibración conservadora, lejos del fallo y sin tests máximos.
  if (!last) {
    return {
      exerciseId: exercise.id,
      sets: input.defaultSets,
      target,
      load: input.defaultLoad,
      decision: {
        kind: "calibrate",
        reason: exercise.loadable
          ? "Primera vez: elige una carga con la que te queden unas 3 repeticiones en reserva y registra la que uses."
          : "Primera vez: haz las repeticiones con buena técnica dejando unas 3 en reserva.",
      },
      discarded: 0,
    };
  }

  const currentLoad = last.plannedLoad ?? last.sets.find((s) => s.load)?.load ?? input.defaultLoad;
  const currentSets = Math.min(rules.exercise.maxSets, Math.max(rules.exercise.minSets, last.plannedSets));

  // 1) Molestia registrada en este ejercicio la última vez: sustituir por una variante más fácil.
  if (last.sets.some((s) => s.discomfort)) {
    const easier = exercise.easier && input.isAllowed(exercise.easier) ? getExercise(exercise.easier) : undefined;
    if (easier) {
      return {
        exerciseId: easier.id,
        sets: currentSets,
        target: easier.defaultTarget,
        load: easier.loadable ? currentLoad : null,
        decision: { kind: "substitute", reason: `Registraste una molestia en ${exercise.name.toLowerCase()} la última vez; usamos una variante más sencilla.` },
        discarded: 0,
      };
    }
    return {
      exerciseId: exercise.id,
      sets: Math.max(1, currentSets - 1),
      target,
      load: currentLoad && exercise.loadable ? (nextLoadDown(currentLoad, equipment) ?? currentLoad) : currentLoad,
      decision: { kind: "reduce", reason: "Registraste una molestia la última vez; reducimos el trabajo de este ejercicio." },
      discarded: 0,
    };
  }

  // 2) Regreso tras una pausa larga: recalibrar a la baja, sin recuperar sesiones atrasadas.
  if (input.daysSinceLastTraining !== null && input.daysSinceLastTraining >= rules.returnAfterBreak.days) {
    return {
      exerciseId: exercise.id,
      sets: Math.min(currentSets, rules.calibration.initialSets),
      target,
      load: currentLoad && exercise.loadable ? (nextLoadDown(currentLoad, equipment) ?? currentLoad) : currentLoad,
      decision: { kind: "reduce", reason: `Han pasado ${input.daysSinceLastTraining} días desde tu último entrenamiento; retomamos un paso por debajo.` },
      discarded: 0,
    };
  }

  // 3) Comparables: mismo ejercicio, misma carga planificada, series válidas.
  let discarded = 0;
  const comparable = input.history
    .filter((h) => h.exerciseId === exercise.id && sameLoad(h.plannedLoad, currentLoad))
    .slice(0, 3)
    .map((h) => {
      const c = cleanSets(h.sets, target, equipment, rules);
      discarded += c.discarded;
      return { h, valid: c.valid };
    })
    .filter((x) => x.valid.length > 0);

  const base = { exerciseId: exercise.id, sets: currentSets, target, load: currentLoad, discarded };

  // 4) Hoy hay poca energía o mucha fatiga: no se progresa.
  if (input.lowReadiness) {
    return {
      ...base,
      sets: Math.max(1, currentSets - 1),
      decision: { kind: "reduce", reason: "Hoy declaras fatiga alta o poca energía; bajamos una serie y no subimos dificultad." },
    };
  }

  if (comparable.length < p.minComparableSessions) {
    return {
      ...base,
      decision: {
        kind: "maintain",
        reason:
          discarded > 0
            ? "Mantengo la prescripción: algunos registros parecen erróneos (unidades o cifras fuera de rango) y no se usan para progresar."
            : "Mantengo la prescripción: aún faltan sesiones comparables para decidir un cambio.",
      },
    };
  }

  const recent = comparable.slice(0, p.sessionsBelowRangeToReduce);
  const belowRange = recent.length >= p.sessionsBelowRangeToReduce && recent.every(({ valid }) => {
    const avg = valid.reduce((s, x) => s + value(x, target), 0) / valid.length;
    return avg < target.min;
  });
  if (belowRange) {
    const lower = currentLoad && exercise.loadable ? nextLoadDown(currentLoad, equipment) : null;
    if (lower) {
      return { ...base, load: lower, decision: { kind: "reduce", reason: "En las dos últimas sesiones comparables quedaste por debajo del rango; bajamos a la carga anterior." } };
    }
    const easier = exercise.easier && input.isAllowed(exercise.easier) ? getExercise(exercise.easier) : undefined;
    if (easier) {
      return {
        ...base,
        exerciseId: easier.id,
        target: easier.defaultTarget,
        load: easier.loadable ? currentLoad : null,
        decision: { kind: "substitute", reason: "En las dos últimas sesiones comparables quedaste por debajo del rango; pasamos a una variante más sencilla." },
      };
    }
    return { ...base, sets: Math.max(1, currentSets - 1), decision: { kind: "reduce", reason: "Quedaste por debajo del rango dos veces; reducimos una serie." } };
  }

  const two = comparable.slice(0, p.minComparableSessions);
  const topped = two.every(({ h, valid }) => {
    if (valid.length < h.plannedSets) return false;
    return valid.every((s) => value(s, target) >= target.max);
  });
  const effortOk = two.every(({ valid }) =>
    valid.every((s) => s.rir === null || s.rir >= rules.calibration.targetRir - p.rirMargin),
  );

  if (topped && !effortOk) {
    return { ...base, decision: { kind: "maintain", reason: "Completaste el rango, pero el esfuerzo declarado fue alto; mantenemos para consolidar." } };
  }

  if (topped) {
    // Una sola palanca cada vez: carga → variante → series.
    const up = currentLoad && exercise.loadable ? nextLoadUp(currentLoad, equipment) : null;
    if (up) {
      return {
        ...base,
        load: up,
        decision: { kind: "progress", reason: `Consolidaste el rango en ${two.length} sesiones comparables sin molestias; subimos a ${up.value} ${up.unit} y empiezas por la parte baja del rango.` },
      };
    }
    const harder = exercise.harder && input.isAllowed(exercise.harder) ? getExercise(exercise.harder) : undefined;
    if (harder) {
      return {
        ...base,
        exerciseId: harder.id,
        target: harder.defaultTarget,
        load: harder.loadable ? currentLoad : null,
        decision: { kind: "progress", reason: `Consolidaste el rango y no hay una carga mayor disponible; pasamos a ${harder.name.toLowerCase()}.` },
      };
    }
    if (currentSets < p.addSetCeiling) {
      return { ...base, sets: currentSets + 1, decision: { kind: "progress", reason: "Consolidaste el rango y no hay más carga ni variante; añadimos una serie dentro del límite." } };
    }
    return { ...base, decision: { kind: "maintain", reason: "Has llegado al techo de este ejercicio con tu material; mantenemos y consolidamos." } };
  }

  return { ...base, decision: { kind: "maintain", reason: "Mantengo esta prescripción: aún no completas todo el rango en sesiones comparables." } };
}
