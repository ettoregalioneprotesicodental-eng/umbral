import { and, eq, gte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as schema from "@/lib/db/schema";
import type { AnyDb } from "@/server/training";
import { costMicroUsd, worstCaseMicroUsd, type AiConfig } from "./config";

export type Reservation =
  | { ok: true; runId: string; reservedMicroUsd: number }
  | { ok: false; runId: string; reason: "daily" | "monthly" | "concurrent" };

/** Gasto que cuenta: lo liquidado o, si sigue en curso, lo reservado. */
const spent = sql<number>`coalesce(sum(case when ${schema.aiRun.status} = 'reserved' then ${schema.aiRun.reservedMicroUsd} else ${schema.aiRun.costMicroUsd} end), 0)::bigint`;

/**
 * Reserva el peor caso ANTES de llamar (AC23). Un bloqueo de asesoramiento serializa las reservas,
 * así que dos peticiones simultáneas no pueden superar juntas el presupuesto.
 * El presupuesto es global (lo paga quien despliega) y además se limita a una ejecución por usuario a la vez.
 */
export async function reserveRun(db: AnyDb, userId: string, purpose: "coach_chat" | "story" | "research", cfg: AiConfig, now = new Date()): Promise<Reservation> {
  const need = worstCaseMicroUsd(cfg);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('umbral_ai_budget'))`);
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const staleBefore = new Date(now.getTime() - 5 * 60_000);

    const [{ n: running }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.aiRun)
      .where(and(eq(schema.aiRun.userId, userId), eq(schema.aiRun.status, "reserved"), gte(schema.aiRun.createdAt, staleBefore))) as [{ n: number }];
    const [{ s: day }] = await tx.select({ s: spent }).from(schema.aiRun).where(gte(schema.aiRun.createdAt, dayStart)) as [{ s: number }];
    const [{ s: month }] = await tx.select({ s: spent }).from(schema.aiRun).where(gte(schema.aiRun.createdAt, monthStart)) as [{ s: number }];

    let reason: "daily" | "monthly" | "concurrent" | null = null;
    if (running >= cfg.maxConcurrentPerUser) reason = "concurrent";
    else if (Number(day) + need > cfg.dailyBudgetUsd * 1e6) reason = "daily";
    else if (Number(month) + need > cfg.monthlyBudgetUsd * 1e6) reason = "monthly";

    const runId = randomUUID();
    await tx.insert(schema.aiRun).values({
      id: runId, userId, purpose, model: cfg.model, createdAt: now,
      status: reason ? "refused_budget" : "reserved",
      reservedMicroUsd: reason ? 0 : need,
      error: reason,
    });
    return reason ? { ok: false as const, runId, reason } : { ok: true as const, runId, reservedMicroUsd: need };
  });
}

export async function settleRun(
  db: AnyDb,
  runId: string,
  r: { status: "ok" | "error" | "refusal"; model: string; inputTokens: number; outputTokens: number; toolCalls: { name: string; ok: boolean }[]; error?: string | null },
) {
  await db.update(schema.aiRun).set({
    status: r.status,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costMicroUsd: costMicroUsd(r.model, r.inputTokens, r.outputTokens),
    toolCalls: r.toolCalls,
    error: r.error ?? null,
    finishedAt: new Date(),
  }).where(eq(schema.aiRun.id, runId));
}

export async function usageSummary(db: AnyDb, now = new Date()) {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [{ s: day }] = await db.select({ s: spent }).from(schema.aiRun).where(gte(schema.aiRun.createdAt, dayStart)) as [{ s: number }];
  const [{ s: month }] = await db.select({ s: spent }).from(schema.aiRun).where(gte(schema.aiRun.createdAt, monthStart)) as [{ s: number }];
  return { dayUsd: Number(day) / 1e6, monthUsd: Number(month) / 1e6 };
}
