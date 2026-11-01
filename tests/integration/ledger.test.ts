import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as schema from "@/lib/db/schema";
import { correctXpEvent, grantXp } from "@/domain/game/ledger";

const url = process.env.TEST_DATABASE_URL ?? "postgres://umbral:umbral_dev@localhost:5432/umbral_test";
const client = postgres(url, { max: 5, onnotice: () => {} });
const db = drizzle(client, { schema });

async function makeUser() {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: "Test", email: `${id}@test.local` });
  await db.insert(schema.character).values({ userId: id, hunterName: "Test" });
  return id;
}

async function total(userId: string) {
  const [c] = await db.select().from(schema.character).where(eq(schema.character.userId, userId));
  return c!.totalXp;
}

beforeAll(async () => {
  await db.execute("select 1" as never);
});
afterAll(async () => {
  await client.end();
});

describe("libro de eventos de XP (base de datos real)", () => {
  it("AC06: la misma misión desde dos dispositivos concede una sola recompensa", async () => {
    const u = await makeUser();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        grantXp(db, { userId: u, idempotencyKey: "mission:2026-11-02", amount: 100, reason: "daily_mission", source: "test" }),
      ),
    );
    expect(results.filter((r) => r.granted)).toHaveLength(1);
    expect(await total(u)).toBe(100);
  });

  it("detecta subida de varios niveles en una concesión", async () => {
    const u = await makeUser();
    const r = await grantXp(db, { userId: u, idempotencyKey: "boss:1", amount: 400, reason: "boss", source: "test" });
    expect(r.levelBefore).toBe(1);
    expect(r.levelAfter).toBe(3);
  });

  it("AC24: una corrección no permite reclamar repetidamente la recompensa", async () => {
    const u = await makeUser();
    await grantXp(db, { userId: u, idempotencyKey: "mission:a", amount: 100, reason: "daily_mission", source: "test" });
    const [ev] = await db.select().from(schema.experienceEvent).where(eq(schema.experienceEvent.userId, u));
    expect(await correctXpEvent(db, u, ev!.id)).toBe(true);
    expect(await correctXpEvent(db, u, ev!.id)).toBe(false);
    expect(await total(u)).toBe(0);
    const again = await grantXp(db, { userId: u, idempotencyKey: "mission:a", amount: 100, reason: "daily_mission", source: "test" });
    expect(again.granted).toBe(false);
    expect(await total(u)).toBe(0);
  });

  it("AC01: un usuario no puede corregir eventos de otro", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await grantXp(db, { userId: a, idempotencyKey: "m", amount: 50, reason: "daily_mission", source: "test" });
    const [ev] = await db.select().from(schema.experienceEvent).where(eq(schema.experienceEvent.userId, a));
    expect(await correctXpEvent(db, b, ev!.id)).toBe(false);
    expect(await total(a)).toBe(50);
  });

  it("rechaza cantidades fuera de límites", async () => {
    const u = await makeUser();
    await expect(
      grantXp(db, { userId: u, idempotencyKey: "x", amount: 100000, reason: "boss", source: "test" }),
    ).rejects.toThrow(RangeError);
    await expect(
      grantXp(db, { userId: u, idempotencyKey: "y", amount: -5, reason: "boss", source: "test" }),
    ).rejects.toThrow(RangeError);
  });
});
