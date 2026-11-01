/**
 * Reglas versionadas del juego. Son parámetros de diseño de juego, NO recomendaciones de salud.
 * Cualquier cambio de valores debe crear una versión nueva; los eventos guardados conservan
 * la versión con la que se calcularon (ver experience_events.rules_version).
 */
export const GAME_RULES_V1 = {
  version: "game-v1",
  xp: {
    /** Máximo por cumplir la misión diaria válida (entrenamiento, recuperación o descanso planificado). */
    dailyMissionMax: 100,
    /** Máximo por hito de progreso verificable; como mucho una concesión por día. */
    milestoneMax: 20,
    milestonesPerDay: 1,
    /** Bonificación semanal por adherencia al plan adaptado. */
    weeklyAdherenceBonusMax: 50,
    /** Curva: XP_siguiente(L) = round(base + linear*(L-1) + coef*(L-1)^exponent) */
    curve: { base: 100, linear: 30, coef: 5, exponent: 1.35 },
  },
  momentum: {
    /** Barra narrativa de «impulso» (0-100). Solo afecta a la estética y al mensaje del sistema. */
    max: 100,
    floor: 70,
    lossPerSkip: 5,
    maxLossPerWeek: 15,
    recoveryPerValidMission: 5,
    recoveriesPerDay: 1,
  },
  ranks: ["E", "D", "C", "B", "A", "S"] as const,
} as const;

export type GameRules = typeof GAME_RULES_V1;
export type HunterRank = (typeof GAME_RULES_V1.ranks)[number];
