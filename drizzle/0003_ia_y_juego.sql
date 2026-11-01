CREATE TABLE "ai_run" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"status" text NOT NULL,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"reserved_micro_usd" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" integer DEFAULT 0 NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"rules_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "boss_encounter" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"boss_id" text NOT NULL,
	"seals" integer NOT NULL,
	"seals_broken" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"defeated_at" timestamp with time zone,
	CONSTRAINT "seals_range" CHECK ("boss_encounter"."seals_broken" BETWEEN 0 AND "boss_encounter"."seals")
);
--> statement-breakpoint
CREATE TABLE "boss_event" (
	"id" text PRIMARY KEY NOT NULL,
	"encounter_id" text NOT NULL,
	"mission_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_message" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"origin" text NOT NULL,
	"run_id" text,
	"proposal_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "momentum_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mission_id" text NOT NULL,
	"local_date" text NOT NULL,
	"week_start" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"rules_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_proposal" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"planned_session_id" text NOT NULL,
	"base_revision" integer NOT NULL,
	"proposal" jsonb NOT NULL,
	"reason" text NOT NULL,
	"valid" boolean NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "story_fact" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_item" (
	"user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"source" text NOT NULL,
	"equipped" boolean DEFAULT true NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_run" ADD CONSTRAINT "ai_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_encounter" ADD CONSTRAINT "boss_encounter_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_event" ADD CONSTRAINT "boss_event_encounter_id_boss_encounter_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."boss_encounter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_message" ADD CONSTRAINT "coach_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "momentum_event" ADD CONSTRAINT "momentum_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_proposal" ADD CONSTRAINT "plan_proposal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_proposal" ADD CONSTRAINT "plan_proposal_planned_session_id_planned_session_id_fk" FOREIGN KEY ("planned_session_id") REFERENCES "public"."planned_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_fact" ADD CONSTRAINT "story_fact_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_item" ADD CONSTRAINT "user_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_run_user_created_idx" ON "ai_run" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "boss_encounter_user_boss_uq" ON "boss_encounter" USING btree ("user_id","boss_id");--> statement-breakpoint
CREATE UNIQUE INDEX "boss_event_mission_uq" ON "boss_event" USING btree ("encounter_id","mission_id");--> statement-breakpoint
CREATE INDEX "coach_message_user_created_idx" ON "coach_message" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "momentum_event_mission_reason_uq" ON "momentum_event" USING btree ("mission_id","reason");--> statement-breakpoint
CREATE INDEX "momentum_event_user_week_idx" ON "momentum_event" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE INDEX "plan_proposal_user_idx" ON "plan_proposal" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "story_fact_user_key_uq" ON "story_fact" USING btree ("user_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "user_item_uq" ON "user_item" USING btree ("user_id","item_id");