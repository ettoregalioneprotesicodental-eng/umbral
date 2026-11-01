import type Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { EXERCISES, getExercise } from "@/domain/training/catalog";
import { equipmentContext, hasEquipmentFor } from "@/domain/training/equipment";
import { levelFromTotalXp } from "@/domain/game/xp";
import { getItem } from "@/domain/game/content";
import { loadCampaign } from "@/server/game";
import { createProposal } from "@/server/proposals";
import { getProfile, todayFor, type AnyDb } from "@/server/training";

/**
 * Herramientas que Claude puede pedir. Todas se ejecutan en el servidor con el usuario de la
 * SESIÓN (nunca con identificadores que aporte el modelo) y devuelven solo datos mínimos.
 * No existe ninguna herramienta para conceder XP, objetos, cambiar reglas o guardar planes:
 * proponer un cambio deja una propuesta pendiente que valida el código y decide el usuario.
 */
const empty: Anthropic.Tool.InputSchema = { type: "object", properties: {}, required: [], additionalProperties: false };

export const COACH_TOOLS: Anthropic.Tool[] = [
  { name: "get_user_profile", description: "Perfil de entrenamiento del usuario: objetivo, experiencia, días, minutos, material y zonas con molestias declaradas. Úsala antes de recomendar.", input_schema: empty, strict: true },
  { name: "get_today_mission", description: "Misión de hoy tal como la generó el motor de reglas: ejercicios, series, objetivos, cargas, duración estimada y estado.", input_schema: empty, strict: true },
  { name: "get_training_summary", description: "Resumen de las últimas sesiones registradas (fecha, tipo, estado, series hechas, XP). Solo datos reales.", input_schema: empty, strict: true },
  { name: "get_approved_exercises", description: "Ejercicios del catálogo revisado compatibles con el material del usuario. Son los ÚNICOS que se pueden proponer.", input_schema: empty, strict: true },
  { name: "get_campaign_state", description: "Estado del juego: nivel, rango, impulso, sellos del jefe, objetos y hechos de la historia. Úsala para narrar sin inventar.", input_schema: empty, strict: true },
  {
    name: "propose_plan_revision",
    description: "Propone cambios a la misión de HOY (sustituir un ejercicio por otro del catálogo, cambiar el número de series o quitar una ranura). No aplica nada: el servidor la valida y el usuario decide. Devuelve si es válida y por qué no.",
    input_schema: {
      type: "object",
      properties: {
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              slot: { type: "string", description: "Ranura de la misión (campo slot de get_today_mission)." },
              action: { type: "string", enum: ["replace", "set_sets", "remove"] },
              exerciseId: { type: ["string", "null"], description: "Id del catálogo para replace; null en otro caso." },
              sets: { type: ["integer", "null"], description: "Series para set_sets; null en otro caso." },
            },
            required: ["slot", "action", "exerciseId", "sets"],
            additionalProperties: false,
          },
        },
        reason: { type: "string", description: "Explicación breve para el usuario, en español." },
      },
      required: ["changes", "reason"],
      additionalProperties: false,
    },
    strict: true,
  },
];

export interface ToolContext {
  db: AnyDb;
  userId: string;
  /** Se rellena si una herramienta crea una propuesta. */
  proposalIds: string[];
  now?: Date;
}

export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<{ ok: boolean; content: string }> {
  const { db, userId } = ctx;
  const profile = await getProfile(db, userId);
  if (!profile) return { ok: false, content: "Perfil no disponible." };
  switch (name) {
    case "get_user_profile":
      return { ok: true, content: JSON.stringify({
        experience: profile.experience, primaryGoal: profile.primaryGoal, secondaryGoals: profile.secondaryGoals,
        trainingDays: profile.trainingDays, minutesPerSession: profile.minutesPerSession, location: profile.location,
        equipment: profile.equipment, declaredAreas: profile.constraints.map((c) => ({ area: c.area, pattern: c.pattern })),
        exerciseAvoid: profile.exerciseAvoid, penaltyMode: profile.penaltyMode,
      }) };
    case "get_today_mission": {
      const [m] = await db.select().from(schema.plannedSession)
        .where(and(eq(schema.plannedSession.userId, userId), eq(schema.plannedSession.localDate, todayFor(profile, ctx.now))));
      if (!m) return { ok: true, content: JSON.stringify({ mission: null }) };
      return { ok: true, content: JSON.stringify({
        status: m.status, kind: m.prescription.kind, title: m.prescription.title, estimatedMinutes: m.prescription.estimatedMinutes,
        budgetMinutes: m.prescription.budgetMinutes, reasons: m.prescription.reasons,
        exercises: m.prescription.exercises.map((e) => ({ slot: e.slot, exerciseId: e.exerciseId, name: getExercise(e.exerciseId)?.name, sets: e.sets, target: e.target, load: e.load, restSeconds: e.restSeconds, decision: e.decision })),
      }) };
    }
    case "get_training_summary": {
      const rows = await db.select({ localDate: schema.workoutSession.localDate, status: schema.workoutSession.status, xp: schema.workoutSession.xpAwarded, title: schema.workoutSession.prescription })
        .from(schema.workoutSession).where(eq(schema.workoutSession.userId, userId)).orderBy(desc(schema.workoutSession.localDate)).limit(10);
      return { ok: true, content: JSON.stringify(rows.map((r) => ({ localDate: r.localDate, status: r.status, xp: r.xp, title: r.title.title }))) };
    }
    case "get_approved_exercises": {
      const eqc = equipmentContext(profile.equipment);
      return { ok: true, content: JSON.stringify(EXERCISES.filter((e) => hasEquipmentFor(e, eqc) && !profile.exerciseAvoid.includes(e.id))
        .map((e) => ({ id: e.id, name: e.name, pattern: e.pattern, spinalLoad: e.spinalLoad, target: e.defaultTarget.kind }))) };
    }
    case "get_campaign_state": {
      const [ch] = await db.select().from(schema.character).where(eq(schema.character.userId, userId));
      const c = await loadCampaign(db, userId, Boolean(profile.onboardingCompletedAt));
      return { ok: true, content: JSON.stringify({
        level: levelFromTotalXp(ch?.totalXp ?? 0).level, rank: ch?.rank, momentum: ch?.momentum,
        boss: c.boss ? { name: c.boss.name, seals: c.encounter?.seals, sealsBroken: c.encounter?.sealsBroken, status: c.encounter?.status } : null,
        items: c.items.map((i) => getItem(i.itemId)?.name), facts: c.facts.map((f) => f.text),
      }) };
    }
    case "propose_plan_revision": {
      const r = await createProposal(db, userId, input, "claude", ctx.now);
      if ("id" in r && r.id && r.ok) ctx.proposalIds.push(r.id);
      return { ok: r.ok, content: JSON.stringify(r.ok ? { valid: true, note: "Propuesta guardada. El usuario la verá con botones para aplicarla o descartarla." } : { valid: false, errors: r.errors }) };
    }
    default:
      return { ok: false, content: `Herramienta desconocida: ${name}` };
  }
}
