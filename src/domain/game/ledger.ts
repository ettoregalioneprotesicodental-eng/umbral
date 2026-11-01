import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { character, experienceEvent } from "@/lib/db/schema";
import { GAME_RULES_V1 } from "./rules";
import { levelFromTotalXp } from "./xp";
import * as schema from "@/lib/db/schema";

type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface GrantInput {
  userId: string;
  idempotencyKey: string;
  amount: number;
  reason: "daily_mission" | "partial_mission" | "milestone" | "weekly_bonus" | "boss";
  source: string;
}

export interface GrantResult {
  granted: boolean;
  totalXp: number;
  levelBefore: number;
  levelAfter: number;
}

const MAX_SINGLE_GRANT = 500;

/**
 * Concede XP de forma atómica e idempotente. Reintentos, recargas o dos dispositivos
 * con la misma clave no duplican la recompensa (AC06/AC07).
 */
export async function grantXp(db: AnyDb, input: GrantInput): Promise<GrantResult> {
  if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > MAX_SINGLE_GRANT) {
    throw new RangeError(`Cantidad de XP fuera de límites: ${input.amount}`);
  }
  return db.transaction(async (tx) => {
    // Bloquea la fila del personaje para serializar concesiones del mismo usuario.
    const [ch] = await tx
      .select({ totalXp: character.totalXp })
      .from(character)
      .where(eq(character.userId, input.userId))
      .for("update");
    if (!ch) throw new Error("El usuario no tiene personaje");

    const inserted = await tx
      .insert(experienceEvent)
      .values({
        id: randomUUID(),
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
        amount: input.amount,
        reason: input.reason,
        source: input.source,
        rulesVersion: GAME_RULES_V1.version,
      })
      .onConflictDoNothing({ target: [experienceEvent.userId, experienceEvent.idempotencyKey] })
      .returning({ id: experienceEvent.id });

    const before = ch.totalXp;
    if (inserted.length === 0) {
      const lvl = levelFromTotalXp(before).level;
      return { granted: false, totalXp: before, levelBefore: lvl, levelAfter: lvl };
    }

    const [updated] = await tx
      .update(character)
      .set({ totalXp: sql`${character.totalXp} + ${input.amount}`, updatedAt: new Date() })
      .where(eq(character.userId, input.userId))
      .returning({ totalXp: character.totalXp });

    const after = updated!.totalXp;
    return {
      granted: true,
      totalXp: after,
      levelBefore: levelFromTotalXp(before).level,
      levelAfter: levelFromTotalXp(after).level,
    };
  });
}

/**
 * Revierte un evento mediante una corrección única (AC24). No borra el histórico y
 * no permite reclamarlo de nuevo con la misma clave.
 */
export async function correctXpEvent(db: AnyDb, userId: string, eventId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.select().from(character).where(eq(character.userId, userId)).for("update");
    const [ev] = await tx
      .select()
      .from(experienceEvent)
      .where(and(eq(experienceEvent.id, eventId), eq(experienceEvent.userId, userId)));
    if (!ev || ev.amount <= 0) return false;

    const inserted = await tx
      .insert(experienceEvent)
      .values({
        id: randomUUID(),
        userId,
        idempotencyKey: `correction:${ev.id}`,
        amount: -ev.amount,
        reason: "correction",
        source: ev.source,
        rulesVersion: GAME_RULES_V1.version,
        correctsEventId: ev.id,
      })
      .onConflictDoNothing()
      .returning({ id: experienceEvent.id });
    if (inserted.length === 0) return false;

    await tx
      .update(character)
      .set({ totalXp: sql`GREATEST(0, ${character.totalXp} - ${ev.amount})`, updatedAt: new Date() })
      .where(eq(character.userId, userId));
    return true;
  });
}
