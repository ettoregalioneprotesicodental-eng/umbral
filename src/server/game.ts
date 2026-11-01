import { and, desc, eq, gte, inArray, lt, lte, ne, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as schema from "@/lib/db/schema";
import { grantXp } from "@/domain/game/ledger";
import { applyRecovery, applySkip } from "@/domain/game/momentum";
import { GAME_RULES_V1 } from "@/domain/game/rules";
import { levelFromTotalXp } from "@/domain/game/xp";
import { FIRST_BOSS_ID, ITEMS, RANK_D_REQUIREMENT, STORY, getBoss, getItem, itemsUnlockedAtOrBelow, weekStartOf } from "@/domain/game/content";
import type { AnyDb } from "./training";

type Profile = typeof schema.profile.$inferSelect;

export interface GameOutcome {
  momentumGained: number;
  sealBroken: number | null;
  bossDefeated: boolean;
  bossXp: number;
  newItems: string[];
  rankUp: string | null;
}

function shiftDate(local: string, days: number): string {
  const [y, m, d] = local.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!) + days * 86_400_000).toISOString().slice(0, 10);
}

async function addFact(tx: AnyDb, userId: string, key: string, text: string) {
  await tx.insert(schema.storyFact).values({ id: randomUUID(), userId, key, text }).onConflictDoNothing();
}

/** Concede objetos de forma idempotente y equipa el nuevo en su ranura. */
async function grantItems(tx: AnyDb, userId: string, itemIds: string[], source: string): Promise<string[]> {
  const added: string[] = [];
  for (const id of itemIds) {
    const item = getItem(id);
    if (!item) continue;
    const ins = await tx.insert(schema.userItem).values({ userId, itemId: id, source, equipped: true })
      .onConflictDoNothing().returning({ itemId: schema.userItem.itemId });
    if (ins.length === 0) continue;
    added.push(id);
    const sameSlot = ITEMS.filter((i) => i.slot === item.slot && i.id !== id).map((i) => i.id);
    if (sameSlot.length) {
      await tx.update(schema.userItem).set({ equipped: false })
        .where(and(eq(schema.userItem.userId, userId), inArray(schema.userItem.itemId, sameSlot)));
    }
  }
  return added;
}

export async function ensureEncounter(tx: AnyDb, userId: string, bossId = FIRST_BOSS_ID) {
  const boss = getBoss(bossId);
  await tx.insert(schema.bossEncounter).values({ id: randomUUID(), userId, bossId, seals: boss.seals }).onConflictDoNothing();
  const [enc] = await tx.select().from(schema.bossEncounter)
    .where(and(eq(schema.bossEncounter.userId, userId), eq(schema.bossEncounter.bossId, bossId)));
  return enc!;
}

/**
 * Efectos de juego de una misión válida. Se ejecuta DENTRO de la transacción que cierra la
 * misión, así que un fallo revierte todo junto (AC07). Cada efecto es idempotente por misión:
 * cerrar dos veces o desde dos dispositivos no rompe dos sellos ni da dos recompensas (AC06).
 * El jefe solo usa misiones planificadas: nunca exige volumen extra (AC13).
 */
export async function applyMissionRewards(
  tx: AnyDb,
  userId: string,
  mission: { id: string; kind: string; localDate: string },
  opts: { sealEligible: boolean },
): Promise<GameOutcome> {
  const out: GameOutcome = { momentumGained: 0, sealBroken: null, bossDefeated: false, bossXp: 0, newItems: [], rankUp: null };
  const [ch] = await tx.select().from(schema.character).where(eq(schema.character.userId, userId)).for("update");
  if (!ch) throw new Error("El usuario no tiene personaje");

  // 1. Recuperación de impulso: una por día como máximo.
  const [{ n: recToday }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.momentumEvent)
    .where(and(eq(schema.momentumEvent.userId, userId), eq(schema.momentumEvent.reason, "recovery"), eq(schema.momentumEvent.localDate, mission.localDate))) as [{ n: number }];
  const rec = applyRecovery(ch.momentum, recToday);
  const insRec = await tx.insert(schema.momentumEvent).values({
    id: randomUUID(), userId, missionId: mission.id, localDate: mission.localDate, weekStart: weekStartOf(mission.localDate),
    delta: rec.gained, reason: "recovery", rulesVersion: GAME_RULES_V1.version,
  }).onConflictDoNothing().returning({ id: schema.momentumEvent.id });
  if (insRec.length && rec.gained > 0) {
    await tx.update(schema.character).set({ momentum: rec.value, updatedAt: new Date() }).where(eq(schema.character.userId, userId));
    out.momentumGained = rec.gained;
  }

  // 2. Sello del jefe: solo entrenamiento o movilidad planificados.
  if (opts.sealEligible && mission.kind !== "rest") {
    const enc = await ensureEncounter(tx, userId);
    const [locked] = await tx.select().from(schema.bossEncounter).where(eq(schema.bossEncounter.id, enc.id)).for("update");
    if (locked && locked.status === "active") {
      const ins = await tx.insert(schema.bossEvent).values({ id: randomUUID(), encounterId: locked.id, missionId: mission.id })
        .onConflictDoNothing().returning({ id: schema.bossEvent.id });
      if (ins.length) {
        const broken = locked.sealsBroken + 1;
        const boss = getBoss(locked.bossId);
        const defeated = broken >= locked.seals;
        await tx.update(schema.bossEncounter)
          .set({ sealsBroken: broken, status: defeated ? "defeated" : "active", defeatedAt: defeated ? new Date() : null })
          .where(eq(schema.bossEncounter.id, locked.id));
        out.sealBroken = broken;
        await addFact(tx, userId, `seal:${boss.id}:${broken}`, boss.sealLines[broken - 1] ?? `Sello ${broken} roto.`);
        if (defeated) {
          out.bossDefeated = true;
          const g = await grantXp(tx, { userId, idempotencyKey: `boss:${locked.id}`, amount: boss.rewardXp, reason: "boss", source: `boss:${boss.id}` });
          if (g.granted) out.bossXp = boss.rewardXp;
          out.newItems.push(...await grantItems(tx, userId, boss.rewardItems, `boss:${boss.id}`));
          await addFact(tx, userId, `boss:${boss.id}:defeated`, boss.victory);
        }
      }
    }
  }

  // 3. Objetos por nivel (idempotente: se recalcula con la XP real del libro).
  const [after] = await tx.select({ totalXp: schema.character.totalXp, rank: schema.character.rank }).from(schema.character).where(eq(schema.character.userId, userId));
  const level = levelFromTotalXp(after!.totalXp).level;
  out.newItems.push(...await grantItems(tx, userId, itemsUnlockedAtOrBelow(level).map((i) => i.id), `level:${level}`));

  // 4. Rango D.
  if (after!.rank === "E") {
    const [enc] = await tx.select().from(schema.bossEncounter)
      .where(and(eq(schema.bossEncounter.userId, userId), eq(schema.bossEncounter.bossId, RANK_D_REQUIREMENT.bossId)));
    if (enc?.status === "defeated") {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.plannedSession)
        .where(and(eq(schema.plannedSession.userId, userId), eq(schema.plannedSession.status, "completed"))) as [{ n: number }];
      if (n >= RANK_D_REQUIREMENT.validMissions) {
        await tx.update(schema.character).set({ rank: "D", updatedAt: new Date() }).where(eq(schema.character.userId, userId));
        await addFact(tx, userId, "rank:D", STORY.rankD);
        out.rankUp = "D";
      }
    }
  }
  return out;
}

/**
 * Procesa misiones de entrenamiento que quedaron sin hacer ni reprogramar.
 * - Margen: el día de la misión y el siguiente completos; se procesa a partir del segundo día.
 * - Solo se miran los últimos 7 días; lo anterior se archiva como omitido sin penalización.
 * - Una penalización por misión (índice único), dentro del máximo semanal y del suelo (AC12).
 * - Con penalizaciones desactivadas solo se archiva.
 * Descansos, misiones pospuestas («Hoy no puedo») y exentas nunca penalizan (AC11).
 */
export async function processMissedMissions(db: AnyDb, profile: Profile, today: string) {
  const cutoff = shiftDate(today, -2);
  const oldest = shiftDate(today, -8);
  await db.update(schema.plannedSession).set({ status: "skipped", updatedAt: new Date() })
    .where(and(eq(schema.plannedSession.userId, profile.userId), eq(schema.plannedSession.status, "planned"), lt(schema.plannedSession.localDate, oldest)));

  const candidates = await db.select().from(schema.plannedSession).where(and(
    eq(schema.plannedSession.userId, profile.userId),
    eq(schema.plannedSession.status, "planned"),
    ne(schema.plannedSession.kind, "rest"),
    gte(schema.plannedSession.localDate, oldest),
    lte(schema.plannedSession.localDate, cutoff),
  )).orderBy(schema.plannedSession.localDate);

  let penalties = 0;
  for (const m of candidates) {
    await db.transaction(async (tx) => {
      const [ch] = await tx.select().from(schema.character).where(eq(schema.character.userId, profile.userId)).for("update");
      const upd = await tx.update(schema.plannedSession).set({ status: "skipped", updatedAt: new Date() })
        .where(and(eq(schema.plannedSession.id, m.id), eq(schema.plannedSession.status, "planned"))).returning({ id: schema.plannedSession.id });
      if (!upd.length || !ch || profile.penaltyMode === "off") return;
      const week = weekStartOf(m.localDate);
      const [{ s }] = await tx.select({ s: sql<number>`coalesce(sum(${schema.momentumEvent.delta}),0)::int` }).from(schema.momentumEvent)
        .where(and(eq(schema.momentumEvent.userId, profile.userId), eq(schema.momentumEvent.weekStart, week), inArray(schema.momentumEvent.reason, ["skip", "revert"]))) as [{ s: number }];
      const r = applySkip(ch.momentum, Math.max(0, -s));
      const ins = await tx.insert(schema.momentumEvent).values({
        id: randomUUID(), userId: profile.userId, missionId: m.id, localDate: m.localDate, weekStart: week,
        delta: -r.lost, reason: "skip", rulesVersion: GAME_RULES_V1.version,
      }).onConflictDoNothing().returning({ id: schema.momentumEvent.id });
      if (ins.length && r.lost > 0) {
        await tx.update(schema.character).set({ momentum: r.value, updatedAt: new Date() }).where(eq(schema.character.userId, profile.userId));
        penalties++;
      }
    });
  }
  return { penalties };
}

/**
 * Revierte una penalización (enfermedad, vacaciones, fallo técnico o error). Una sola vez por misión.
 */
export async function revertMomentumPenalty(db: AnyDb, userId: string, eventId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [ch] = await tx.select().from(schema.character).where(eq(schema.character.userId, userId)).for("update");
    const [ev] = await tx.select().from(schema.momentumEvent)
      .where(and(eq(schema.momentumEvent.id, eventId), eq(schema.momentumEvent.userId, userId), eq(schema.momentumEvent.reason, "skip")));
    if (!ch || !ev) return false;
    const ins = await tx.insert(schema.momentumEvent).values({
      id: randomUUID(), userId, missionId: ev.missionId, localDate: ev.localDate, weekStart: ev.weekStart,
      delta: -ev.delta, reason: "revert", rulesVersion: GAME_RULES_V1.version,
    }).onConflictDoNothing().returning({ id: schema.momentumEvent.id });
    if (!ins.length) return false;
    await tx.update(schema.character).set({ momentum: Math.min(GAME_RULES_V1.momentum.max, ch.momentum - ev.delta), updatedAt: new Date() })
      .where(eq(schema.character.userId, userId));
    await tx.update(schema.plannedSession).set({ status: "exempt", updatedAt: new Date() })
      .where(and(eq(schema.plannedSession.id, ev.missionId), eq(schema.plannedSession.userId, userId)));
    return true;
  });
}

/** Estado de campaña para la página del cazador y para la herramienta de la IA. */
export async function loadCampaign(db: AnyDb, userId: string, onboarded: boolean) {
  if (onboarded) {
    await addFact(db, userId, "prologue", STORY.prologue);
    await addFact(db, userId, "chapter1", STORY.chapter1);
  }
  const encounter = onboarded ? await ensureEncounter(db, userId) : null;
  const items = await db.select().from(schema.userItem).where(eq(schema.userItem.userId, userId)).orderBy(schema.userItem.acquiredAt);
  const facts = await db.select().from(schema.storyFact).where(eq(schema.storyFact.userId, userId)).orderBy(schema.storyFact.createdAt);
  const momentumEvents = await db.select().from(schema.momentumEvent)
    .where(and(eq(schema.momentumEvent.userId, userId), inArray(schema.momentumEvent.reason, ["skip", "revert"])))
    .orderBy(desc(schema.momentumEvent.createdAt)).limit(20);
  const reverted = new Set(momentumEvents.filter((e) => e.reason === "revert").map((e) => e.missionId));
  const penalties = momentumEvents.filter((e) => e.reason === "skip").map((e) => ({ ...e, reverted: reverted.has(e.missionId) }));
  return { encounter, boss: encounter ? getBoss(encounter.bossId) : null, items, facts, penalties };
}
