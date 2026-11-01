CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character" (
	"user_id" text PRIMARY KEY NOT NULL,
	"hunter_name" text NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"rank" text DEFAULT 'E' NOT NULL,
	"momentum" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "total_xp_nonneg" CHECK ("character"."total_xp" >= 0),
	CONSTRAINT "momentum_range" CHECK ("character"."momentum" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "experience_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"rules_version" text NOT NULL,
	"corrects_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"alias" text NOT NULL,
	"locale" text DEFAULT 'es' NOT NULL,
	"time_zone" text DEFAULT 'Europe/Madrid' NOT NULL,
	"units" text DEFAULT 'metric' NOT NULL,
	"adult_confirmed" boolean DEFAULT false NOT NULL,
	"experience" text,
	"recent_activity" text,
	"primary_goal" text,
	"secondary_goals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"days_per_week" integer,
	"minutes_per_session" integer,
	"location" text,
	"equipment" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exercise_likes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exercise_avoid" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"penalty_mode" text DEFAULT 'balanced' NOT NULL,
	"narrative_intensity" text DEFAULT 'normal' NOT NULL,
	"reduced_motion" boolean DEFAULT false NOT NULL,
	"sound_enabled" boolean DEFAULT false NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "days_per_week_range" CHECK ("profile"."days_per_week" IS NULL OR ("profile"."days_per_week" BETWEEN 1 AND 7)),
	CONSTRAINT "minutes_range" CHECK ("profile"."minutes_per_session" IS NULL OR ("profile"."minutes_per_session" BETWEEN 5 AND 180))
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character" ADD CONSTRAINT "character_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_event" ADD CONSTRAINT "experience_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "xp_event_idem_uq" ON "experience_event" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "xp_event_single_correction_uq" ON "experience_event" USING btree ("corrects_event_id") WHERE "experience_event"."corrects_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "xp_event_user_created_idx" ON "experience_event" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");