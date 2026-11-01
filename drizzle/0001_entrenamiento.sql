CREATE TABLE "daily_checkin" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"local_date" text NOT NULL,
	"available_minutes" integer,
	"energy" integer,
	"fatigue" integer,
	"discomfort" text NOT NULL,
	"areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"red_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "energy_range" CHECK ("daily_checkin"."energy" IS NULL OR "daily_checkin"."energy" BETWEEN 1 AND 5),
	CONSTRAINT "fatigue_range" CHECK ("daily_checkin"."fatigue" IS NULL OR "daily_checkin"."fatigue" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "planned_session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"local_date" text NOT NULL,
	"time_zone" text NOT NULL,
	"kind" text NOT NULL,
	"prescription" jsonb NOT NULL,
	"rules_version" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_date_format" CHECK ("planned_session"."local_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);
--> statement-breakpoint
CREATE TABLE "set_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"set_index" integer NOT NULL,
	"kind" text NOT NULL,
	"reps" integer,
	"seconds" integer,
	"load_value" numeric(6, 2),
	"load_unit" text,
	"rir" integer,
	"discomfort" boolean DEFAULT false NOT NULL,
	"note" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reps_range" CHECK ("set_log"."reps" IS NULL OR "set_log"."reps" BETWEEN 0 AND 1000),
	CONSTRAINT "seconds_range" CHECK ("set_log"."seconds" IS NULL OR "set_log"."seconds" BETWEEN 0 AND 36000),
	CONSTRAINT "rir_range" CHECK ("set_log"."rir" IS NULL OR "set_log"."rir" BETWEEN 0 AND 10),
	CONSTRAINT "load_has_unit" CHECK (("set_log"."load_value" IS NULL) = ("set_log"."load_unit" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "workout_session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"planned_session_id" text NOT NULL,
	"local_date" text NOT NULL,
	"prescription" jsonb NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"xp_awarded" integer,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "training_days" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_checkin" ADD CONSTRAINT "daily_checkin_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_session" ADD CONSTRAINT "planned_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_log" ADD CONSTRAINT "set_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_log" ADD CONSTRAINT "set_log_session_id_workout_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_planned_session_id_planned_session_id_fk" FOREIGN KEY ("planned_session_id") REFERENCES "public"."planned_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_checkin_user_date_uq" ON "daily_checkin" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "planned_session_user_date_uq" ON "planned_session" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "set_log_session_idx" ON "set_log" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "set_log_user_exercise_idx" ON "set_log" USING btree ("user_id","exercise_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_session_planned_uq" ON "workout_session" USING btree ("planned_session_id");--> statement-breakpoint
CREATE INDEX "workout_session_user_date_idx" ON "workout_session" USING btree ("user_id","local_date");