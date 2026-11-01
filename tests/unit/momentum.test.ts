import { describe, expect, it } from "vitest";
import { applyRecovery, applySkip } from "@/domain/game/momentum";

describe("barra de impulso", () => {
  it("baja 5 por omisión elegible", () => {
    expect(applySkip(100, 0)).toEqual({ value: 95, lost: 5 });
  });
  it("respeta el máximo de 15 por semana", () => {
    expect(applySkip(85, 15)).toEqual({ value: 85, lost: 0 });
    expect(applySkip(88, 12)).toEqual({ value: 85, lost: 3 });
  });
  it("nunca baja del suelo de 70", () => {
    expect(applySkip(72, 0)).toEqual({ value: 70, lost: 2 });
    expect(applySkip(70, 0)).toEqual({ value: 70, lost: 0 });
  });
  it("recupera 5 una vez al día sin pasar de 100", () => {
    expect(applyRecovery(80, 0)).toEqual({ value: 85, gained: 5 });
    expect(applyRecovery(80, 1)).toEqual({ value: 80, gained: 0 });
    expect(applyRecovery(98, 0)).toEqual({ value: 100, gained: 2 });
  });
});
