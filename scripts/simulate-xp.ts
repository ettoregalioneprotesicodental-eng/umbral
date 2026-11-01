/**
 * Simula el ritmo de niveles con la curva v1 para distintos perfiles.
 * Supuestos (parámetros de juego, no de salud):
 *  - Cada día del calendario tiene una misión: entrenamiento, recuperación o descanso planificado.
 *  - Una misión cumplida da 100 XP; parcial = 60 XP de media.
 *  - Hito verificable (máx. 20 XP/día) con la frecuencia indicada.
 *  - Bonificación semanal de adherencia: 50 XP si cumple ≥ 80 % de la semana.
 * Uso: npm run sim:xp
 */
import { GAME_RULES_V1 } from "../src/domain/game/rules";
import { levelFromTotalXp } from "../src/domain/game/xp";

interface Profile { name: string; fullRate: number; partialRate: number; milestonesPerWeek: number }

const profiles: Profile[] = [
  { name: "Constante (90 % completas)", fullRate: 0.9, partialRate: 0.05, milestonesPerWeek: 2 },
  { name: "Poco tiempo (60 % completas, 25 % parciales)", fullRate: 0.6, partialRate: 0.25, milestonesPerWeek: 1 },
  { name: "Con pausas (45 % completas)", fullRate: 0.45, partialRate: 0.1, milestonesPerWeek: 0.5 },
];

function simulate(p: Profile, days: number): number {
  let xp = 0;
  let weekDone = 0;
  for (let d = 1; d <= days; d++) {
    // Determinista: reparte cumplimiento de forma uniforme sin aleatoriedad.
    const fullUntil = Math.floor(d * p.fullRate) - Math.floor((d - 1) * p.fullRate);
    const partialUntil = Math.floor(d * p.partialRate) - Math.floor((d - 1) * p.partialRate);
    if (fullUntil) { xp += GAME_RULES_V1.xp.dailyMissionMax; weekDone++; }
    else if (partialUntil) { xp += 60; weekDone += 0.5; }
    const ms = Math.floor((d * p.milestonesPerWeek) / 7) - Math.floor(((d - 1) * p.milestonesPerWeek) / 7);
    if (ms) xp += GAME_RULES_V1.xp.milestoneMax;
    if (d % 7 === 0) {
      if (weekDone / 7 >= 0.8) xp += GAME_RULES_V1.xp.weeklyAdherenceBonusMax;
      weekDone = 0;
    }
  }
  return xp;
}

const horizons = [30, 90, 365];
const lines: string[] = [];
lines.push(`| Perfil | ${horizons.map((h) => `${h} días`).join(" | ")} |`);
lines.push(`|---|${horizons.map(() => "---").join("|")}|`);
for (const p of profiles) {
  const cells = horizons.map((h) => {
    const xp = simulate(p, h);
    return `nivel ${levelFromTotalXp(xp).level} (${xp} XP)`;
  });
  lines.push(`| ${p.name} | ${cells.join(" | ")} |`);
}
console.log(lines.join("\n"));
