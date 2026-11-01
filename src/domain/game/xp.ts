import { GAME_RULES_V1, type GameRules } from "./rules";

/** XP necesaria para pasar del nivel `level` al siguiente. */
export function xpToNext(level: number, rules: GameRules = GAME_RULES_V1): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`Nivel inválido: ${level}`);
  }
  const { base, linear, coef, exponent } = rules.xp.curve;
  const n = level - 1;
  return Math.round(base + linear * n + coef * Math.pow(n, exponent));
}

/** XP total acumulada necesaria para alcanzar `level` desde el nivel 1. */
export function totalXpForLevel(level: number, rules: GameRules = GAME_RULES_V1): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l, rules);
  return total;
}

export interface LevelState {
  level: number;
  /** XP acumulada dentro del nivel actual. */
  xpIntoLevel: number;
  /** XP necesaria para completar el nivel actual. */
  xpForThisLevel: number;
  /** XP restante hasta el siguiente nivel. */
  xpRemaining: number;
  totalXp: number;
}

/** Deriva el nivel a partir de la XP total. Una recompensa grande puede saltar varios niveles. */
export function levelFromTotalXp(totalXp: number, rules: GameRules = GAME_RULES_V1): LevelState {
  if (!Number.isFinite(totalXp) || totalXp < 0) {
    throw new RangeError(`XP total inválida: ${totalXp}`);
  }
  let level = 1;
  let remaining = Math.floor(totalXp);
  let need = xpToNext(level, rules);
  while (remaining >= need) {
    remaining -= need;
    level += 1;
    need = xpToNext(level, rules);
  }
  return {
    level,
    xpIntoLevel: remaining,
    xpForThisLevel: need,
    xpRemaining: need - remaining,
    totalXp: Math.floor(totalXp),
  };
}

/** Cuántos niveles se ganan al pasar de `before` a `after` XP total. */
export function levelsGained(before: number, after: number, rules: GameRules = GAME_RULES_V1): number {
  return levelFromTotalXp(after, rules).level - levelFromTotalXp(before, rules).level;
}

/**
 * Recompensa parcial: proporcional a unidades de misión con pesos fijados antes de empezar.
 * Devuelve un entero en [0, max].
 */
export function partialMissionXp(
  units: ReadonlyArray<{ weight: number; completed: boolean }>,
  max: number = GAME_RULES_V1.xp.dailyMissionMax,
): number {
  const totalWeight = units.reduce((s, u) => s + Math.max(0, u.weight), 0);
  if (totalWeight <= 0) return 0;
  const done = units.reduce((s, u) => s + (u.completed ? Math.max(0, u.weight) : 0), 0);
  return Math.max(0, Math.min(max, Math.floor((max * done) / totalWeight)));
}
