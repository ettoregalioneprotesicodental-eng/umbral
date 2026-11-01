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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
