import { describe, expect, it } from "vitest";
import { levelFromTotalXp, levelsGained, partialMissionXp, totalXpForLevel, xpToNext } from "@/domain/game/xp";

describe("curva de experiencia", () => {
  it("aplica la fórmula del prompt maestro", () => {
    expect(xpToNext(1)).toBe(100);
    // 100 + 30*1 + 5*1^1.35 = 135
    expect(xpToNext(2)).toBe(135);
    // 100 + 30*9 + 5*9^1.35 = 370 + 5*19.42.. = 467
    expect(xpToNext(10)).toBe(Math.round(100 + 270 + 5 * Math.pow(9, 1.35)));
  });

  it("es estrictamente creciente", () => {
    for (let l = 1; l < 200; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
  });

  it("rechaza niveles inválidos", () => {
    expect(() => xpToNext(0)).toThrow(RangeError);
    expect(() => xpToNext(1.5)).toThrow(RangeError);
  });

  it("separa XP total de XP restante", () => {
    const s = levelFromTotalXp(150);
    expect(s).toMatchObject({ level: 2, xpIntoLevel: 50, xpForThisLevel: 135, xpRemaining: 85, totalXp: 150 });
  });

  it("los límites exactos suben de nivel", () => {
    expect(levelFromTotalXp(99).level).toBe(1);
    expect(levelFromTotalXp(100).level).toBe(2);
    expect(levelFromTotalXp(totalXpForLevel(7)).level).toBe(7);
  });

  it("una recompensa grande puede superar más de un nivel", () => {
    expect(levelsGained(0, totalXpForLevel(4) + 1)).toBe(3);
  });

  it("rechaza XP negativa", () => {
    expect(() => levelFromTotalXp(-1)).toThrow(RangeError);
  });
});

describe("cumplimiento parcial", () => {
  it("es proporcional a los pesos fijados", () => {
    const units = [
      { weight: 1, completed: true },
      { weight: 2, completed: true },
      { weight: 1, completed: false },
    ];
    expect(partialMissionXp(units)).toBe(75);
  });
  it("nunca supera el máximo ni baja de cero", () => {
    expect(partialMissionXp([{ weight: 3, completed: true }])).toBe(100);
    expect(partialMissionXp([])).toBe(0);
    expect(partialMissionXp([{ weight: -5, completed: true }])).toBe(0);
  });
});
