import { afterAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as schema from "@/lib/db/schema";
import {
  confirmRest, deleteSet, ensureTodayMission, finishSession, getSession, NotFoundError, saveCheckin, startSession, upsertSet,
  type SetPayload,
} from "@/server/training";

const url = process.env.TEST_DATABASE_URL ?? "postgres://umbral:umbral_dev@localhost:5432/umbral_test";
const client = postgres(url, { max: 8, onnotice: () => {} });
const db = drizzle(client, { schema });
afterAll(async () => { await client.end(); });

// 2026-11-02 es lunes (fuerza A con el calendario de 5 días).
const MONDAY = new Date("2026-11-02T08:00:00Z");
const SATURDAY = new Date("2026-11-07T08:00:00Z");

async function makeUser(over: Partial<typeof schema.profile.$inferInsert> = {}) {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: "T", email: `${id}@t.local` });
  await db.insert(schema.character).values({ userId: id, hunterName: "T" });
  const [p] = await db.insert(schema.profile).values({
    userId: id, alias: "T", timeZone: "Europe/Madrid", adultConfirmed: true, experience: "returning",
    daysPerWeek: 5, trainingDays: [1, 2, 3, 4, 5], minutesPerSession: 15, location: "home",
    equipment: [
      { kind: "dumbbell", label: "Mancuernas", count: 2, loads: [4, 6, 8, 10, 12].map((v) => ({ value: v, unit: "kg" as const })) },
      { kind: "mat", label: "Esterilla" },
    ],
    onboardingCompletedAt: new Date(),
    ...over,
  }).returning();
  return p!;
}

async function xp(userId: string) {
  const [c] = await db.select().from(schema.character).where(eq(schema.character.userId, userId));
  return c!.totalXp;
}

function setFor(slot: string, exerciseId: string, i: number, over: Partial<SetPayload> = {}): SetPayload {
  return { id: randomUUID(), slot, exerciseId, setIndex: i, kind: "working", reps: 10, seconds: null, load: { value: 8, unit: "kg" }, rir: 3, discomfort: false, note: null, ...over };
}

async function completeAll(userId: string, sessionId: string) {
  const { session } = await getSession(db, userId, sessionId);
  for (const e of session.prescription.exercises) {
    for (let i = 0; i < e.sets; i++) {
      const isSec = e.target.kind === "seconds";
      await upsertSet(db, userId, sessionId, setFor(e.slot, e.exerciseId, i, {
        reps: isSec ? null : e.target.max, seconds: isSec ? e.target.max : null, load: e.load,
      }));
    }
  }
}

describe("misión diaria", () => {
  it("AC14: una sola misión por día aunque se pida en paralelo", async () => {
    const p = await makeUser();
    const results = await Promise.all(Array.from({ length: 5 }, () => ensureTodayMission(db, p, { now: MONDAY })));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    const rows = await db.select().from(schema.plannedSession).where(eq(schema.plannedSession.userId, p.userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("strength_a");
    expect(rows[0]!.prescription.estimatedMinutes).toBeLessThanOrEqual(15);
  });

  it("el chequeo regenera la misión mientras no ha empezado y respeta el tiempo disponible", async () => {
    const p = await makeUser({ minutesPerSession: 20 });
    const before = await ensureTodayMission(db, p, { now: MONDAY });
    const after = await saveCheckin(db, p, { availableMinutes: 10, energy: 3, fatigue: 2, discomfort: "none", areas: [], redFlags: [], note: null }, MONDAY);
    expect(after.id).toBe(before.id);
    expect(after.revision).toBe(2);
    expect(after.prescription.estimatedMinutes).toBeLessThanOrEqual(10);
  });

  it("AC10: señal de alarma deja la misión exenta, sin ejercicios ni XP", async () => {
    const p = await makeUser();
    const m = await saveCheckin(db, p, { availableMinutes: 15, energy: 3, fatigue: 2, discomfort: "none", areas: [], redFlags: ["chest_pain"], note: null }, MONDAY);
    const [row] = await db.select().from(schema.plannedSession).where(eq(schema.plannedSession.id, m.id));
    expect(row!.status).toBe("exempt");
    expect(row!.prescription.exercises).toHaveLength(0);
    await expect(startSession(db, p.userId, m.id)).rejects.toThrow();
    expect(await xp(p.userId)).toBe(0);
  });

  it("el descanso planificado cuenta como cumplido una sola vez", async () => {
    const p = await makeUser();
    const m = await ensureTodayMission(db, p, { now: SATURDAY });
    expect(m.kind).toBe("rest");
    const [a, b] = await Promise.all([confirmRest(db, p.userId, m.id), confirmRest(db, p.userId, m.id).catch(() => ({ xp: 0 }))]);
    expect(a.xp + b.xp).toBe(100);
    expect(await xp(p.userId)).toBe(100);
  });

  it("una sesión iniciada no cambia aunque se repita el chequeo", async () => {
    const p = await makeUser();
    const m = await ensureTodayMission(db, p, { now: MONDAY });
    const ws = await startSession(db, p.userId, m.id);
    const after = await saveCheckin(db, p, { availableMinutes: 8, energy: 1, fatigue: 5, discomfort: "none", areas: [], redFlags: [], note: null }, MONDAY);
    expect(after.revision).toBe(1);
    const { session } = await getSession(db, p.userId, ws.id);
    expect(session.prescription).toEqual(m.prescription);
  });
});

describe("registro de series", () => {
  it("AC05: reenviar la misma serie no la duplica", async () => {
    const p = await makeUser();
    const m = await ensureTodayMission(db, p, { now: MONDAY });
    const ws = await startSession(db, p.userId, m.id);
    const e = ws.prescription.exercises[0]!;
    const s = setFor(e.slot, e.exerciseId, 0);
    await Promise.all([upsertSet(db, p.userId, ws.id, s), upsertSet(db, p.userId, ws.id, s), upsertSet(db, p.userId, ws.id, s)]);
    const { sets } = await getSession(db, p.userId, ws.id);
    expect(sets).toHaveLength(1);
  });

  it("AC03: corregir una serie no altera las demás y deshacer la oculta", async () => {
    const p = await makeUser();
    const m = await ensureTodayMission(db, p, { now: MONDAY });
    const ws = await startSession(db, p.userId, m.id);
    const e = ws.prescription.exercises[0]!;
    const s1 = setFor(e.slot, e.exerciseId, 0, { reps: 10 });
    const s2 = setFor(e.slot, e.exerciseId, 1, { reps: 9 });
    await upsertSet(db, p.userId, ws.id, s1);
    await upsertSet(db, p.userId, ws.id, s2);
    const corrected = await upsertSet(db, p.userId, ws.id, { ...s1, reps: 11 });
    expect(corrected.revision).toBe(2);
    let { sets } = await getSession(db, p.userId, ws.id);
    expect(sets.find((x) => x.id === s1.id)!.reps).toBe(11);
    expect(sets.find((x) => x.id === s2.id)!.reps).toBe(9);
    await deleteSet(db, p.userId, ws.id, s2.id);
    ({ sets } = await getSession(db, p.userId, ws.id));
    expect(sets.map((x) => x.id)).toEqual([s1.id]);
    // el registro borrado se conserva en la base de datos
    const all = await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, ws.id));
    expect(all).toHaveLength(2);
  });

  it("AC01: otro usuario no puede leer ni escribir en la sesión", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const m = await ensureTodayMission(db, a, { now: MONDAY });
    const ws = await startSession(db, a.userId, m.id);
    const e = ws.prescription.exercises[0]!;
    await expect(getSession(db, b.userId, ws.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(upsertSet(db, b.userId, ws.id, setFor(e.slot, e.exerciseId, 0))).rejects.toBeInstanceOf(NotFoundError);
    const own = setFor(e.slot, e.exerciseId, 0);
    await upsertSet(db, a.userId, ws.id, own);
    const mB = await ensureTodayMission(db, b, { now: MONDAY });
    const wsB = await startSession(db, b.userId, mB.id);
    // B intenta sobrescribir la serie de A reutilizando su id
    await expect(upsertSet(db, b.userId, wsB.id, { ...own, reps: 99 })).rejects.toBeInstanceOf(NotFoundError);
    const [still] = await db.select().from(schema.setLog).where(eq(schema.setLog.id, own.id));
    expect(still!.reps).toBe(10);
    await expect(startSession(db, b.userId, m.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("cierre de sesión y recompensas", () => {
  it("sesión completa: 100 XP y misión cumplida", async () => {
    const p = await makeUser();
    const m = await ensureTodayMission(db, p, { now: MONDAY });
    const ws = await startSession(db, p.userId, m.id);
    await completeAll(p.userId, ws.id);
    const r = await finishSession(db, p.userId, ws.id);
    expect(r).toMatchObject({ xp: 100, status: "completed" });
    expect(await xp(p.userId)).toBe(100);
  });

  it("sesión parcial: XP proporcional", async () => {
    const p = await makeUser();
    const m = await ensureTodayMission(db, p, { now: MONDAY });
    const ws = await startSession(db, p.userId, m.id);
    const total = ws.prescription.exercises.reduce((s, e) => s + e.sets, 0);
    const e = ws.prescription.exercises[0]!;
    await upsertSet(db, p.userId, ws.id, setFor(e.slot, e.exerciseId, 0));
    const r = await finishSession(db, p.userId, ws.id);
    expect(r.status).toBe("partial");
    expect(r.xp).toBe(Math.floor(100 / total));
  });

  it("AC06: cerrar la sesión desde dos pestañas concede una sola recompensa", async () => {
    const p = await makeUser();
    const m = await ensureTodayMission(db, p, { now: MONDAY });
    const ws = await startSession(db, p.userId, m.id);
    await completeAll(p.userId, ws.id);
    await Promise.all(Array.from({ length: 4 }, () => finishSession(db, p.userId, ws.id)));
    expect(await xp(p.userId)).toBe(100);
  });

  it("AC07: un fallo a mitad del cierre no deja XP concedida ni la sesión cerrada", async () => {
    const p = await makeUser();
    const m = await ensureTodayMission(db, p, { now: MONDAY });
    const ws = await startSession(db, p.userId, m.id);
    await completeAll(p.userId, ws.id);
    await expect(finishSession(db, p.userId, ws.id, { failAfterGrant: true })).rejects.toThrow();
    expect(await xp(p.userId)).toBe(0);
    const { session } = await getSession(db, p.userId, ws.id);
    expect(session.status).toBe("in_progress");
    const events = await db.select().from(schema.experienceEvent).where(eq(schema.experienceEvent.userId, p.userId));
    expect(events).toHaveLength(0);
    // reintento correcto
    expect((await finishSession(db, p.userId, ws.id)).xp).toBe(100);
  });

  it("no se pueden añadir series a una sesión cerrada", async () => {
    const p = await makeUser();
    const m = await ensureTodayMission(db, p, { now: MONDAY });
    const ws = await startSession(db, p.userId, m.id);
    await completeAll(p.userId, ws.id);
    await finishSession(db, p.userId, ws.id);
    const e = ws.prescription.exercises[0]!;
    await expect(upsertSet(db, p.userId, ws.id, setFor(e.slot, e.exerciseId, 5))).rejects.toThrow("cerrada");
  });
});

describe("progresión a partir de registros reales", () => {
  it("tras dos sesiones comparables con el rango completo sube la carga del ejercicio", async () => {
    const p = await makeUser();
    // Dos lunes seguidos completando todo al máximo del rango.
    for (const day of ["2026-11-02T08:00:00Z", "2026-11-05T08:00:00Z"]) {
      const m = await ensureTodayMission(db, p, { now: new Date(day) });
      const ws = await startSession(db, p.userId, m.id);
      await completeAll(p.userId, ws.id);
      await finishSession(db, p.userId, ws.id);
    }
    const first = (await db.select().from(schema.plannedSession).where(and(eq(schema.plannedSession.userId, p.userId), eq(schema.plannedSession.localDate, "2026-11-02"))))[0]!;
    const next = await ensureTodayMission(db, p, { now: new Date("2026-11-09T08:00:00Z") });
    const squat0 = first.prescription.exercises.find((e) => e.slot === "squat")!;
    const squat1 = next.prescription.exercises.find((e) => e.slot === "squat")!;
    expect(squat1.decision.kind).toBe("progress");
    expect(squat1.load!.value).toBeGreaterThan(squat0.load!.value);
  });
});

export const _unused = isNull;
