import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { grantXp } from "@/domain/game/ledger";
import { confirmRest, ensureTodayMission, finishSession, postponeMission, startSession } from "@/server/training";
import { processMissedMissions, revertMomentumPenalty } from "@/server/game";
import { at, character, client, completeAll, db, makeUser } from "../helpers/db";

afterAll(async () => { await client.end(); });

type P = Awaited<ReturnType<typeof makeUser>>;

async function doMission(p: P, local: string, opts: { partial?: boolean } = {}) {
  const m = await ensureTodayMission(db, p, { now: at(local) });
  const ws = await startSession(db, p.userId, m.id);
  if (!opts.partial) await completeAll(p.userId, ws.id);
  else {
    const e = ws.prescription.exercises[0]!;
    const { upsertSet } = await import("@/server/training");
    const { setFor } = await import("../helpers/db");
    await upsertSet(db, p.userId, ws.id, setFor(e.slot, e.exerciseId, 0, { reps: e.target.kind === "reps" ? e.target.min : null, seconds: e.target.kind === "seconds" ? e.target.min : null, load: e.load }));
  }
  return { mission: m, session: ws, result: await finishSession(db, p.userId, ws.id) };
}

async function encounter(userId: string) {
  const [e] = await db.select().from(schema.bossEncounter).where(eq(schema.bossEncounter.userId, userId));
  return e;
}

describe("jefe Guardián del Umbral", () => {
  it("AC13: tres misiones planificadas rompen los tres sellos, sin volumen extra, y la recompensa llega una vez", async () => {
    const p = await makeUser();
    const r1 = await doMission(p, "2026-11-02");
    expect(r1.result.game?.sealBroken).toBe(1);
    // La prescripción guardada es exactamente la del motor: el jefe no añade series.
    const [m1] = await db.select().from(schema.plannedSession).where(eq(schema.plannedSession.id, r1.mission.id));
    expect(m1!.prescription).toEqual(r1.mission.prescription);

    await doMission(p, "2026-11-03");
    const r3 = await doMission(p, "2026-11-04"); // miércoles: movilidad también cuenta
    expect(r3.mission.kind).toBe("mobility");
    expect(r3.result.game?.bossDefeated).toBe(true);
    expect(r3.result.game?.bossXp).toBe(150);
    expect((await encounter(p.userId))!.status).toBe("defeated");

    const items = await db.select().from(schema.userItem).where(eq(schema.userItem.userId, p.userId));
    expect(items.map((i) => i.itemId).sort()).toEqual(expect.arrayContaining(["daga_guardian", "sombra_companera"]));
    const bossXp = await db.select().from(schema.experienceEvent).where(and(eq(schema.experienceEvent.userId, p.userId), eq(schema.experienceEvent.reason, "boss")));
    expect(bossXp).toHaveLength(1);

    // Una cuarta misión no da más daño ni otra recompensa.
    const r4 = await doMission(p, "2026-11-05");
    expect(r4.result.game?.sealBroken).toBeNull();
    expect((await character(p.userId)).totalXp).toBe(4 * 100 + 150);
  });

  it("AC06: cerrar la misma sesión dos veces en paralelo rompe un solo sello", async () => {
    const p = await makeUser();
    const m = await ensureTodayMission(db, p, { now: at("2026-11-02") });
    const ws = await startSession(db, p.userId, m.id);
    await completeAll(p.userId, ws.id);
    await Promise.all([finishSession(db, p.userId, ws.id), finishSession(db, p.userId, ws.id)]);
    expect((await encounter(p.userId))!.sealsBroken).toBe(1);
    expect(await db.select().from(schema.bossEvent).where(eq(schema.bossEvent.missionId, m.id))).toHaveLength(1);
  });

  it("AC07: un fallo tras XP y daño revierte ambos", async () => {
    const p = await makeUser();
    const m = await ensureTodayMission(db, p, { now: at("2026-11-02") });
    const ws = await startSession(db, p.userId, m.id);
    await completeAll(p.userId, ws.id);
    await expect(finishSession(db, p.userId, ws.id, { failAfterGrant: true })).rejects.toThrow();
    expect((await character(p.userId)).totalXp).toBe(0);
    expect(await db.select().from(schema.bossEvent).where(eq(schema.bossEvent.missionId, m.id))).toHaveLength(0);
    expect(await db.select().from(schema.momentumEvent).where(eq(schema.momentumEvent.missionId, m.id))).toHaveLength(0);
    // Y el reintento funciona con normalidad.
    const r = await finishSession(db, p.userId, ws.id);
    expect(r.game?.sealBroken).toBe(1);
  });

  it("descanso confirmado y sesión parcial no rompen sellos", async () => {
    const p = await makeUser();
    const rest = await ensureTodayMission(db, p, { now: at("2026-11-07") }); // sábado
    await confirmRest(db, p.userId, rest.id);
    await doMission(p, "2026-11-02", { partial: true });
    const e = await encounter(p.userId);
    expect(e?.sealsBroken ?? 0).toBe(0);
  });

  it("los objetos por nivel se conceden una vez y se equipan", async () => {
    const p = await makeUser();
    await grantXp(db, { userId: p.userId, idempotencyKey: "test:boost", amount: 300, reason: "milestone", source: "test" });
    const r = await doMission(p, "2026-11-02");
    expect(r.result.game?.newItems).toContain("capa_umbral");
    await doMission(p, "2026-11-03");
    const rows = await db.select().from(schema.userItem).where(and(eq(schema.userItem.userId, p.userId), eq(schema.userItem.itemId, "capa_umbral")));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.equipped).toBe(true);
  });
});

describe("impulso y misiones omitidas", () => {
  async function plannedWeek(p: P) {
    for (const d of ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]) await ensureTodayMission(db, p, { now: at(d) });
  }

  it("AC12: penaliza una vez por misión, con máximo semanal y suelo; repetir el proceso no penaliza otra vez", async () => {
    const p = await makeUser();
    await plannedWeek(p);
    const r1 = await processMissedMissions(db, p, "2026-11-09");
    expect(r1.penalties).toBe(3); // 5 omisiones, pero máximo 15 por semana
    expect((await character(p.userId)).momentum).toBe(85);
    const r2 = await processMissedMissions(db, p, "2026-11-10");
    expect(r2.penalties).toBe(0);
    expect((await character(p.userId)).momentum).toBe(85);
    const skips = await db.select().from(schema.momentumEvent).where(and(eq(schema.momentumEvent.userId, p.userId), eq(schema.momentumEvent.reason, "skip")));
    expect(skips).toHaveLength(5);
    expect(skips.reduce((a, s) => a + s.delta, 0)).toBe(-15);
  });

  it("margen de un día: la misión de ayer todavía no se procesa", async () => {
    const p = await makeUser();
    const m = await ensureTodayMission(db, p, { now: at("2026-11-02") });
    await processMissedMissions(db, p, "2026-11-03");
    const [row] = await db.select().from(schema.plannedSession).where(eq(schema.plannedSession.id, m.id));
    expect(row!.status).toBe("planned");
  });

  it("AC11: «Hoy no puedo», descanso y penalizaciones desactivadas no castigan", async () => {
    const p = await makeUser();
    const m = await ensureTodayMission(db, p, { now: at("2026-11-02") });
    await postponeMission(db, p.userId, m.id);
    await ensureTodayMission(db, p, { now: at("2026-11-07") }); // descanso sin confirmar
    await processMissedMissions(db, p, "2026-11-10");
    expect((await character(p.userId)).momentum).toBe(100);

    const off = await makeUser({ penaltyMode: "off" });
    await plannedWeek(off);
    await processMissedMissions(db, off, "2026-11-09");
    expect((await character(off.userId)).momentum).toBe(100);
  });

  it("AC12: la penalización se puede revertir una sola vez y deja la misión exenta", async () => {
    const p = await makeUser();
    const m = await ensureTodayMission(db, p, { now: at("2026-11-02") });
    await processMissedMissions(db, p, "2026-11-04");
    expect((await character(p.userId)).momentum).toBe(95);
    const [ev] = await db.select().from(schema.momentumEvent).where(and(eq(schema.momentumEvent.missionId, m.id), eq(schema.momentumEvent.reason, "skip")));
    expect(await revertMomentumPenalty(db, p.userId, ev!.id)).toBe(true);
    expect(await revertMomentumPenalty(db, p.userId, ev!.id)).toBe(false);
    expect((await character(p.userId)).momentum).toBe(100);
    const [row] = await db.select().from(schema.plannedSession).where(eq(schema.plannedSession.id, m.id));
    expect(row!.status).toBe("exempt");
    // Otro usuario no puede revertirla.
    const other = await makeUser();
    expect(await revertMomentumPenalty(db, other.userId, ev!.id)).toBe(false);
  });

  it("una misión válida recupera impulso como máximo una vez al día", async () => {
    const p = await makeUser();
    await db.update(schema.character).set({ momentum: 80 }).where(eq(schema.character.userId, p.userId));
    const r = await doMission(p, "2026-11-02");
    expect(r.result.game?.momentumGained).toBe(5);
    expect((await character(p.userId)).momentum).toBe(85);
  });
});
