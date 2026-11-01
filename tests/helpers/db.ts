import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as schema from "@/lib/db/schema";
import { getSession, upsertSet, type SetPayload } from "@/server/training";

const url = process.env.TEST_DATABASE_URL ?? "postgres://umbral:umbral_dev@localhost:5432/umbral_test";
export const client = postgres(url, { max: 8, onnotice: () => {} });
export const db = drizzle(client, { schema });

/** Fecha local + hora fija en UTC (Madrid = UTC+1 en noviembre). 2026-11-02 es lunes. */
export const at = (local: string) => new Date(`${local}T09:00:00Z`);

export async function makeUser(over: Partial<typeof schema.profile.$inferInsert> = {}) {
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

export async function character(userId: string) {
  const [c] = await db.select().from(schema.character).where(eq(schema.character.userId, userId));
  return c!;
}

export function setFor(slot: string, exerciseId: string, i: number, over: Partial<SetPayload> = {}): SetPayload {
  return { id: randomUUID(), slot, exerciseId, setIndex: i, kind: "working", reps: 10, seconds: null, load: { value: 8, unit: "kg" }, rir: 3, discomfort: false, note: null, ...over };
}

export async function completeAll(userId: string, sessionId: string) {
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
