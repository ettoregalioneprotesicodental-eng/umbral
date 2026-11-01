import { GAME_RULES_V1, type GameRules } from "./rules";

/**
 * Barra narrativa de «impulso». Nunca afecta al acceso al entrenamiento, a los datos ni al ritmo de XP.
 * Funciones puras: el servidor decide cuándo una omisión es elegible y aplica el resultado.
 */
export function applySkip(
  current: number,
  lostThisWeek: number,
  rules: GameRules = GAME_RULES_V1,
): { value: number; lost: number } {
  const m = rules.momentum;
  const weeklyRoom = Math.max(0, m.maxLossPerWeek - lostThisWeek);
  const floorRoom = Math.max(0, current - m.floor);
  const lost = Math.min(m.lossPerSkip, weeklyRoom, floorRoom);
  return { value: current - lost, lost };
}

export function applyRecovery(
  current: number,
  recoveriesToday: number,
  rules: GameRules = GAME_RULES_V1,
): { value: number; gained: number } {
  const m = rules.momentum;
  if (recoveriesToday >= m.recoveriesPerDay) return { value: current, gained: 0 };
  const gained = Math.min(m.recoveryPerValidMission, m.max - current);
  return { value: current + gained, gained };
}
