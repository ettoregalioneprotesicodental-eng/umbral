import { describe, expect, it } from "vitest";
import { daysBetween, isoWeekday, localDate, weekStart } from "@/domain/training/dates";
import { adjustTimer, isFinished, parseTimer, pauseTimer, remainingMs, resumeTimer, startTimer } from "@/domain/training/timer";

describe("AC14: fechas locales", () => {
  it("la misma hora UTC puede ser otro día según la zona", () => {
    const t = new Date("2026-11-01T23:30:00Z");
    expect(localDate(t, "Europe/Madrid")).toBe("2026-11-02");
    expect(localDate(t, "America/New_York")).toBe("2026-11-01");
  });
  it("cambio de horario de verano en Madrid (último domingo de octubre)", () => {
    expect(localDate(new Date("2026-10-25T00:30:00Z"), "Europe/Madrid")).toBe("2026-10-25");
    expect(localDate(new Date("2026-10-25T22:59:00Z"), "Europe/Madrid")).toBe("2026-10-25");
    expect(localDate(new Date("2026-10-25T23:00:00Z"), "Europe/Madrid")).toBe("2026-10-26");
  });
  it("día ISO y semana", () => {
    expect(isoWeekday("2026-11-02")).toBe(1);
    expect(isoWeekday("2026-11-01")).toBe(7);
    expect(weekStart("2026-11-05")).toBe("2026-11-02");
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
  });
});

describe("AC22: temporizador por marcas de tiempo", () => {
  it("al volver del segundo plano calcula lo que queda", () => {
    const t = startTimer(1_000, 60);
    expect(remainingMs(t, 31_000)).toBe(30_000);
    expect(remainingMs(t, 90_000)).toBe(0);
    expect(isFinished(t, 61_000)).toBe(true);
  });
  it("pausa, reanuda y ajusta", () => {
    let t = startTimer(0, 60);
    t = pauseTimer(t, 20_000);
    expect(remainingMs(t, 500_000)).toBe(40_000);
    t = resumeTimer(t, 100_000);
    expect(remainingMs(t, 110_000)).toBe(30_000);
    t = adjustTimer(t, 15, 110_000);
    expect(remainingMs(t, 110_000)).toBe(45_000);
    t = adjustTimer(t, -999, 110_000);
    expect(remainingMs(t, 110_000)).toBe(0);
  });
  it("datos corruptos en almacenamiento local no rompen nada", () => {
    expect(parseTimer("basura")).toEqual({ status: "idle" });
    expect(parseTimer({ status: "running", endsAt: "x" })).toEqual({ status: "idle" });
  });
});
