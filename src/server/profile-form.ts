import "server-only";
import type { ProfileFormValues } from "@/components/profile-form";
import type { schema } from "@/lib/db";
import { EXERCISES } from "@/domain/training/catalog";
import { AREA_LABELS } from "@/domain/training/planner";

type Profile = typeof schema.profile.$inferSelect;

export function profileToForm(p: Profile | null, fallbackAlias: string): ProfileFormValues {
  const db = p?.equipment.find((e) => e.kind === "dumbbell");
  const c = p?.constraints ?? [];
  return {
    alias: p?.alias ?? fallbackAlias,
    timeZone: p?.onboardingCompletedAt ? p.timeZone : null,
    units: p?.units ?? "metric",
    adultConfirmed: p?.adultConfirmed ?? false,
    experience: p?.experience ?? null,
    recentActivity: p?.recentActivity ?? "",
    primaryGoal: p?.primaryGoal ?? null,
    secondaryGoals: p?.secondaryGoals ?? [],
    trainingDays: p?.trainingDays ?? [],
    minutesPerSession: p?.minutesPerSession ?? null,
    location: p?.location ?? null,
    hasDumbbells: Boolean(db),
    dumbbellLoads: db?.loads?.map((l) => l.value).join(", ") ?? "",
    loadUnit: db?.loads?.[0]?.unit ?? "kg",
    hasMat: Boolean(p?.equipment.some((e) => e.kind === "mat")),
    exerciseAvoid: p?.exerciseAvoid ?? [],
    exerciseLikes: (p?.exerciseLikes ?? []).join(", "),
    constraintAreas: c.map((x) => x.area),
    constraintPattern: c[0]?.pattern === "ongoing" ? "ongoing" : "occasional",
    constraintNote: c[0]?.note ?? "",
    penaltyMode: p?.penaltyMode ?? "balanced",
    narrativeIntensity: p?.narrativeIntensity ?? "normal",
    reducedMotion: p?.reducedMotion ?? false,
  };
}

export const formExercises = EXERCISES.map((e) => ({ id: e.id, name: e.name }));
export const formAreas = Object.entries(AREA_LABELS).map(([id, label]) => ({ id, label }));
