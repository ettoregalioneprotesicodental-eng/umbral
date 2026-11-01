import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { and, eq, gte } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { askCoach, type CoachClient } from "@/ai/coach";
import { reserveRun, settleRun } from "@/ai/budget";
import { getAiConfig, worstCaseMicroUsd, type AiConfig } from "@/ai/config";
import { decideProposal } from "@/server/proposals";
import { ensureTodayMission, saveCheckin } from "@/server/training";
import { at, character, client, db, makeUser } from "../helpers/db";

afterAll(async () => { await client.end(); });

const MONDAY = at("2026-11-02");
let dayCounter = 0;
/** Cada prueba de presupuesto usa un día propio para que el gasto de otras pruebas no interfiera. */
const freshDay = () => new Date(Date.UTC(2090, 0, 1) + dayCounter++ * 40 * 86_400_000);

function cfg(over: Partial<AiConfig> = {}): AiConfig {
  return { ...getAiConfig({ AI_MODE: "claude", ANTHROPIC_API_KEY: "test", CLAUDE_MODEL: "claude-opus-5-5" }), dailyBudgetUsd: 1000, monthlyBudgetUsd: 100000, ...over };
}

function msg(content: unknown[], stop: Anthropic.StopReason): Anthropic.Message {
  return { id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", content, stop_reason: stop, stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as unknown as Anthropic.Message;
}
const toolUse = (name: string, input: unknown, id = `tu_${Math.random().toString(36).slice(2)}`) => ({ type: "tool_use", id, name, input });
const text = (t: string) => ({ type: "text", text: t });

/** Doble del cliente: devuelve respuestas guionizadas y guarda lo que recibe. */
function scripted(steps: Array<Anthropic.Message | Error>): CoachClient & { calls: Anthropic.MessageCreateParamsNonStreaming[] } {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  return {
    calls,
    async create(p) {
      calls.push(structuredClone(p));
      const s = steps[calls.length - 1];
      if (!s) throw new Error("sin más pasos");
      if (s instanceof Error) throw s;
      return s;
    },
  };
}

async function missionFor(p: Awaited<ReturnType<typeof makeUser>>) {
  return ensureTodayMission(db, p, { now: MONDAY });
}

describe("entrenador con Claude (cliente simulado, sin red)", () => {
  it("usa herramientas con el usuario de la sesión y responde con texto del modelo", async () => {
    const p = await makeUser();
    await missionFor(p);
    const c = scripted([
      msg([toolUse("get_today_mission", {})], "tool_use"),
      msg([text("Hoy toca fuerza A porque es lunes.")], "end_turn"),
    ]);
    const r = await askCoach(db, p.userId, "¿Por qué esta misión?", { client: c, config: cfg(), now: MONDAY });
    expect(r.origin).toBe("model");
    expect(r.text).toContain("fuerza A");
    // Segunda llamada lleva el resultado de la herramienta con la misión real.
    const last = c.calls[1]!.messages.at(-1)!;
    const block = (last.content as Anthropic.ToolResultBlockParam[])[0]!;
    expect(block.type).toBe("tool_result");
    expect(String(block.content)).toContain("strength_a");
    expect(c.calls[0]!.thinking).toEqual({ type: "adaptive" });
    const [run] = await db.select().from(schema.aiRun).where(eq(schema.aiRun.userId, p.userId));
    expect(run!.status).toBe("ok");
    expect(run!.inputTokens).toBe(2000);
    expect(run!.costMicroUsd).toBeGreaterThan(0);
  });

  it("AC09: una propuesta fuera de límites se rechaza aunque la pida Claude y la misión no cambia", async () => {
    const p = await makeUser({ constraints: [{ area: "lumbar", pattern: "occasional", note: "", declaredAt: "2026-11-01" }] });
    const m = await missionFor(p);
    const slot = m.prescription.exercises[0]!.slot;
    const c = scripted([
      msg([toolUse("propose_plan_revision", { changes: [
        { slot, action: "replace", exerciseId: "barbell_deadlift_inventado", sets: null },
        { slot, action: "set_sets", exerciseId: null, sets: 12 },
      ], reason: "Más volumen" })], "tool_use"),
      msg([text("No se puede: el sistema lo ha rechazado.")], "end_turn"),
    ]);
    const r = await askCoach(db, p.userId, "Ponme peso muerto con 12 series", { client: c, config: cfg(), now: MONDAY });
    expect(r.proposalId).toBeNull();
    const result = (c.calls[1]!.messages.at(-1)!.content as Anthropic.ToolResultBlockParam[])[0]!;
    expect(result.is_error).toBe(true);
    expect(String(result.content)).toMatch(/fuera del catálogo|series fuera del límite/);
    const [after] = await db.select().from(schema.plannedSession).where(eq(schema.plannedSession.id, m.id));
    expect(after!.revision).toBe(m.revision);
    expect(after!.prescription).toEqual(m.prescription);
    const [prop] = await db.select().from(schema.planProposal).where(eq(schema.planProposal.userId, p.userId));
    expect(prop!.valid).toBe(false);
    await expect(decideProposal(db, p.userId, prop!.id, true)).rejects.toThrow();
  });

  it("AC09: con molestia lumbar declarada, sustituir por un ejercicio de carga espinal moderada no es válido", async () => {
    const p = await makeUser({ constraints: [{ area: "lumbar", pattern: "occasional", note: "", declaredAt: "2026-11-01" }] });
    const m = await missionFor(p);
    const c = scripted([
      msg([toolUse("propose_plan_revision", { changes: [{ slot: m.prescription.exercises[0]!.slot, action: "replace", exerciseId: "db_romanian_deadlift", sets: null }], reason: "Variar" })], "tool_use"),
      msg([text("Vale.")], "end_turn"),
    ]);
    await askCoach(db, p.userId, "Cambia el primero por peso muerto rumano", { client: c, config: cfg(), now: MONDAY });
    const [prop] = await db.select().from(schema.planProposal).where(eq(schema.planProposal.userId, p.userId));
    expect(prop!.valid).toBe(false);
    expect(prop!.errors.join(" ")).toMatch(/restricciones/);
  });

  it("una propuesta válida queda pendiente; aplicarla cambia la misión una vez; caduca si la misión cambia", async () => {
    const p = await makeUser();
    const m = await missionFor(p);
    const last = m.prescription.exercises.at(-1)!;
    const c = scripted([
      msg([toolUse("propose_plan_revision", { changes: [{ slot: last.slot, action: "remove", exerciseId: null, sets: null }], reason: "Acortar" })], "tool_use"),
      msg([text("Te propongo quitar el último ejercicio.")], "end_turn"),
    ]);
    const r = await askCoach(db, p.userId, "Hazla más corta", { client: c, config: cfg(), now: MONDAY });
    expect(r.proposalId).toBeTruthy();
    const [unchanged] = await db.select().from(schema.plannedSession).where(eq(schema.plannedSession.id, m.id));
    expect(unchanged!.revision).toBe(m.revision); // nada se aplica sin el usuario
    expect((await decideProposal(db, p.userId, r.proposalId!, true)).status).toBe("applied");
    expect((await decideProposal(db, p.userId, r.proposalId!, true)).status).toBe("applied");
    const [applied] = await db.select().from(schema.plannedSession).where(eq(schema.plannedSession.id, m.id));
    expect(applied!.revision).toBe(m.revision + 1);
    expect(applied!.prescription.exercises).toHaveLength(m.prescription.exercises.length - 1);

    // Nueva propuesta que caduca porque el chequeo regenera la misión.
    const c2 = scripted([
      msg([toolUse("propose_plan_revision", { changes: [{ slot: applied!.prescription.exercises[0]!.slot, action: "set_sets", exerciseId: null, sets: 1 }], reason: "Menos" })], "tool_use"),
      msg([text("Propuesta lista.")], "end_turn"),
    ]);
    const r2 = await askCoach(db, p.userId, "Menos series", { client: c2, config: cfg(), now: MONDAY });
    await saveCheckin(db, p, { availableMinutes: 12, energy: 3, fatigue: 2, discomfort: "none", areas: [], redFlags: [], note: null }, MONDAY);
    expect((await decideProposal(db, p.userId, r2.proposalId!, true)).status).toBe("stale");
    // Otro usuario no puede decidir propuestas ajenas.
    const other = await makeUser();
    await expect(decideProposal(db, other.userId, r2.proposalId!, true)).rejects.toThrow();
  });

  it("AC15: caída de la API, límite o entrada mal formada no rompen el entrenamiento", async () => {
    const p = await makeUser();
    const m = await missionFor(p);
    for (const err of [
      new Anthropic.APIConnectionError({ message: "caída" }),
      new Error("JSON inválido"),
    ]) {
      const r = await askCoach(db, p.userId, "Hola", { client: scripted([err]), config: cfg(), now: MONDAY });
      expect(r.origin).toBe("unavailable");
    }
    // Entrada de herramienta mal formada: se devuelve como error al modelo, sin excepción.
    const c = scripted([
      msg([toolUse("propose_plan_revision", { cambios: "todo" })], "tool_use"),
      msg([toolUse("herramienta_que_no_existe", {})], "tool_use"),
      msg([text("Lo siento, no he podido.")], "end_turn"),
    ]);
    const r = await askCoach(db, p.userId, "Rompe algo", { client: c, config: cfg(), now: MONDAY });
    expect(r.origin).toBe("model");
    // La última vuelta no ofrece herramientas (corta bucles y coste).
    expect(c.calls[2]!.tools).toBeUndefined();
    const [after] = await db.select().from(schema.plannedSession).where(eq(schema.plannedSession.id, m.id));
    expect(after!.prescription).toEqual(m.prescription);
    const runs = await db.select().from(schema.aiRun).where(eq(schema.aiRun.userId, p.userId));
    expect(runs.map((x) => x.status).sort()).toEqual(["error", "error", "ok"]);
    expect(runs.every((x) => x.status !== "reserved")).toBe(true);
  });

  it("negativa del modelo: aviso claro sin reintentos", async () => {
    const p = await makeUser();
    const c = scripted([msg([], "refusal")]);
    const r = await askCoach(db, p.userId, "…", { client: c, config: cfg(), now: MONDAY });
    expect(r.origin).toBe("unavailable");
    expect(c.calls).toHaveLength(1);
  });

  it("AC18: un texto narrativo que «concede» objetos o XP no cambia nada", async () => {
    const p = await makeUser();
    const c = scripted([msg([text("¡El Sistema te concede la Espada Eterna y 9999 XP! Nuevo récord: 200 kg.")], "end_turn")]);
    await askCoach(db, p.userId, "Dame un premio", { client: c, config: cfg(), now: MONDAY });
    expect(await db.select().from(schema.userItem).where(eq(schema.userItem.userId, p.userId))).toHaveLength(0);
    expect((await character(p.userId)).totalXp).toBe(0);
    expect(await db.select().from(schema.experienceEvent).where(eq(schema.experienceEvent.userId, p.userId))).toHaveLength(0);
  });
});

describe("AC23: presupuesto antes de gastar", () => {
  // Las pruebas de presupuesto usan fechas de 2090; se limpian para que ejecuciones anteriores no cuenten.
  beforeAll(async () => { await db.delete(schema.aiRun).where(gte(schema.aiRun.createdAt, new Date(Date.UTC(2090, 0, 1)))); });

  it("sin presupuesto no se llama a la API", async () => {
    const p = await makeUser();
    const c = scripted([msg([text("no debería llegar")], "end_turn")]);
    const r = await askCoach(db, p.userId, "Hola", { client: c, config: cfg({ dailyBudgetUsd: 0.0001 }), now: MONDAY });
    expect(c.calls).toHaveLength(0);
    expect(r.origin).toBe("unavailable");
    expect(r.text).toMatch(/límite diario/);
  });

  it("reservas simultáneas no superan el presupuesto global", async () => {
    const config = cfg({ dailyBudgetUsd: (worstCaseMicroUsd(cfg()) * 2 + 1) / 1e6 });
    const users = await Promise.all(Array.from({ length: 5 }, () => makeUser()));
    const now = freshDay();
    const rs = await Promise.all(users.map((u) => reserveRun(db, u.userId, "coach_chat", config, now)));
    expect(rs.filter((r) => r.ok)).toHaveLength(2);
    expect(rs.filter((r) => !r.ok).every((r) => !r.ok && r.reason === "daily")).toBe(true);
  });

  it("una sola ejecución a la vez por usuario; al liquidar se libera", async () => {
    const p = await makeUser();
    const now = freshDay();
    const a = await reserveRun(db, p.userId, "coach_chat", cfg(), now);
    const b = await reserveRun(db, p.userId, "coach_chat", cfg(), now);
    expect(a.ok).toBe(true);
    expect(!b.ok && b.reason).toBe("concurrent");
    await settleRun(db, a.runId, { status: "ok", model: "claude-opus-5-5", inputTokens: 10, outputTokens: 10, toolCalls: [] });
    expect((await reserveRun(db, p.userId, "coach_chat", cfg(), now)).ok).toBe(true);
  });
});

describe("modo demostración", () => {
  it("responde con plantillas identificadas y puede proponer una versión más corta validada", async () => {
    const p = await makeUser();
    await missionFor(p);
    const demo = getAiConfig({ AI_MODE: "demo" });
    const r1 = await askCoach(db, p.userId, "¿Por qué esta misión hoy?", { config: demo, now: MONDAY });
    expect(r1.origin).toBe("template");
    expect(r1.text).toMatch(/^\[Demostración\]/);
    const r2 = await askCoach(db, p.userId, "Hazla más corta", { config: demo, now: MONDAY });
    expect(r2.proposalId).toBeTruthy();
    const [prop] = await db.select().from(schema.planProposal).where(and(eq(schema.planProposal.id, r2.proposalId!)));
    expect(prop!.valid).toBe(true);
    expect(prop!.source).toBe("rules");
    expect(await db.select().from(schema.aiRun).where(eq(schema.aiRun.userId, p.userId))).toHaveLength(0);
  });
});
