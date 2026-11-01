import type { Load, Target } from "./units";

export type SessionKind = "strength_a" | "strength_b" | "mobility" | "rest";

export type DecisionKind = "maintain" | "progress" | "reduce" | "substitute" | "pause" | "calibrate";

export interface ProgressionDecision {
  kind: DecisionKind;
  /** Explicación en lenguaje claro, basada solo en registros reales. */
  reason: string;
}

export interface PrescribedExercise {
  slot: string;
  exerciseId: string;
  sets: number;
  target: Target;
  load: Load | null;
  restSeconds: number;
  /** Repeticiones en reserva objetivo; null si no aplica (movilidad, isométricos). */
  rirTarget: number | null;
  note?: string;
  decision: ProgressionDecision;
}

export interface SessionPrescription {
  kind: SessionKind;
  title: string;
  warmup: boolean;
  exercises: PrescribedExercise[];
  estimatedMinutes: number;
  budgetMinutes: number;
  shortMode: boolean;
  reasons: string[];
  rulesVersion: string;
}

/** Equipamiento normalizado a partir del perfil. */
export interface EquipmentContext {
  hasDumbbells: boolean;
  hasMat: boolean;
  /** Cargas de mancuerna disponibles por unidad, ordenadas. Vacío = desconocidas. */
  dumbbellLoads: Load[];
}

export type DiscomfortLevel = "none" | "mild" | "moderate" | "red_flag";

export interface CheckinInput {
  availableMinutes: number | null;
  energy: number | null; // 1–5
  fatigue: number | null; // 1–5
  discomfort: DiscomfortLevel;
  areas: string[];
}

/** Una ejecución pasada de un ejercicio, tal como se registró. */
export interface ExercisePerformance {
  localDate: string;
  exerciseId: string;
  target: Target;
  plannedSets: number;
  plannedLoad: Load | null;
  sets: PerformedSet[];
}

export interface PerformedSet {
  kind: "warmup" | "working" | "incomplete" | "skipped";
  reps: number | null;
  seconds: number | null;
  load: Load | null;
  rir: number | null;
  discomfort: boolean;
}
