CREATE TYPE "public"."absence_type" AS ENUM('sick', 'leave', 'no_show', 'other');--> statement-breakpoint
CREATE TYPE "public"."attendance_event_type" AS ENUM('check_in', 'check_out', 'break_start', 'break_end');--> statement-breakpoint
CREATE TYPE "public"."shift_kind" AS ENUM('day', 'night', 'off');--> statement-breakpoint
CREATE TABLE "absence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"type" "absence_type" NOT NULL,
	"reason" text,
	"recorded_by" uuid,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "absence_date_order" CHECK ("absence"."ends_on" >= "absence"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "attendance_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"type" "attendance_event_type" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"shift_date" date NOT NULL,
	"shift_kind" "shift_kind" NOT NULL,
	"team_id" uuid,
	"recorded_by" uuid,
	"note" text,
	"corrects_event_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_event_worked_kind" CHECK ("attendance_event"."shift_kind" <> 'off'),
	CONSTRAINT "attendance_event_correction_reason" CHECK ("attendance_event"."corrects_event_id" IS NULL OR length(trim(coalesce("attendance_event"."reason", ''))) > 0)
);
--> statement-breakpoint
CREATE TABLE "app_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overtime_approval" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"shift_date" date NOT NULL,
	"shift_kind" "shift_kind" NOT NULL,
	"minutes" integer NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_by" uuid,
	"revoked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "overtime_approval_minutes" CHECK ("overtime_approval"."minutes" > 0 AND "overtime_approval"."minutes" % 15 = 0),
	CONSTRAINT "overtime_approval_worked_kind" CHECK ("overtime_approval"."shift_kind" <> 'off')
);
--> statement-breakpoint
CREATE TABLE "roster_override" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"shift_date" date NOT NULL,
	"kind" "shift_kind" NOT NULL,
	"reason" text NOT NULL,
	"swap_group_id" uuid,
	"created_by" uuid,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roster_override_reason_present" CHECK (length(trim("roster_override"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "shift_pattern" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid,
	"staff_id" uuid,
	"cycle" "shift_kind"[] NOT NULL,
	"anchor_date" date NOT NULL,
	"day_start" time NOT NULL,
	"night_start" time NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_pattern_one_owner" CHECK (num_nonnulls("shift_pattern"."team_id", "shift_pattern"."staff_id") = 1),
	CONSTRAINT "shift_pattern_cycle_shape" CHECK (array_ndims("shift_pattern"."cycle") = 1 AND cardinality("shift_pattern"."cycle") BETWEEN 1 AND 28 AND array_position("shift_pattern"."cycle", NULL) IS NULL),
	CONSTRAINT "shift_pattern_cycle_works" CHECK ("shift_pattern"."cycle" && ARRAY['day', 'night']::shift_kind[]),
	CONSTRAINT "shift_pattern_effective_order" CHECK ("shift_pattern"."effective_to" IS NULL OR "shift_pattern"."effective_to" > "shift_pattern"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "team_supervisor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_by" uuid,
	"removed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_supervisor_removed_order" CHECK ("team_supervisor"."removed_at" IS NULL OR "team_supervisor"."removed_at" >= "team_supervisor"."added_at")
);
--> statement-breakpoint
ALTER TABLE "absence" ADD CONSTRAINT "absence_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absence" ADD CONSTRAINT "absence_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absence" ADD CONSTRAINT "absence_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_event" ADD CONSTRAINT "attendance_event_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_event" ADD CONSTRAINT "attendance_event_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_event" ADD CONSTRAINT "attendance_event_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_event" ADD CONSTRAINT "attendance_event_corrects_event_id_attendance_event_id_fk" FOREIGN KEY ("corrects_event_id") REFERENCES "public"."attendance_event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_setting" ADD CONSTRAINT "app_setting_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_approval" ADD CONSTRAINT "overtime_approval_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_approval" ADD CONSTRAINT "overtime_approval_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_approval" ADD CONSTRAINT "overtime_approval_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_override" ADD CONSTRAINT "roster_override_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_override" ADD CONSTRAINT "roster_override_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_override" ADD CONSTRAINT "roster_override_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_pattern" ADD CONSTRAINT "shift_pattern_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_pattern" ADD CONSTRAINT "shift_pattern_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_pattern" ADD CONSTRAINT "shift_pattern_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_supervisor" ADD CONSTRAINT "team_supervisor_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_supervisor" ADD CONSTRAINT "team_supervisor_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_supervisor" ADD CONSTRAINT "team_supervisor_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_supervisor" ADD CONSTRAINT "team_supervisor_removed_by_user_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "absence_staff_idx" ON "absence" USING btree ("staff_id","starts_on");--> statement-breakpoint
CREATE INDEX "absence_dates_idx" ON "absence" USING btree ("starts_on","ends_on");--> statement-breakpoint
CREATE INDEX "attendance_event_staff_idx" ON "attendance_event" USING btree ("staff_id","occurred_at");--> statement-breakpoint
CREATE INDEX "attendance_event_team_date_idx" ON "attendance_event" USING btree ("team_id","shift_date");--> statement-breakpoint
CREATE INDEX "attendance_event_date_idx" ON "attendance_event" USING btree ("shift_date");--> statement-breakpoint
CREATE INDEX "attendance_event_corrects_idx" ON "attendance_event" USING btree ("corrects_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "overtime_approval_active_unique" ON "overtime_approval" USING btree ("staff_id","shift_date") WHERE "overtime_approval"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "overtime_approval_date_idx" ON "overtime_approval" USING btree ("shift_date");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_override_active_unique" ON "roster_override" USING btree ("staff_id","shift_date") WHERE "roster_override"."cancelled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "roster_override_date_idx" ON "roster_override" USING btree ("shift_date");--> statement-breakpoint
CREATE INDEX "roster_override_swap_idx" ON "roster_override" USING btree ("swap_group_id");--> statement-breakpoint
CREATE INDEX "shift_pattern_team_idx" ON "shift_pattern" USING btree ("team_id","effective_from");--> statement-breakpoint
CREATE INDEX "shift_pattern_staff_idx" ON "shift_pattern" USING btree ("staff_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "team_supervisor_active_unique" ON "team_supervisor" USING btree ("team_id","staff_id") WHERE "team_supervisor"."removed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "team_supervisor_staff_idx" ON "team_supervisor" USING btree ("staff_id");