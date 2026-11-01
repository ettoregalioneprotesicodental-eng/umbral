import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import * as schema from "@/lib/db/schema";
import { getExercise } from "@/domain/training/catalog";
import { equipmentContext } from "@/domain/training/equipment";
import { estimateMinutes, initialLoad, makeAllowed } from "@/domain/training/planner";
import type { PrescribedExercise, SessionPrescription } from "@/domain/training/types";
import { validatePrescription } from "@/domain/training/validate";
import { ConflictError, NotFoundError, checkinToInput, getCheckin, getProfile, todayFor, type AnyDb } from "./training";

/**
 * Cambios que se pueden PROPONER sobre la misión de hoy. Es un lenguaje deliberadamente pequeño:
 * no permite inventar ejercicios, cargas ni objetivos; el resto lo decide el código.
 */
export const proposalChangeSchema = z.object({
  slot: z.string().min(1).max(40),
  action: z.enum(["replace", "set_sets", "remove"]),
  exerciseId: z.string().min(1).max(60).nullable().optional(),
  sets: z.number().int().nullable().optional(),
});
export const proposalInputSchema = z.object({
  changes: z.array(proposalChangeSchema).min(1).max(6),
  reason: z.string().min(3).max(400),
});
export type ProposalInput = z.infer<typeof proposalInputSchema>;

export function applyChanges(base: SessionPrescription, input: ProposalInput, eq: ReturnType<typeof equipmentContext>): { prescription: SessionPrescription; errors: string[] } {
  const errors: string[] = [];
  let exercises: PrescribedExercise[] = base.exercises.map((e) => ({ ...e }));
  for (const c of input.changes) {
    const idx = exercises.findIndex((e) => e.slot === c.slot);
    if (idx < 0) { errors.push(`La ranura ${c.slot} no existe en la misión de hoy.`); continue; }
    const cur = exercises[idx]!;
    if (c.action === "remove") {
      exercises = exercises.filter((_, i) => i !== idx);
    } else if (c.action === "set_sets") {
      if (c.sets == null) { errors.push("Falta el número de series."); continue; }
      exercises[idx] = { ...cur, sets: c.sets, decision: { kind: "reduce", reason: input.reason } };
    } else {
      const ex = c.exerciseId ? getExercise(c.exerciseId) : undefined;
      if (!ex) { errors.push(`Ejercicio fuera del catálogo revisado: ${c.exerciseId ?? "(vacío)"}`); continue; }
      exercises[idx] = {
        ...cur,
        exerciseId: ex.id,
        target: ex.defaultTarget,
        load: ex.loadable ? initialLoad(ex, eq) : null,
        decision: { kind: "substitute", reason: input.reason },
      };
    }
  }
  if (exercises.length === 0) errors.push("La propuesta deja la misión sin ejercicios; para eso existe «Hoy no puedo».");
  const prescription: SessionPrescription = {
    ...base,
    exercises,
    estimatedMinutes: estimateMinutes(exercises, base.warmup),
    reasons: [...base.reasons, `Cambio aceptado por ti: ${input.reason}`],
  };
  return { prescription, errors };
}

/**
 * Crea una propuesta y la valida con las MISMAS reglas que el planificador (AC09).
 * Nunca modifica la misión: solo la guarda como pendiente para que el usuario decida.
 */
export async function createProposal(db: AnyDb, userId: string, raw: unknown, source: "claude" | "rules", now = new Date()) {
  const parsed = proposalInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, errors: ["Formato de propuesta inválido."] };
  const profile = await getProfile(db, userId);
  if (!profile) throw new NotFoundError("Perfil no encontrado");
  const date = todayFor(profile, now);
  const [mission] = await db.select().from(schema.plannedSession)
    .where(and(eq(schema.plannedSession.userId, userId), eq(schema.plannedSession.localDate, date)));
  if (!mission) return { ok: false as const, errors: ["Todavía no hay misión hoy."] };
  if (mission.status !== "planned") return { ok: false as const, errors: ["La misión ya empezó o está cerrada; no se puede cambiar."] };

  const eqc = equipmentContext(profile.equipment);
  const checkin = checkinToInput(await getCheckin(db, userId, date));
  const { prescription, errors } = applyChanges(mission.prescription, parsed.data, eqc);
  const v = validatePrescription(prescription, {
    equipment: eqc,
    avoid: profile.exerciseAvoid,
    budgetMinutes: mission.prescription.budgetMinutes,
    isAllowed: makeAllowed({ equipment: eqc, avoid: profile.exerciseAvoid, declaredAreas: profile.constraints.map((c) => c.area), checkin }),
  });
  const allErrors = [...errors, ...v.errors];
  const id = randomUUID();
  await db.insert(schema.planProposal).values({
    id, userId, plannedSessionId: mission.id, baseRevision: mission.revision, proposal: prescription,
    reason: parsed.data.reason, valid: allErrors.length === 0, errors: allErrors, source,
  });
  return { ok: allErrors.length === 0, id, errors: allErrors, estimatedMinutes: prescription.estimatedMinutes };
}

/** Aplica una propuesta válida si la misión sigue igual que cuando se propuso. */
export async function decideProposal(db: AnyDb, userId: string, proposalId: string, accept: boolean) {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(schema.planProposal)
      .where(and(eq(schema.planProposal.id, proposalId), eq(schema.planProposal.userId, userId))).for("update");
    if (!p) throw new NotFoundError("Propuesta no encontrada");
    if (p.status !== "pending") return { status: p.status };
    if (!accept) {
      await tx.update(schema.planProposal).set({ status: "rejected", decidedAt: new Date() }).where(eq(schema.planProposal.id, p.id));
      return { status: "rejected" as const };
    }
    if (!p.valid) throw new ConflictError("Una propuesta que no pasó la validación no se puede aplicar.");
    const [m] = await tx.select().from(schema.plannedSession).where(eq(schema.plannedSession.id, p.plannedSessionId)).for("update");
    if (!m || m.status !== "planned" || m.revision !== p.baseRevision) {
      await tx.update(schema.planProposal).set({ status: "stale", decidedAt: new Date() }).where(eq(schema.planProposal.id, p.id));
      return { status: "stale" as const };
    }
    await tx.update(schema.plannedSession).set({ prescription: p.proposal, revision: m.revision + 1, updatedAt: new Date() })
      .where(eq(schema.plannedSession.id, m.id));
    await tx.update(schema.planProposal).set({ status: "applied", decidedAt: new Date() }).where(eq(schema.planProposal.id, p.id));
    return { status: "applied" as const };
  });
}

export async function listProposals(db: AnyDb, userId: string, limit = 10) {
  return db.select().from(schema.planProposal).where(eq(schema.planProposal.userId, userId))
    .orderBy(desc(schema.planProposal.createdAt)).limit(limit);
}
