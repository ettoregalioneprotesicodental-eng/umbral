/**
 * Límites versionados del motor de entrenamiento.
 *
 * Distinción importante:
 *  - «Recomendación general»: rangos amplios de las guías de entrenamiento de fuerza para adultos
 *    sanos (p. ej. ACSM: trabajar los grandes grupos musculares ≥ 2 días/semana, series en rangos
 *    moderados de repeticiones, progresión gradual). Referencia aportada en el prompt maestro;
 *    pendiente de reverificar el texto exacto (ver docs/DECISIONES.md).
 *  - «Decisión de producto»: cifras concretas de esta tabla. Son conservadoras a propósito
 *    para una persona que vuelve tras una pausa, y no son recetas universales.
 */
export const TRAINING_RULES_V1 = {
  version: "training-v1",
  session: {
    warmupMinutes: 3,
    transitionSeconds: 20,
    /** Segundos por repetición para estimar duración (incluye colocación). */
    secondsPerRep: 3.5,
    /** Las sesiones nunca superan el tiempo declarado. */
    minMinutes: 8,
    maxMinutes: 90,
    maxWorkingSetsPerSession: 14,
  },
  exercise: {
    minSets: 1,
    maxSets: 4,
    defaultRest: { strength: 60, paired: 40, mobility: 15 },
  },
  calibration: {
    /** Empieza lejos del fallo: ~3 repeticiones en reserva. */
    targetRir: 3,
    initialSets: 2,
  },
  progression: {
    /** Sesiones comparables completas necesarias antes de progresar. */
    minComparableSessions: 2,
    /** Reps por encima del máximo del rango que se consideran anómalas. */
    anomalyRepsFactor: 2.5,
    maxRepsPerSet: 60,
    maxSecondsPerSet: 1200,
    /** Si el esfuerzo declarado es más duro que (targetRir - margen), no progresa. */
    rirMargin: 1,
    /** Sesiones consecutivas por debajo del rango antes de reducir. */
    sessionsBelowRangeToReduce: 2,
    /** Máximo de series añadidas por progresión y techo por ejercicio. */
    addSetCeiling: 3,
  },
  returnAfterBreak: {
    /** Días sin entrenar a partir de los cuales se recalibra a la baja. */
    days: 14,
  },
} as const;

export type TrainingRules = typeof TRAINING_RULES_V1;
