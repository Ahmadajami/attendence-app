CREATE TYPE "public"."absence_type" AS ENUM('sick', 'leave', 'no_show', 'other');--> statement-breakpoint
CREATE TYPE "public"."attendance_event_type" AS ENUM('check_in', 'check_out', 'break_start', 'break_end');--> statement-breakpoint
CREATE TYPE "public"."session_client" AS ENUM('web', 'api');--> statement-breakpoint
CREATE TYPE "public"."import_action" AS ENUM('create', 'update', 'skip');--> statement-breakpoint
CREATE TYPE "public"."import_kind" AS ENUM('staff');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('previewed', 'committed', 'failed');--> statement-breakpoint
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
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login_id" text NOT NULL,
	"ip" text,
	"success" boolean NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"client" "session_client" DEFAULT 'web' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login_id" text NOT NULL,
	"full_name" text NOT NULL,
	"full_name_ar" text,
	"role_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"password_hash" text NOT NULL,
	"password_changed_at" timestamp with time zone,
	"password_expires_at" timestamp with time zone,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_login_id_unique" UNIQUE("login_id"),
	CONSTRAINT "user_login_id_digits" CHECK ("user"."login_id" ~ '^[0-9]+$'),
	CONSTRAINT "user_failed_login_count_non_negative" CHECK ("user"."failed_login_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "import_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "import_kind" NOT NULL,
	"file_name" text NOT NULL,
	"status" "import_status" DEFAULT 'previewed' NOT NULL,
	"created_by" uuid,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"create_count" integer DEFAULT 0 NOT NULL,
	"update_count" integer DEFAULT 0 NOT NULL,
	"skip_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_row" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_no" integer NOT NULL,
	"raw" jsonb,
	"parsed" jsonb,
	"errors" jsonb,
	"action" "import_action" DEFAULT 'skip' NOT NULL,
	"target_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permission_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "role_permission" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permission_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_no" text NOT NULL,
	"full_name" text NOT NULL,
	"full_name_ar" text,
	"phone" text,
	"function_id" uuid NOT NULL,
	"team_id" uuid,
	"user_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"odoo_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_employee_no_unique" UNIQUE("employee_no"),
	CONSTRAINT "staff_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "staff_odoo_id_unique" UNIQUE("odoo_id"),
	CONSTRAINT "staff_employee_no_digits" CHECK ("staff"."employee_no" ~ '^[0-9]+$')
);
--> statement-breakpoint
CREATE TABLE "staff_function" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_function_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "staff_team_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_team_membership_valid_order" CHECK ("staff_team_membership"."valid_to" IS NULL OR "staff_team_membership"."valid_to" > "staff_team_membership"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_name_en_unique" UNIQUE("name_en")
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
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_row" ADD CONSTRAINT "import_row_batch_id_import_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_function_id_staff_function_id_fk" FOREIGN KEY ("function_id") REFERENCES "public"."staff_function"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_team_membership" ADD CONSTRAINT "staff_team_membership_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_team_membership" ADD CONSTRAINT "staff_team_membership_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_setting" ADD CONSTRAINT "app_setting_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "login_attempt_login_id_attempted_at_idx" ON "login_attempt" USING btree ("login_id","attempted_at");--> statement-breakpoint
CREATE INDEX "login_attempt_ip_attempted_at_idx" ON "login_attempt" USING btree ("ip","attempted_at");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_role_id_idx" ON "user" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "import_batch_created_at_idx" ON "import_batch" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "import_row_batch_row_unique" ON "import_row" USING btree ("batch_id","row_no");--> statement-breakpoint
CREATE INDEX "import_row_batch_idx" ON "import_row" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "staff_function_id_idx" ON "staff" USING btree ("function_id");--> statement-breakpoint
CREATE INDEX "staff_team_id_idx" ON "staff" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "staff_team_membership_staff_idx" ON "staff_team_membership" USING btree ("staff_id","valid_from");--> statement-breakpoint
CREATE INDEX "staff_team_membership_team_idx" ON "staff_team_membership" USING btree ("team_id","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_override_active_unique" ON "roster_override" USING btree ("staff_id","shift_date") WHERE "roster_override"."cancelled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "roster_override_date_idx" ON "roster_override" USING btree ("shift_date");--> statement-breakpoint
CREATE INDEX "roster_override_swap_idx" ON "roster_override" USING btree ("swap_group_id");--> statement-breakpoint
CREATE INDEX "shift_pattern_team_idx" ON "shift_pattern" USING btree ("team_id","effective_from");--> statement-breakpoint
CREATE INDEX "shift_pattern_staff_idx" ON "shift_pattern" USING btree ("staff_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "team_supervisor_active_unique" ON "team_supervisor" USING btree ("team_id","staff_id") WHERE "team_supervisor"."removed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "team_supervisor_staff_idx" ON "team_supervisor" USING btree ("staff_id");