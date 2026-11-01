import { describe, expect, it } from "vitest";
import { BOSSES, ITEMS, itemsUnlockedAtOrBelow, weekStartOf } from "@/domain/game/content";
import { costMicroUsd, getAiConfig, worstCaseMicroUsd } from "@/ai/config";
import { COACH_TOOLS } from "@/ai/tools";

describe("contenido del primer arco", () => {
  it("semana ISO empieza en lunes", () => {
    expect(weekStartOf("2026-11-02")).toBe("2026-11-02");
    expect(weekStartOf("2026-11-08")).toBe("2026-11-02");
    expect(weekStartOf("2026-11-09")).toBe("2026-11-09");
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28");
  });
  it("objetos por nivel y de jefe coherentes", () => {
    expect(itemsUnlockedAtOrBelow(2)).toHaveLength(0);
    expect(itemsUnlockedAtOrBelow(5).map((i) => i.id)).toEqual(["capa_umbral", "aura_azul"]);
    for (const b of BOSSES) {
      expect(b.sealLines).toHaveLength(b.seals);
      for (const id of b.rewardItems) expect(ITEMS.find((i) => i.id === id)?.bossId).toBe(b.id);
    }
  });
});

describe("configuración de IA", () => {
  it("modo demo por defecto y sin clave no hay modo real", () => {
    expect(getAiConfig({}).mode).toBe("demo");
    expect(getAiConfig({ AI_MODE: "claude" }).hasKey).toBe(false);
  });
  it("coste en microdólares y reserva de peor caso", () => {
    expect(costMicroUsd("claude-opus-5-5", 1_000_000, 0)).toBe(4_000_000);
    expect(costMicroUsd("claude-haiku-5-5", 1_000_000, 1_000_000)).toBe(600_000);
    // Modelo desconocido: se usa el precio más alto para no quedarse corto.
    expect(costMicroUsd("modelo-x", 1_000_000, 0)).toBe(4_000_000);
    const c = getAiConfig({ AI_MODE: "claude", CLAUDE_MODEL: "claude-opus-5-5" });
    expect(worstCaseMicroUsd(c)).toBe(costMicroUsd(c.model, c.inputTokensPerIteration * c.maxIterations, c.maxOutputTokens * c.maxIterations));
  });
  it("las herramientas no permiten conceder recompensas ni guardar planes", () => {
    const names = COACH_TOOLS.map((t) => t.name);
    expect(names.some((n) => /grant|xp|item|reward|save|apply|rule/i.test(n))).toBe(false);
    for (const t of COACH_TOOLS) expect(t.strict).toBe(true);
  });
});
