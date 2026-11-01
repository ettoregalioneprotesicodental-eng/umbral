"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { getExercise } from "@/domain/training/catalog";
import { isValidTimeZone } from "@/domain/training/dates";
import { AREA_LABELS } from "@/domain/training/planner";
import { RED_FLAGS } from "@/domain/training/safety";
import {
  ConflictError, confirmRest, getProfile, postponeMission, saveCheckin, setShortMode, startSession,
} from "@/server/training";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const AREAS = Object.keys(AREA_LABELS) as [string, ...string[]];
const FLAG_IDS = RED_FLAGS.map((f) => f.id) as [string, ...string[]];

const optInt = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().int().min(min).max(max).nullable());

const onboardingSchema = z.object({
  alias: z.string().trim().min(1, "Escribe un alias.").max(40),
  timeZone: z.string().refine(isValidTimeZone, "Zona horaria no válida."),
  units: z.enum(["metric", "imperial"]),
  adultConfirmed: z.literal("on", { message: "Debes confirmar que eres mayor de edad." }),
  experience: z.enum(["new", "returning", "intermediate", "advanced"], { message: "Elige tu experiencia." }),
  recentActivity: z.string().trim().max(300).optional(),
  primaryGoal: z.enum(["strength", "body_composition", "general_health", "endurance", "mobility"], { message: "Elige un objetivo." }),
  secondaryGoals: z.array(z.enum(["strength", "body_composition", "general_health", "endurance", "mobility"])).max(4),
  trainingDays: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Elige al menos un día.").max(7),
  minutesPerSession: z.coerce.number().int().min(10, "Mínimo 10 minutos.").max(90),
  location: z.enum(["home", "gym", "outdoor", "mixed"]),
  hasDumbbells: z.boolean(),
  dumbbellLoads: z.string().trim().max(120),
  loadUnit: z.enum(["kg", "lb"]),
  hasMat: z.boolean(),
  exerciseAvoid: z.array(z.string()).max(40),
  exerciseLikes: z.string().trim().max(300).optional(),
  constraintAreas: z.array(z.enum(AREAS)).max(5),
  constraintPattern: z.enum(["occasional", "ongoing"]),
  constraintNote: z.string().trim().max(300).optional(),
  penaltyMode: z.enum(["balanced", "off"]),
  narrativeIntensity: z.enum(["low", "normal", "high"]),
  reducedMotion: z.boolean(),
});

function parseLoads(raw: string): number[] | null {
  if (!raw) return [];
  const parts = raw.split(/[,;\s]+/).filter(Boolean);
  const nums = parts.map((p) => Number(p.replace(",", ".")));
  if (nums.some((n) => !Number.isFinite(n) || n <= 0 || n > 200)) return null;
  return [...new Set(nums)].sort((a, b) => a - b);
}

export async function saveOnboarding(_prev: FormState, fd: FormData): Promise<FormState> {
  const { user } = await requireSession();
  const parsed = onboardingSchema.safeParse({
    alias: fd.get("alias"),
    timeZone: fd.get("timeZone"),
    units: fd.get("units") ?? "metric",
    adultConfirmed: fd.get("adultConfirmed") ?? undefined,
    experience: fd.get("experience") ?? undefined,
    recentActivity: fd.get("recentActivity") ?? "",
    primaryGoal: fd.get("primaryGoal") ?? undefined,
    secondaryGoals: fd.getAll("secondaryGoals"),
    trainingDays: fd.getAll("trainingDays"),
    minutesPerSession: fd.get("minutesPerSession"),
    location: fd.get("location") ?? "home",
    hasDumbbells: fd.get("hasDumbbells") === "on",
    dumbbellLoads: fd.get("dumbbellLoads") ?? "",
    loadUnit: fd.get("loadUnit") ?? "kg",
    hasMat: fd.get("hasMat") === "on",
    exerciseAvoid: fd.getAll("exerciseAvoid"),
    exerciseLikes: fd.get("exerciseLikes") ?? "",
    constraintAreas: fd.getAll("constraintAreas"),
    constraintPattern: fd.get("constraintPattern") ?? "occasional",
    constraintNote: fd.get("constraintNote") ?? "",
    penaltyMode: fd.get("penaltyMode") ?? "balanced",
    narrativeIntensity: fd.get("narrativeIntensity") ?? "normal",
    reducedMotion: fd.get("reducedMotion") === "on",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Revisa los campos marcados.", fieldErrors };
  }
  const d = parsed.data;
  const loads = parseLoads(d.dumbbellLoads);
  if (d.hasDumbbells && loads === null) {
    return { error: "Revisa los campos marcados.", fieldErrors: { dumbbellLoads: "Escribe los pesos como números separados por comas, p. ej. 4, 8, 12." } };
  }
  const avoid = d.exerciseAvoid.filter((id) => getExercise(id));
  const now = new Date();
  const equipment: (typeof schema.profile.$inferInsert)["equipment"] = [];
  if (d.hasDumbbells) equipment.push({ kind: "dumbbell", label: "Mancuernas", count: 2, loads: (loads ?? []).map((v) => ({ value: v, unit: d.loadUnit })) });
  if (d.hasMat) equipment.push({ kind: "mat", label: "Esterilla" });

  const existing = await getProfile(db, user.id);
  const previous = new Map((existing?.constraints ?? []).map((c) => [c.area, c]));
  const constraints = d.constraintAreas.map((area) => ({
    area,
    note: d.constraintNote ?? "",
    pattern: d.constraintPattern,
    declaredAt: previous.get(area)?.declaredAt ?? now.toISOString(),
  }));
  const trainingDays = [...new Set(d.trainingDays)].sort();

  const values = {
    alias: d.alias,
    timeZone: d.timeZone,
    units: d.units,
    adultConfirmed: true,
    experience: d.experience,
    recentActivity: d.recentActivity || null,
    primaryGoal: d.primaryGoal,
    secondaryGoals: d.secondaryGoals.filter((g) => g !== d.primaryGoal),
    daysPerWeek: trainingDays.length,
    trainingDays,
    minutesPerSession: d.minutesPerSession,
    location: d.location,
    equipment,
    exerciseAvoid: avoid,
    exerciseLikes: d.exerciseLikes ? d.exerciseLikes.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 20) : [],
    constraints,
    penaltyMode: d.penaltyMode,
    narrativeIntensity: d.narrativeIntensity,
    reducedMotion: d.reducedMotion,
    onboardingCompletedAt: existing?.onboardingCompletedAt ?? now,
    updatedAt: now,
  };
  await db.insert(schema.profile).values({ userId: user.id, ...values }).onConflictDoUpdate({ target: schema.profile.userId, set: values });
  await db.update(schema.character).set({ hunterName: d.alias, updatedAt: now }).where(eq(schema.character.userId, user.id));

  // Si la misión de hoy sigue sin empezar, se recalcula con el perfil nuevo.
  const p = await getProfile(db, user.id);
  if (p) await setShortMode(db, p, false);
  revalidatePath("/hoy");
  redirect("/hoy");
}

const checkinSchema = z.object({
  availableMinutes: optInt(5, 180),
  energy: optInt(1, 5),
  fatigue: optInt(1, 5),
  discomfort: z.enum(["none", "mild", "moderate"]),
  areas: z.array(z.enum(AREAS)).max(5),
  redFlags: z.array(z.enum(FLAG_IDS)).max(FLAG_IDS.length),
  note: z.string().trim().max(300).optional(),
});

export async function submitCheckin(_prev: FormState, fd: FormData): Promise<FormState> {
  const { user } = await requireSession();
  const parsed = checkinSchema.safeParse({
    availableMinutes: fd.get("availableMinutes"),
    energy: fd.get("energy"),
    fatigue: fd.get("fatigue"),
    discomfort: fd.get("discomfort") ?? "none",
    areas: fd.getAll("areas"),
    redFlags: fd.getAll("redFlags"),
    note: fd.get("note") ?? "",
  });
  if (!parsed.success) return { error: "Revisa el chequeo: hay valores fuera de rango." };
  const profile = await getProfile(db, user.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding");
  const d = parsed.data;
  await saveCheckin(db, profile, { ...d, note: d.note || null, areas: d.discomfort === "none" ? [] : d.areas });
  revalidatePath("/hoy");
  redirect("/hoy");
}

async function profileOrOnboarding() {
  const { user } = await requireSession();
  const profile = await getProfile(db, user.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding");
  return { user, profile };
}

export async function startMissionAction(fd: FormData) {
  const { user } = await profileOrOnboarding();
  let wsId: string;
  try {
    wsId = (await startSession(db, user.id, String(fd.get("missionId") ?? ""))).id;
  } catch (e) {
    if (e instanceof ConflictError) redirect("/hoy");
    throw e;
  }
  redirect(`/sesion/${wsId}`);
}

export async function shortModeAction(fd: FormData) {
  const { profile } = await profileOrOnboarding();
  await setShortMode(db, profile, fd.get("short") === "1");
  revalidatePath("/hoy");
  redirect("/hoy");
}

export async function postponeAction(fd: FormData) {
  const { user } = await profileOrOnboarding();
  await postponeMission(db, user.id, String(fd.get("missionId") ?? "")).catch((e) => { if (!(e instanceof ConflictError)) throw e; });
  revalidatePath("/hoy");
  redirect("/hoy");
}

export async function confirmRestAction(fd: FormData) {
  const { user } = await profileOrOnboarding();
  await confirmRest(db, user.id, String(fd.get("missionId") ?? "")).catch((e) => { if (!(e instanceof ConflictError)) throw e; });
  revalidatePath("/hoy");
  redirect("/hoy");
}

/* ------------------------------------------------------------------ */
/* Entrenador (IA) y campaña                                           */
/* ------------------------------------------------------------------ */

export async function askCoachAction(fd: FormData) {
  const { user } = await profileOrOnboarding();
  const q = String(fd.get("question") ?? "").trim();
  if (q) {
    const { askCoach } = await import("@/ai/coach");
    await askCoach(db, user.id, q);
  }
  revalidatePath("/entrenador");
  redirect("/entrenador#ultimo");
}

export async function decideProposalAction(fd: FormData) {
  const { user } = await profileOrOnboarding();
  const { decideProposal } = await import("@/server/proposals");
  const id = String(fd.get("proposalId") ?? "");
  const accept = fd.get("decision") === "apply";
  const r = await decideProposal(db, user.id, id, accept).catch((e) => {
    if (e instanceof ConflictError) return { status: "invalid" as const };
    throw e;
  });
  revalidatePath("/entrenador");
  revalidatePath("/hoy");
  redirect(r.status === "applied" ? "/hoy" : "/entrenador");
}

export async function revertPenaltyAction(fd: FormData) {
  const { user } = await profileOrOnboarding();
  const { revertMomentumPenalty } = await import("@/server/game");
  await revertMomentumPenalty(db, user.id, String(fd.get("eventId") ?? ""));
  revalidatePath("/cazador");
  redirect("/cazador");
}
