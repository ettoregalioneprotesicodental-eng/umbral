import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { grantXp } from "@/domain/game/ledger";
import { GAME_RULES_V1 } from "@/domain/game/rules";
import { partialMissionXp } from "@/domain/game/xp";
import { getExercise } from "@/domain/training/catalog";
import { daysBetween, isoWeekday, localDate } from "@/domain/training/dates";
import { equipmentContext } from "@/domain/training/equipment";
import { defaultTrainingDays, generateSession, makeAllowed, sessionKindFor, type PlannerContext } from "@/domain/training/planner";
import type { CheckinInput, ExercisePerformance, PerformedSet, SessionPrescription } from "@/domain/training/types";
import { validatePrescription } from "@/domain/training/validate";

export type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;
type Profile = typeof schema.profile.$inferSelect;

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

/* ------------------------------------------------------------------ */
/* Contexto                                                            */
/* ------------------------------------------------------------------ */

export async function getProfile(db: AnyDb, userId: string): Promise<Profile | null> {
  const [p] = await db.select().from(schema.profile).where(eq(schema.profile.userId, userId));
  return p ?? null;
}

export function todayFor(profile: Pick<Profile, "timeZone">, now = new Date()): string {
  return localDate(now, profile.timeZone);
}

export function checkinToInput(c: typeof schema.dailyCheckin.$inferSelect | null | undefined): CheckinInput | null {
  if (!c) return null;
  return { availableMinutes: c.availableMinutes, energy: c.energy, fatigue: c.fatigue, discomfort: c.discomfort, areas: c.areas };
}

/** Reconstruye el historial por ejercicio desde los registros reales (nunca inventados). */
export async function loadHistory(db: AnyDb, userId: string, sinceLocalDate: string) {
  const sessions = await db
    .select()
    .from(schema.workoutSession)
    .where(and(eq(schema.workoutSession.userId, userId), gte(schema.workoutSession.localDate, sinceLocalDate), inArray(schema.workoutSession.status, ["completed"])))
    .orderBy(desc(schema.workoutSession.localDate), desc(schema.workoutSession.startedAt));
  const ids = sessions.map((s) => s.id);
  const sets = ids.length
    ? await db.select().from(schema.setLog).where(and(inArray(schema.setLog.sessionId, ids), isNull(schema.setLog.deletedAt))).orderBy(schema.setLog.setIndex)
    : [];

  const historyByExercise = new Map<string, ExercisePerformance[]>();
  const lastExerciseBySlot = new Map<string, string>();
  for (const s of sessions) {
    for (const pe of s.prescription.exercises) {
      const logged = sets.filter((x) => x.sessionId === s.id && x.slot === pe.slot);
      // Si se sustituyó el ejercicio durante la sesión, la ranura registra el realmente usado.
      const usedId = logged.find((x) => x.kind === "working")?.exerciseId ?? pe.exerciseId;
      if (!lastExerciseBySlot.has(pe.slot)) lastExerciseBySlot.set(pe.slot, usedId);
      const performed: PerformedSet[] = logged
        .filter((x) => x.exerciseId === usedId)
        .map((x) => ({
          kind: x.kind,
          reps: x.reps,
          seconds: x.seconds,
          load: x.loadValue !== null && x.loadUnit ? { value: Number(x.loadValue), unit: x.loadUnit } : null,
          rir: x.rir,
          discomfort: x.discomfort,
        }));
      if (performed.length === 0) continue;
      const ex = getExercise(usedId);
      const list = historyByExercise.get(usedId) ?? [];
      list.push({
        localDate: s.localDate,
        exerciseId: usedId,
        target: usedId === pe.exerciseId ? pe.target : (ex?.defaultTarget ?? pe.target),
        plannedSets: pe.sets,
        plannedLoad: usedId === pe.exerciseId ? pe.load : (performed.find((p) => p.load)?.load ?? null),
        sets: performed,
      });
      historyByExercise.set(usedId, list);
    }
  }
  const lastDate = sessions[0]?.localDate ?? null;
  return { historyByExercise, lastExerciseBySlot, lastDate };
}

function shiftDate(local: string, days: number): string {
  const [y, m, d] = local.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!) + days * 86_400_000).toISOString().slice(0, 10);
}

export async function buildPlan(
  db: AnyDb,
  profile: Profile,
  date: string,
  checkin: CheckinInput | null,
  shortMode: boolean,
): Promise<SessionPrescription> {
  const trainingDays = profile.trainingDays.length ? profile.trainingDays : defaultTrainingDays(profile.daysPerWeek ?? 3);
  const kind = sessionKindFor(isoWeekday(date), trainingDays);
  const { historyByExercise, lastExerciseBySlot, lastDate } = await loadHistory(db, profile.userId, shiftDate(date, -120));
  const ctx: PlannerContext = {
    kind,
    equipment: equipmentContext(profile.equipment),
    profileMinutes: profile.minutesPerSession ?? 20,
    checkin,
    declaredAreas: profile.constraints.map((c) => c.area),
    avoid: profile.exerciseAvoid,
    historyByExercise,
    lastExerciseBySlot,
    daysSinceLastTraining: lastDate ? daysBetween(lastDate, date) : null,
    shortMode,
  };
  const plan = generateSession(ctx);
  const v = validatePrescription(plan, { equipment: ctx.equipment, avoid: ctx.avoid, budgetMinutes: plan.budgetMinutes, isAllowed: makeAllowed(ctx) });
  if (v.ok) return plan;

  // La propuesta no pasa la validación: alternativa conservadora sin historial.
  const fallback = generateSession({ ...ctx, historyByExercise: new Map(), lastExerciseBySlot: new Map(), daysSinceLastTraining: null });
  const v2 = validatePrescription(fallback, { equipment: ctx.equipment, avoid: ctx.avoid, budgetMinutes: fallback.budgetMinutes, isAllowed: makeAllowed(ctx) });
  if (v2.ok) return { ...fallback, reasons: [...fallback.reasons, "Se usa una versión conservadora porque la propuesta inicial no superó la validación."] };
  return {
    kind: "rest", title: "Recuperación", warmup: false, exercises: [], estimatedMinutes: 0, budgetMinutes: plan.budgetMinutes,
    shortMode, rulesVersion: plan.rulesVersion, reasons: ["No se pudo generar una sesión válida con tus datos actuales. Revisa tu perfil."],
  };
}

/* ------------------------------------------------------------------ */
/* Misión del día                                                      */
/* ------------------------------------------------------------------ */

export async function getCheckin(db: AnyDb, userId: string, date: string) {
  const [c] = await db.select().from(schema.dailyCheckin).where(and(eq(schema.dailyCheckin.userId, userId), eq(schema.dailyCheckin.localDate, date)));
  return c ?? null;
}

/**
 * Devuelve (creándola si falta) la misión del día. Si sigue sin empezar y se pide,
 * se regenera con el chequeo actual; una vez iniciada no se modifica.
 */
export async function ensureTodayMission(
  db: AnyDb,
  profile: Profile,
  opts: { now?: Date; regenerate?: boolean; shortMode?: boolean } = {},
) {
  const date = todayFor(profile, opts.now);
  const [existing] = await db
    .select()
    .from(schema.plannedSession)
    .where(and(eq(schema.plannedSession.userId, profile.userId), eq(schema.plannedSession.localDate, date)));
  if (existing && (existing.status !== "planned" || !opts.regenerate)) return existing;

  const checkin = checkinToInput(await getCheckin(db, profile.userId, date));
  const plan = await buildPlan(db, profile, date, checkin, opts.shortMode ?? existing?.prescription.shortMode ?? false);

  if (existing) {
    const [updated] = await db
      .update(schema.plannedSession)
      .set({ prescription: plan, kind: plan.kind, rulesVersion: plan.rulesVersion, revision: sql`${schema.plannedSession.revision} + 1`, updatedAt: new Date() })
      .where(and(eq(schema.plannedSession.id, existing.id), eq(schema.plannedSession.status, "planned")))
      .returning();
    return updated ?? existing;
  }

  await db
    .insert(schema.plannedSession)
    .values({ id: randomUUID(), userId: profile.userId, localDate: date, timeZone: profile.timeZone, kind: plan.kind, prescription: plan, rulesVersion: plan.rulesVersion })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(schema.plannedSession)
    .where(and(eq(schema.plannedSession.userId, profile.userId), eq(schema.plannedSession.localDate, date)));
  return row!;
}

export interface CheckinPayload {
  availableMinutes: number | null;
  energy: number | null;
  fatigue: number | null;
  discomfort: "none" | "mild" | "moderate";
  areas: string[];
  redFlags: string[];
  note: string | null;
}

export async function saveCheckin(db: AnyDb, profile: Profile, payload: CheckinPayload, now = new Date()) {
  const date = todayFor(profile, now);
  const discomfort = payload.redFlags.length ? "red_flag" : payload.discomfort;
  const values = {
    availableMinutes: payload.availableMinutes,
    energy: payload.energy,
    fatigue: payload.fatigue,
    discomfort,
    areas: payload.areas,
    redFlags: payload.redFlags,
    note: payload.note,
    updatedAt: new Date(),
  } as const;
  await db
    .insert(schema.dailyCheckin)
    .values({ id: randomUUID(), userId: profile.userId, localDate: date, ...values })
    .onConflictDoUpdate({ target: [schema.dailyCheckin.userId, schema.dailyCheckin.localDate], set: values });

  const mission = await ensureTodayMission(db, profile, { now, regenerate: true });
  if (discomfort === "red_flag" && mission.status === "planned") {
    await db.update(schema.plannedSession).set({ status: "exempt", updatedAt: new Date() }).where(eq(schema.plannedSession.id, mission.id));
  }
  return mission;
}

async function ownedMission(db: AnyDb, userId: string, missionId: string) {
  const [m] = await db.select().from(schema.plannedSession).where(and(eq(schema.plannedSession.id, missionId), eq(schema.plannedSession.userId, userId)));
  if (!m) throw new NotFoundError("Misión no encontrada");
  return m;
}

export async function setShortMode(db: AnyDb, profile: Profile, shortMode: boolean, now = new Date()) {
  return ensureTodayMission(db, profile, { now, regenerate: true, shortMode });
}

export async function postponeMission(db: AnyDb, userId: string, missionId: string) {
  const m = await ownedMission(db, userId, missionId);
  if (m.status !== "planned") throw new ConflictError("La misión ya no se puede posponer");
  await db.update(schema.plannedSession).set({ status: "postponed", updatedAt: new Date() }).where(eq(schema.plannedSession.id, m.id));
}

/** Confirma el descanso planificado: cuenta como misión cumplida. */
export async function confirmRest(db: AnyDb, userId: string, missionId: string) {
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(schema.plannedSession)
      .where(and(eq(schema.plannedSession.id, missionId), eq(schema.plannedSession.userId, userId))).for("update");
    if (!m) throw new NotFoundError("Misión no encontrada");
    if (m.kind !== "rest" || m.prescription.exercises.length > 0) throw new ConflictError("Esta misión no es un descanso");
    if (m.status === "completed") return { xp: 0, already: true };
    if (m.status !== "planned") throw new ConflictError("La misión no está disponible");
    const r = await grantXp(tx, { userId, idempotencyKey: `mission:${m.id}`, amount: GAME_RULES_V1.xp.dailyMissionMax, reason: "daily_mission", source: `rest:${m.localDate}` });
    await tx.update(schema.plannedSession).set({ status: "completed", updatedAt: new Date() }).where(eq(schema.plannedSession.id, m.id));
    return { xp: r.granted ? GAME_RULES_V1.xp.dailyMissionMax : 0, already: !r.granted };
  });
}

/* ------------------------------------------------------------------ */
/* Sesión                                                              */
/* ------------------------------------------------------------------ */

export async function startSession(db: AnyDb, userId: string, missionId: string) {
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(schema.plannedSession)
      .where(and(eq(schema.plannedSession.id, missionId), eq(schema.plannedSession.userId, userId))).for("update");
    if (!m) throw new NotFoundError("Misión no encontrada");
    const [existing] = await tx.select().from(schema.workoutSession).where(eq(schema.workoutSession.plannedSessionId, m.id));
    if (existing) return existing;
    if (m.status !== "planned" || m.prescription.exercises.length === 0) throw new ConflictError("Esta misión no tiene una sesión que empezar");
    const [ws] = await tx.insert(schema.workoutSession).values({
      id: randomUUID(), userId, plannedSessionId: m.id, localDate: m.localDate, prescription: m.prescription,
    }).returning();
    await tx.update(schema.plannedSession).set({ status: "in_progress", updatedAt: new Date() }).where(eq(schema.plannedSession.id, m.id));
    return ws!;
  });
}

export async function getSession(db: AnyDb, userId: string, sessionId: string) {
  const [ws] = await db.select().from(schema.workoutSession).where(and(eq(schema.workoutSession.id, sessionId), eq(schema.workoutSession.userId, userId)));
  if (!ws) throw new NotFoundError("Sesión no encontrada");
  const sets = await db.select().from(schema.setLog)
    .where(and(eq(schema.setLog.sessionId, ws.id), isNull(schema.setLog.deletedAt)))
    .orderBy(schema.setLog.createdAt);
  return { session: ws, sets };
}

export interface SetPayload {
  id: string;
  slot: string;
  exerciseId: string;
  setIndex: number;
  kind: "warmup" | "working" | "incomplete" | "skipped";
  reps: number | null;
  seconds: number | null;
  load: { value: number; unit: "kg" | "lb" } | null;
  rir: number | null;
  discomfort: boolean;
  note: string | null;
}

/**
 * Registra o corrige una serie. Idempotente por id: reenviar la misma operación no duplica.
 * Una corrección incrementa la revisión sin tocar el resto de series (AC03).
 */
export async function upsertSet(db: AnyDb, userId: string, sessionId: string, p: SetPayload) {
  const [ws] = await db.select().from(schema.workoutSession).where(and(eq(schema.workoutSession.id, sessionId), eq(schema.workoutSession.userId, userId)));
  if (!ws) throw new NotFoundError("Sesión no encontrada");
  if (ws.status !== "in_progress") throw new ConflictError("La sesión ya está cerrada");
  const slot = ws.prescription.exercises.find((e) => e.slot === p.slot);
  if (!slot) throw new ConflictError("Ranura desconocida en esta sesión");
  if (!getExercise(p.exerciseId)) throw new ConflictError("Ejercicio fuera del catálogo");

  const values = {
    exerciseId: p.exerciseId,
    slot: p.slot,
    setIndex: p.setIndex,
    kind: p.kind,
    reps: p.reps,
    seconds: p.seconds,
    loadValue: p.load ? String(p.load.value) : null,
    loadUnit: p.load ? p.load.unit : null,
    rir: p.rir,
    discomfort: p.discomfort,
    note: p.note,
  };
  const [existing] = await db.select({ userId: schema.setLog.userId, sessionId: schema.setLog.sessionId }).from(schema.setLog).where(eq(schema.setLog.id, p.id));
  if (existing && (existing.userId !== userId || existing.sessionId !== sessionId)) throw new NotFoundError("Serie no encontrada");

  const [row] = await db
    .insert(schema.setLog)
    .values({ id: p.id, userId, sessionId, ...values })
    .onConflictDoUpdate({
      target: schema.setLog.id,
      set: { ...values, revision: sql`${schema.setLog.revision} + 1`, deletedAt: null, updatedAt: new Date() },
      setWhere: and(eq(schema.setLog.userId, userId), eq(schema.setLog.sessionId, sessionId)),
    })
    .returning();
  return row!;
}

export async function deleteSet(db: AnyDb, userId: string, sessionId: string, setId: string) {
  const [ws] = await db.select().from(schema.workoutSession).where(and(eq(schema.workoutSession.id, sessionId), eq(schema.workoutSession.userId, userId)));
  if (!ws) throw new NotFoundError("Sesión no encontrada");
  if (ws.status !== "in_progress") throw new ConflictError("La sesión ya está cerrada");
  await db.update(schema.setLog).set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.setLog.id, setId), eq(schema.setLog.userId, userId), eq(schema.setLog.sessionId, sessionId)));
}

/** Unidades de misión: una por serie planificada; se cumple con una serie efectiva o incompleta registrada. */
export function missionUnits(prescription: SessionPrescription, sets: Array<{ slot: string; kind: string }>) {
  const units: { weight: number; completed: boolean }[] = [];
  for (const e of prescription.exercises) {
    const done = sets.filter((s) => s.slot === e.slot && (s.kind === "working" || s.kind === "incomplete")).length;
    for (let i = 0; i < e.sets; i++) units.push({ weight: 1, completed: i < done });
  }
  return units;
}

/**
 * Cierra la sesión: resultados, misión y XP en una única transacción (AC07).
 * Repetir la llamada (doble toque, dos pestañas) no concede XP dos veces (AC06).
 */
export async function finishSession(db: AnyDb, userId: string, sessionId: string, opts: { failAfterGrant?: boolean } = {}) {
  return db.transaction(async (tx) => {
    const [ws] = await tx.select().from(schema.workoutSession)
      .where(and(eq(schema.workoutSession.id, sessionId), eq(schema.workoutSession.userId, userId))).for("update");
    if (!ws) throw new NotFoundError("Sesión no encontrada");
    if (ws.status === "completed") return { xp: ws.xpAwarded ?? 0, status: "completed" as const, already: true, levelUp: 0 };

    const sets = await tx.select({ slot: schema.setLog.slot, kind: schema.setLog.kind }).from(schema.setLog)
      .where(and(eq(schema.setLog.sessionId, ws.id), isNull(schema.setLog.deletedAt)));
    const units = missionUnits(ws.prescription, sets);
    const allDone = units.length > 0 && units.every((u) => u.completed);
    const xp = allDone ? GAME_RULES_V1.xp.dailyMissionMax : partialMissionXp(units);
    const missionStatus = allDone ? "completed" : "partial";

    let levelUp = 0;
    if (xp > 0) {
      const r = await grantXp(tx, {
        userId,
        idempotencyKey: `mission:${ws.plannedSessionId}`,
        amount: xp,
        reason: allDone ? "daily_mission" : "partial_mission",
        source: `session:${ws.id}`,
      });
      levelUp = r.levelAfter - r.levelBefore;
    }
    if (opts.failAfterGrant) throw new Error("Fallo simulado tras conceder XP");

    await tx.update(schema.workoutSession).set({ status: "completed", endedAt: new Date(), xpAwarded: xp })
      .where(eq(schema.workoutSession.id, ws.id));
    await tx.update(schema.plannedSession).set({ status: missionStatus, updatedAt: new Date() })
      .where(eq(schema.plannedSession.id, ws.plannedSessionId));
    return { xp, status: missionStatus, already: false, levelUp };
  });
}

/* ------------------------------------------------------------------ */
/* Historial                                                           */
/* ------------------------------------------------------------------ */

export async function exerciseHistory(db: AnyDb, userId: string, limitSessions = 30) {
  const sessions = await db.select().from(schema.workoutSession)
    .where(and(eq(schema.workoutSession.userId, userId), eq(schema.workoutSession.status, "completed")))
    .orderBy(desc(schema.workoutSession.localDate)).limit(limitSessions);
  const ids = sessions.map((s) => s.id);
  const sets = ids.length
    ? await db.select().from(schema.setLog).where(and(inArray(schema.setLog.sessionId, ids), isNull(schema.setLog.deletedAt))).orderBy(schema.setLog.setIndex)
    : [];
  return { sessions, sets };
}

/** Últimos resultados comparables por ranura, para mostrarlos durante la sesión. */
export async function previousResults(db: AnyDb, userId: string, exerciseIds: string[], beforeSessionId: string) {
  if (exerciseIds.length === 0) return new Map<string, { localDate: string; sets: typeof schema.setLog.$inferSelect[] }>();
  const rows = await db.select({ set: schema.setLog, localDate: schema.workoutSession.localDate })
    .from(schema.setLog)
    .innerJoin(schema.workoutSession, eq(schema.workoutSession.id, schema.setLog.sessionId))
    .where(and(
      eq(schema.setLog.userId, userId),
      inArray(schema.setLog.exerciseId, exerciseIds),
      isNull(schema.setLog.deletedAt),
      eq(schema.workoutSession.status, "completed"),
      sql`${schema.setLog.sessionId} <> ${beforeSessionId}`,
    ))
    .orderBy(desc(schema.workoutSession.localDate), schema.setLog.setIndex)
    .limit(200);
  const out = new Map<string, { localDate: string; sets: typeof schema.setLog.$inferSelect[] }>();
  for (const r of rows) {
    const cur = out.get(r.set.exerciseId);
    if (!cur) out.set(r.set.exerciseId, { localDate: r.localDate, sets: [r.set] });
    else if (cur.localDate === r.localDate && cur.sets[0]!.sessionId === r.set.sessionId) cur.sets.push(r.set);
  }
  return out;
}
