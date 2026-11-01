import { EXERCISES, getExercise, requireExercise, type Exercise, type MovementPattern } from "./catalog";
import { hasEquipmentFor } from "./equipment";
import { decideProgression } from "./progression";
import { TRAINING_RULES_V1, type TrainingRules } from "./rules";
import type {
  CheckinInput, EquipmentContext, ExercisePerformance, PrescribedExercise, SessionKind, SessionPrescription,
} from "./types";
import type { Load } from "./units";

/* ------------------------------------------------------------------ */
/* Calendario semanal                                                  */
/* ------------------------------------------------------------------ */

const KINDS_BY_DAYS: Record<number, SessionKind[]> = {
  1: ["strength_a"],
  2: ["strength_a", "strength_b"],
  3: ["strength_a", "strength_b", "strength_a"],
  4: ["strength_a", "strength_b", "strength_a", "strength_b"],
  5: ["strength_a", "strength_b", "mobility", "strength_a", "strength_b"],
  6: ["strength_a", "strength_b", "mobility", "strength_a", "strength_b", "mobility"],
  7: ["strength_a", "strength_b", "mobility", "strength_a", "strength_b", "mobility", "mobility"],
};

/** Días por defecto (ISO 1 = lunes … 7 = domingo), repartidos en la semana. */
export function defaultTrainingDays(daysPerWeek: number): number[] {
  const presets: Record<number, number[]> = {
    1: [3], 2: [2, 5], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [1, 2, 3, 4, 5, 6, 7],
  };
  return presets[Math.min(7, Math.max(1, Math.round(daysPerWeek)))]!;
}

/** Qué tipo de misión toca un día de la semana ISO concreto. */
export function sessionKindFor(isoWeekday: number, trainingDays: number[]): SessionKind {
  const days = [...new Set(trainingDays)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  const idx = days.indexOf(isoWeekday);
  if (idx === -1) return "rest";
  return KINDS_BY_DAYS[days.length]![idx]!;
}

/* ------------------------------------------------------------------ */
/* Plantillas                                                          */
/* ------------------------------------------------------------------ */

interface Slot {
  id: string;
  /** Familia de variantes, de más fácil a más difícil. */
  family: string[];
  /** Variante preferida para empezar. */
  preferred: string[];
  priority: number;
}

const TEMPLATES: Record<Exclude<SessionKind, "rest">, { title: string; slots: Slot[] }> = {
  strength_a: {
    title: "Fuerza A · sentadilla, empuje y tracción",
    slots: [
      { id: "squat", family: ["box_squat_bw", "goblet_squat", "pause_goblet_squat"], preferred: ["goblet_squat", "box_squat_bw"], priority: 1 },
      { id: "push_h", family: ["incline_push_up", "push_up", "tempo_push_up", "db_floor_press"], preferred: ["db_floor_press", "incline_push_up", "push_up"], priority: 2 },
      { id: "pull_h", family: ["supported_db_row", "pause_supported_db_row"], preferred: ["supported_db_row"], priority: 3 },
      { id: "core", family: ["dead_bug"], preferred: ["dead_bug"], priority: 4 },
      { id: "calf", family: ["db_calf_raise"], preferred: ["db_calf_raise"], priority: 5 },
    ],
  },
  strength_b: {
    title: "Fuerza B · bisagra, zancada y hombro",
    slots: [
      { id: "hinge", family: ["glute_bridge", "single_leg_glute_bridge", "db_romanian_deadlift"], preferred: ["db_romanian_deadlift", "glute_bridge"], priority: 1 },
      { id: "lunge", family: ["reverse_lunge_bw", "split_squat"], preferred: ["split_squat", "reverse_lunge_bw"], priority: 2 },
      { id: "push_v", family: ["half_kneeling_db_press"], preferred: ["half_kneeling_db_press"], priority: 3 },
      { id: "core", family: ["bird_dog", "side_plank_knees", "side_plank"], preferred: ["side_plank_knees", "bird_dog"], priority: 4 },
      { id: "carry", family: ["suitcase_march"], preferred: ["suitcase_march"], priority: 5 },
    ],
  },
  mobility: {
    title: "Recuperación activa · movilidad",
    slots: [
      { id: "spine", family: ["cat_cow"], preferred: ["cat_cow"], priority: 1 },
      { id: "hip", family: ["hip_flexor_stretch"], preferred: ["hip_flexor_stretch"], priority: 2 },
      { id: "thoracic", family: ["open_book"], preferred: ["open_book"], priority: 3 },
      { id: "control", family: ["bird_dog"], preferred: ["bird_dog"], priority: 4 },
      { id: "walk", family: ["easy_walk"], preferred: ["easy_walk"], priority: 5 },
    ],
  },
};

/* ------------------------------------------------------------------ */
/* Restricciones                                                       */
/* ------------------------------------------------------------------ */

/** Zonas declarables y patrones que las cargan. */
export const AREA_PATTERNS: Record<string, MovementPattern[]> = {
  lumbar: [],
  rodilla: ["squat", "lunge"],
  hombro: ["push_horizontal", "push_vertical"],
  muneca: ["push_horizontal"],
  tobillo: ["calf", "lunge"],
};

export const AREA_LABELS: Record<string, string> = {
  lumbar: "Zona lumbar / ciática",
  rodilla: "Rodilla",
  hombro: "Hombro",
  muneca: "Muñeca",
  tobillo: "Tobillo",
};

export interface PlannerContext {
  kind: SessionKind;
  equipment: EquipmentContext;
  /** Minutos por sesión declarados en el perfil. */
  profileMinutes: number;
  checkin: CheckinInput | null;
  /** Áreas con restricción declarada en el perfil (p. ej. "lumbar"). */
  declaredAreas: string[];
  avoid: string[];
  /** Historial por ejercicio, más reciente primero. */
  historyByExercise: Map<string, ExercisePerformance[]>;
  /** Último ejercicio usado por ranura (para mantener la variante). */
  lastExerciseBySlot: Map<string, string>;
  daysSinceLastTraining: number | null;
  shortMode: boolean;
}

export function makeAllowed(ctx: Pick<PlannerContext, "equipment" | "avoid" | "declaredAreas" | "checkin">) {
  const todayAreas = ctx.checkin && ctx.checkin.discomfort !== "none" ? ctx.checkin.areas : [];
  const blockedPatterns = new Set<MovementPattern>();
  for (const a of todayAreas) for (const p of AREA_PATTERNS[a] ?? []) blockedPatterns.add(p);
  const lumbarSensitive = ctx.declaredAreas.includes("lumbar") || todayAreas.includes("lumbar");
  const avoid = new Set(ctx.avoid);
  return (id: string): boolean => {
    const ex = getExercise(id);
    if (!ex) return false;
    if (avoid.has(id)) return false;
    if (!hasEquipmentFor(ex, ctx.equipment)) return false;
    if (blockedPatterns.has(ex.pattern)) return false;
    if (lumbarSensitive && (ex.spinalLoad !== "low" || ex.loadedLumbarFlexion)) return false;
    return true;
  };
}

/* ------------------------------------------------------------------ */
/* Duración                                                            */
/* ------------------------------------------------------------------ */

export function estimateExerciseSeconds(p: PrescribedExercise, rules: TrainingRules = TRAINING_RULES_V1): number {
  const ex = requireExercise(p.exerciseId);
  const mid = (p.target.min + p.target.max) / 2;
  const sides = ex.unilateral ? 2 : 1;
  const work = p.target.kind === "reps" ? mid * rules.session.secondsPerRep * sides : mid * sides;
  return p.sets * (work + p.restSeconds) + rules.session.transitionSeconds;
}

export function estimateMinutes(exercises: PrescribedExercise[], warmup: boolean, rules: TrainingRules = TRAINING_RULES_V1): number {
  const secs = exercises.reduce((s, e) => s + estimateExerciseSeconds(e, rules), 0);
  return Math.ceil((secs + (warmup ? rules.session.warmupMinutes * 60 : 0)) / 60);
}

/* ------------------------------------------------------------------ */
/* Carga inicial conservadora                                          */
/* ------------------------------------------------------------------ */

const LOWER: MovementPattern[] = ["squat", "lunge", "hinge", "calf", "carry"];

export function initialLoad(ex: Exercise, eq: EquipmentContext): Load | null {
  if (!ex.loadable || !ex.equipment.includes("dumbbell")) return null;
  const loads = eq.dumbbellLoads;
  if (loads.length === 0) return null;
  if (LOWER.includes(ex.pattern)) return loads[Math.floor((loads.length - 1) / 2)]!;
  return loads[0]!;
}

/* ------------------------------------------------------------------ */
/* Generador                                                           */
/* ------------------------------------------------------------------ */

export function budgetFor(ctx: Pick<PlannerContext, "profileMinutes" | "checkin" | "shortMode">, rules: TrainingRules = TRAINING_RULES_V1): number {
  let budget = ctx.profileMinutes;
  if (ctx.checkin?.availableMinutes) budget = Math.min(budget, ctx.checkin.availableMinutes);
  if (ctx.shortMode) budget = Math.min(budget, Math.max(rules.session.minMinutes, Math.round(ctx.profileMinutes / 2)));
  return Math.max(rules.session.minMinutes, Math.min(rules.session.maxMinutes, budget));
}

export function generateSession(ctx: PlannerContext, rules: TrainingRules = TRAINING_RULES_V1): SessionPrescription {
  const budget = budgetFor(ctx, rules);
  const reasons: string[] = [];

  if (ctx.checkin?.discomfort === "red_flag") {
    return {
      kind: "rest", title: "Sesión detenida por seguridad", warmup: false, exercises: [], estimatedMinutes: 0,
      budgetMinutes: budget, shortMode: ctx.shortMode, rulesVersion: rules.version,
      reasons: ["Has indicado un síntoma que requiere atención. Hoy no se propone esfuerzo."],
    };
  }

  if (ctx.kind === "rest") {
    return {
      kind: "rest", title: "Descanso planificado", warmup: false, exercises: [], estimatedMinutes: 0,
      budgetMinutes: budget, shortMode: false, rulesVersion: rules.version,
      reasons: ["Hoy toca descansar. El descanso planificado cuenta como misión cumplida."],
    };
  }

  const template = TEMPLATES[ctx.kind];
  const allowed = makeAllowed(ctx);
  const lowReadiness = Boolean(ctx.checkin && ((ctx.checkin.fatigue ?? 0) >= 4 || (ctx.checkin.energy ?? 5) <= 2));
  const isMobility = ctx.kind === "mobility";
  const paired = !isMobility && budget <= 25;
  const restSeconds = isMobility ? rules.exercise.defaultRest.mobility : paired ? rules.exercise.defaultRest.paired : rules.exercise.defaultRest.strength;

  const exercises: PrescribedExercise[] = [];
  for (const slot of template.slots) {
    const last = ctx.lastExerciseBySlot.get(slot.id);
    const startId =
      (last && slot.family.includes(last) && allowed(last) ? last : undefined) ??
      slot.preferred.find(allowed) ??
      slot.family.find(allowed);
    if (!startId) {
      reasons.push(`Se omite «${slot.id}» hoy: ninguna variante es compatible con tu material, preferencias o molestias.`);
      continue;
    }
    const ex = requireExercise(startId);
    if (isMobility) {
      exercises.push({
        slot: slot.id, exerciseId: ex.id, sets: ex.id === "easy_walk" ? 1 : 2, target: ex.defaultTarget, load: null,
        restSeconds, rirTarget: null, decision: { kind: "maintain", reason: "Movilidad suave en un rango cómodo." },
      });
      continue;
    }
    const out = decideProgression({
      exercise: ex,
      defaultSets: rules.calibration.initialSets,
      defaultLoad: initialLoad(ex, ctx.equipment),
      history: ctx.historyByExercise.get(ex.id) ?? [],
      equipment: ctx.equipment,
      lowReadiness,
      daysSinceLastTraining: ctx.daysSinceLastTraining,
      isAllowed: allowed,
    }, rules);
    const outEx = requireExercise(out.exerciseId);
    exercises.push({
      slot: slot.id,
      exerciseId: out.exerciseId,
      sets: out.sets,
      target: out.target,
      load: out.load,
      restSeconds,
      rirTarget: outEx.defaultTarget.kind === "reps" ? rules.calibration.targetRir : null,
      decision: out.decision,
    });
  }

  if (lowReadiness) reasons.push("Energía baja o fatiga alta: sin subidas de dificultad hoy.");
  if (ctx.declaredAreas.includes("lumbar")) reasons.push("Por la molestia lumbar declarada se eligen variantes con poca carga sobre la columna.");
  if (ctx.checkin && ctx.checkin.discomfort !== "none" && ctx.checkin.areas.length) {
    reasons.push(`Se adaptan los ejercicios que cargan: ${ctx.checkin.areas.map((a) => AREA_LABELS[a] ?? a).join(", ")}.`);
  }
  if (paired) reasons.push("Formato por parejas: alternas dos ejercicios para que quepa en tu tiempo sin acortar la recuperación de cada músculo.");

  // Ajuste al tiempo: quitar ejercicios de menor prioridad, luego series.
  const fitted = fitToBudget(exercises, budget, !isMobility, rules, isMobility);
  if (fitted.removed.length) reasons.push(`Para caber en ${budget} min se omiten: ${fitted.removed.map((id) => requireExercise(id).name).join(", ")}.`);

  const estimatedMinutes = estimateMinutes(fitted.exercises, !isMobility, rules);
  return {
    kind: ctx.kind,
    title: template.title,
    warmup: !isMobility,
    exercises: fitted.exercises,
    estimatedMinutes,
    budgetMinutes: budget,
    shortMode: ctx.shortMode,
    reasons,
    rulesVersion: rules.version,
  };
}

export function fitToBudget(
  input: PrescribedExercise[],
  budget: number,
  warmup: boolean,
  rules: TrainingRules = TRAINING_RULES_V1,
  isMobility = false,
): { exercises: PrescribedExercise[]; removed: string[] } {
  let list = input.map((e) => ({ ...e }));
  const removed: string[] = [];
  const minKeep = isMobility ? 1 : 2;
  const fits = () => estimateMinutes(list, warmup, rules) <= budget;

  // La caminata de movilidad se ajusta en tiempo antes de quitar nada.
  const walk = list.find((e) => e.exerciseId === "easy_walk");
  if (walk && !fits()) {
    const others = list.filter((e) => e !== walk);
    const spare = budget * 60 - (estimateMinutes(others, warmup, rules) * 60) - walk.restSeconds - rules.session.transitionSeconds;
    if (spare >= 180) {
      const s = Math.floor(Math.min(walk.target.max, spare) / 60) * 60;
      walk.target = { kind: "seconds", min: s, max: s };
    } else {
      list = others;
      removed.push("easy_walk");
    }
  }

  while (!fits() && list.length > minKeep) {
    const drop = list[list.length - 1]!;
    list = list.slice(0, -1);
    removed.push(drop.exerciseId);
  }
  // Reducir series empezando por los de menor prioridad.
  for (let i = list.length - 1; i >= 0 && !fits(); i--) {
    while (list[i]!.sets > rules.exercise.minSets && !fits()) list[i]!.sets -= 1;
  }
  while (!fits() && list.length > 1) {
    removed.push(list[list.length - 1]!.exerciseId);
    list = list.slice(0, -1);
  }
  return { exercises: list, removed };
}

export { EXERCISES };
