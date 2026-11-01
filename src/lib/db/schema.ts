import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
  index,
  check,
  numeric,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { SessionPrescription } from "@/domain/training/types";

/* ------------------------------------------------------------------ */
/* Autenticación (tablas requeridas por Better Auth)                   */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Perfil de entrenamiento (datos que cambian el plan)                 */
/* ------------------------------------------------------------------ */

export type TrainingLocation = "home" | "gym" | "outdoor" | "mixed";
export type ExperienceLevel = "new" | "returning" | "intermediate" | "advanced";

/** Material disponible. Las cargas llevan unidad explícita. */
export interface EquipmentItem {
  kind: "dumbbell" | "mat" | "bench" | "pullup_bar" | "band" | "kettlebell" | "barbell" | "other";
  label: string;
  count?: number;
  /** Cargas utilizables, siempre con unidad. */
  loads?: { value: number; unit: "kg" | "lb" }[];
  adjustable?: boolean;
}

export interface DeclaredConstraint {
  area: string;
  note: string;
  /** "occasional": aparece a veces; el sistema prioriza alternativas sin agravar la zona. */
  pattern: "occasional" | "ongoing" | "past";
  declaredAt: string;
}

export const profile = pgTable(
  "profile",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    locale: text("locale").notNull().default("es"),
    /** Zona IANA, p. ej. "Europe/Madrid". Los instantes se guardan en UTC. */
    timeZone: text("time_zone").notNull().default("Europe/Madrid"),
    units: text("units").$type<"metric" | "imperial">().notNull().default("metric"),
    adultConfirmed: boolean("adult_confirmed").notNull().default(false),
    experience: text("experience").$type<ExperienceLevel>(),
    recentActivity: text("recent_activity"),
    primaryGoal: text("primary_goal"),
    secondaryGoals: jsonb("secondary_goals").$type<string[]>().notNull().default([]),
    daysPerWeek: integer("days_per_week"),
    /** Días ISO (1 = lunes … 7 = domingo) en los que quiere entrenar. */
    trainingDays: jsonb("training_days").$type<number[]>().notNull().default([]),
    minutesPerSession: integer("minutes_per_session"),
    location: text("location").$type<TrainingLocation>(),
    equipment: jsonb("equipment").$type<EquipmentItem[]>().notNull().default([]),
    exerciseLikes: jsonb("exercise_likes").$type<string[]>().notNull().default([]),
    exerciseAvoid: jsonb("exercise_avoid").$type<string[]>().notNull().default([]),
    constraints: jsonb("constraints").$type<DeclaredConstraint[]>().notNull().default([]),
    penaltyMode: text("penalty_mode").$type<"balanced" | "off">().notNull().default("balanced"),
    narrativeIntensity: text("narrative_intensity").$type<"low" | "normal" | "high">().notNull().default("normal"),
    reducedMotion: boolean("reduced_motion").notNull().default(false),
    soundEnabled: boolean("sound_enabled").notNull().default(false),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("days_per_week_range", sql`${t.daysPerWeek} IS NULL OR (${t.daysPerWeek} BETWEEN 1 AND 7)`),
    check("minutes_range", sql`${t.minutesPerSession} IS NULL OR (${t.minutesPerSession} BETWEEN 5 AND 180)`),
  ],
);

/* ------------------------------------------------------------------ */
/* Personaje y libro de eventos de experiencia                         */
/* ------------------------------------------------------------------ */

export const character = pgTable(
  "character",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    hunterName: text("hunter_name").notNull(),
    /** Saldo derivado del libro de eventos; se actualiza en la misma transacción. */
    totalXp: integer("total_xp").notNull().default(0),
    rank: text("rank").notNull().default("E"),
    momentum: integer("momentum").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("total_xp_nonneg", sql`${t.totalXp} >= 0`),
    check("momentum_range", sql`${t.momentum} BETWEEN 0 AND 100`),
  ],
);

/**
 * Libro de eventos de experiencia. El cliente nunca envía cantidades de XP:
 * el servidor calcula y registra con una clave idempotente única por usuario.
 */
export const experienceEvent = pgTable(
  "experience_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    /** Positivo para concesiones, negativo para correcciones. */
    amount: integer("amount").notNull(),
    reason: text("reason")
      .$type<"daily_mission" | "partial_mission" | "milestone" | "weekly_bonus" | "boss" | "correction">()
      .notNull(),
    source: text("source").notNull(),
    rulesVersion: text("rules_version").notNull(),
    /** Evento corregido, si es una corrección. */
    correctsEventId: text("corrects_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("xp_event_idem_uq").on(t.userId, t.idempotencyKey),
    uniqueIndex("xp_event_single_correction_uq")
      .on(t.correctsEventId)
      .where(sql`${t.correctsEventId} IS NOT NULL`),
    index("xp_event_user_created_idx").on(t.userId, t.createdAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Entrenamiento                                                       */
/* ------------------------------------------------------------------ */

export type MissionStatus = "planned" | "in_progress" | "completed" | "partial" | "postponed" | "exempt" | "skipped";

/**
 * Misión principal de un día local. Una por usuario y día (índice único), así que
 * refrescar, cambiar de zona o abrir dos pestañas no crea duplicados (AC14).
 * La prescripción es inmutable una vez iniciada la sesión.
 */
export const plannedSession = pgTable(
  "planned_session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    timeZone: text("time_zone").notNull(),
    kind: text("kind").$type<SessionPrescription["kind"]>().notNull(),
    prescription: jsonb("prescription").$type<SessionPrescription>().notNull(),
    rulesVersion: text("rules_version").notNull(),
    /** Revisión de la prescripción mientras siga sin empezar. */
    revision: integer("revision").notNull().default(1),
    status: text("status").$type<MissionStatus>().notNull().default("planned"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("planned_session_user_date_uq").on(t.userId, t.localDate),
    check("local_date_format", sql`${t.localDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`),
  ],
);

export const dailyCheckin = pgTable(
  "daily_checkin",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    availableMinutes: integer("available_minutes"),
    energy: integer("energy"),
    fatigue: integer("fatigue"),
    discomfort: text("discomfort").$type<"none" | "mild" | "moderate" | "red_flag">().notNull(),
    areas: jsonb("areas").$type<string[]>().notNull().default([]),
    redFlags: jsonb("red_flags").$type<string[]>().notNull().default([]),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("daily_checkin_user_date_uq").on(t.userId, t.localDate),
    check("energy_range", sql`${t.energy} IS NULL OR ${t.energy} BETWEEN 1 AND 5`),
    check("fatigue_range", sql`${t.fatigue} IS NULL OR ${t.fatigue} BETWEEN 1 AND 5`),
  ],
);

export const workoutSession = pgTable(
  "workout_session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    plannedSessionId: text("planned_session_id").notNull().references(() => plannedSession.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    /** Copia de la prescripción en el momento de empezar: plan ≠ ejecución. */
    prescription: jsonb("prescription").$type<SessionPrescription>().notNull(),
    status: text("status").$type<"in_progress" | "completed" | "abandoned">().notNull().default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    xpAwarded: integer("xp_awarded"),
    note: text("note"),
  },
  (t) => [
    uniqueIndex("workout_session_planned_uq").on(t.plannedSessionId),
    index("workout_session_user_date_idx").on(t.userId, t.localDate),
  ],
);

/**
 * Series registradas. El id lo genera el cliente: reenviar la misma operación no duplica (AC05).
 * Deshacer = marca de borrado; corregir = nueva revisión de la misma fila.
 */
export const setLog = pgTable(
  "set_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull().references(() => workoutSession.id, { onDelete: "cascade" }),
    exerciseId: text("exercise_id").notNull(),
    /** Ranura de la prescripción (permite sustituir el ejercicio manteniendo la finalidad). */
    slot: text("slot").notNull(),
    setIndex: integer("set_index").notNull(),
    kind: text("kind").$type<"warmup" | "working" | "incomplete" | "skipped">().notNull(),
    reps: integer("reps"),
    seconds: integer("seconds"),
    loadValue: numeric("load_value", { precision: 6, scale: 2 }),
    loadUnit: text("load_unit").$type<"kg" | "lb">(),
    rir: integer("rir"),
    discomfort: boolean("discomfort").notNull().default(false),
    note: text("note"),
    revision: integer("revision").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("set_log_session_idx").on(t.sessionId),
    index("set_log_user_exercise_idx").on(t.userId, t.exerciseId, t.createdAt),
    check("reps_range", sql`${t.reps} IS NULL OR ${t.reps} BETWEEN 0 AND 1000`),
    check("seconds_range", sql`${t.seconds} IS NULL OR ${t.seconds} BETWEEN 0 AND 36000`),
    check("rir_range", sql`${t.rir} IS NULL OR ${t.rir} BETWEEN 0 AND 10`),
    check("load_has_unit", sql`(${t.loadValue} IS NULL) = (${t.loadUnit} IS NULL)`),
  ],
);

/* ------------------------------------------------------------------ */
/* IA: ejecuciones, presupuesto, conversación y propuestas             */
/* ------------------------------------------------------------------ */

/**
 * Cada llamada (o intento) a la IA queda registrada. El gasto se RESERVA antes de llamar
 * y se liquida después, de modo que el presupuesto limita trabajos concurrentes (AC23).
 */
export const aiRun = pgTable(
  "ai_run",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    purpose: text("purpose").$type<"coach_chat" | "story" | "research">().notNull(),
    status: text("status").$type<"reserved" | "ok" | "error" | "refused_budget" | "refusal">().notNull(),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    /** Microdólares (USD × 1e6) reservados antes de la llamada. */
    reservedMicroUsd: integer("reserved_micro_usd").notNull().default(0),
    /** Coste estimado real tras la llamada, con la tabla de precios configurada. */
    costMicroUsd: integer("cost_micro_usd").notNull().default(0),
    toolCalls: jsonb("tool_calls").$type<{ name: string; ok: boolean }[]>().notNull().default([]),
    error: text("error"),
    rulesVersion: text("rules_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("ai_run_user_created_idx").on(t.userId, t.createdAt)],
);

export const coachMessage = pgTable(
  "coach_message",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    /** template = respuesta guardada; model = generada por Claude; unavailable = aviso de indisponibilidad. */
    origin: text("origin").$type<"user" | "template" | "model" | "unavailable">().notNull(),
    runId: text("run_id"),
    proposalId: text("proposal_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("coach_message_user_created_idx").on(t.userId, t.createdAt)],
);

/** Propuestas de cambio de la misión. Nunca se aplican sin validación y sin confirmación del usuario. */
export const planProposal = pgTable(
  "plan_proposal",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    plannedSessionId: text("planned_session_id").notNull().references(() => plannedSession.id, { onDelete: "cascade" }),
    baseRevision: integer("base_revision").notNull(),
    proposal: jsonb("proposal").$type<SessionPrescription>().notNull(),
    reason: text("reason").notNull(),
    valid: boolean("valid").notNull(),
    errors: jsonb("errors").$type<string[]>().notNull().default([]),
    source: text("source").$type<"claude" | "rules">().notNull(),
    status: text("status").$type<"pending" | "applied" | "rejected" | "stale">().notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("plan_proposal_user_idx").on(t.userId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Juego: jefes, impulso, inventario y hechos de campaña               */
/* ------------------------------------------------------------------ */

export const bossEncounter = pgTable(
  "boss_encounter",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    bossId: text("boss_id").notNull(),
    seals: integer("seals").notNull(),
    sealsBroken: integer("seals_broken").notNull().default(0),
    status: text("status").$type<"active" | "defeated">().notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    defeatedAt: timestamp("defeated_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("boss_encounter_user_boss_uq").on(t.userId, t.bossId),
    check("seals_range", sql`${t.sealsBroken} BETWEEN 0 AND ${t.seals}`),
  ],
);

/** Un sello roto por misión como máximo (AC06/AC07/AC24). */
export const bossEvent = pgTable(
  "boss_event",
  {
    id: text("id").primaryKey(),
    encounterId: text("encounter_id").notNull().references(() => bossEncounter.id, { onDelete: "cascade" }),
    missionId: text("mission_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("boss_event_mission_uq").on(t.encounterId, t.missionId)],
);

export const momentumEvent = pgTable(
  "momentum_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    missionId: text("mission_id").notNull(),
    /** Fecha local a la que se imputa (semana de la penalización o día de la recuperación). */
    localDate: text("local_date").notNull(),
    weekStart: text("week_start").notNull(),
    delta: integer("delta").notNull(),
    reason: text("reason").$type<"skip" | "recovery" | "revert">().notNull(),
    rulesVersion: text("rules_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("momentum_event_mission_reason_uq").on(t.missionId, t.reason),
    index("momentum_event_user_week_idx").on(t.userId, t.weekStart),
  ],
);

export const userItem = pgTable(
  "user_item",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    source: text("source").notNull(),
    equipped: boolean("equipped").notNull().default(true),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_item_uq").on(t.userId, t.itemId)],
);

/** Hechos canónicos de la campaña: lo que la narrativa puede recordar. */
export const storyFact = pgTable(
  "story_fact",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("story_fact_user_key_uq").on(t.userId, t.key)],
);
