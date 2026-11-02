CREATE TYPE "public"."log_cause" AS ENUM('event', 'absence', 'swap', 'holiday', 'pay_rule', 'assignment', 'schedule', 'override', 'none');--> statement-breakpoint
CREATE TYPE "public"."log_field" AS ENUM('created', 'kind', 'status', 'state', 'shift', 'check_in', 'check_out', 'required', 'worked', 'late', 'overtime', 'ot_rate', 'paid_ot', 'unpaid_extra', 'swap');--> statement-breakpoint
CREATE TYPE "public"."log_source" AS ENUM('typed', 'punch_reading', 'odoo_seed', 'correction', 'day_edit', 'mission', 'swap', 'holiday', 'pay_rule', 'roster_change', 'system');--> statement-breakpoint
CREATE TYPE "public"."swap_role" AS ENUM('swap_on', 'swap_off');--> statement-breakpoint
CREATE TYPE "public"."swap_kind" AS ENUM('self_swap', 'emp_swap');--> statement-breakpoint
CREATE TYPE "public"."swap_scope" AS ENUM('week', 'month');--> statement-breakpoint
CREATE TYPE "public"."swap_state" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "attendance_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"shift_date" date NOT NULL,
	"field" "log_field" NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"source" "log_source" NOT NULL,
	"cause_type" "log_cause" NOT NULL,
	"cause_id" uuid,
	"actor_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_log_cause" CHECK (("attendance_log"."cause_type" = 'none') = ("attendance_log"."cause_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "swap_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "swap_kind" NOT NULL,
	"staff_id" uuid NOT NULL,
	"other_staff_id" uuid,
	"first_date" date NOT NULL,
	"second_date" date,
	"scope" "swap_scope" NOT NULL,
	"pay_as_ot" boolean DEFAULT false NOT NULL,
	"reason" text NOT NULL,
	"state" "swap_state" DEFAULT 'pending' NOT NULL,
	"requested_by" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "swap_request_other_staff" CHECK (("swap_request"."kind" = 'emp_swap') = ("swap_request"."other_staff_id" IS NOT NULL) AND ("swap_request"."other_staff_id" IS NULL OR "swap_request"."other_staff_id" <> "swap_request"."staff_id")),
	CONSTRAINT "swap_request_dates" CHECK (("swap_request"."kind" <> 'self_swap' OR "swap_request"."second_date" IS NOT NULL) AND ("swap_request"."second_date" IS NULL OR "swap_request"."second_date" <> "swap_request"."first_date")),
	CONSTRAINT "swap_request_reason_present" CHECK (length(trim("swap_request"."reason")) > 0),
	CONSTRAINT "swap_request_state_fields" CHECK (("swap_request"."state" = 'pending') = ("swap_request"."decided_at" IS NULL AND "swap_request"."cancelled_at" IS NULL) AND ("swap_request"."state" = 'cancelled') = ("swap_request"."cancelled_at" IS NOT NULL) AND ("swap_request"."state" NOT IN ('approved', 'rejected') OR "swap_request"."decided_at" IS NOT NULL) AND ("swap_request"."cancelled_at" IS NULL OR length(trim(coalesce("swap_request"."cancel_reason", ''))) > 0))
);
--> statement-breakpoint
CREATE TABLE "leave_entitlement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"year" smallint NOT NULL,
	"days" numeric(5, 2) NOT NULL,
	"carried_days" numeric(5, 2) DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_entitlement_year_range" CHECK ("leave_entitlement"."year" BETWEEN 2000 AND 2100),
	CONSTRAINT "leave_entitlement_days_range" CHECK ("leave_entitlement"."days" BETWEEN 0 AND 365 AND "leave_entitlement"."carried_days" BETWEEN -365 AND 365),
	CONSTRAINT "leave_entitlement_reason_present" CHECK (length(trim("leave_entitlement"."reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "day_result" ADD COLUMN "check_in_source" "punch_source";--> statement-breakpoint
ALTER TABLE "day_result" ADD COLUMN "check_out_source" "punch_source";--> statement-breakpoint
ALTER TABLE "day_result" ADD COLUMN "corrected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "day_result" ADD COLUMN "swap_request_id" uuid;--> statement-breakpoint
ALTER TABLE "day_result" ADD COLUMN "swap_role" "swap_role";--> statement-breakpoint
ALTER TABLE "day_result" ADD COLUMN "unauth_swap" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_log" ADD CONSTRAINT "attendance_log_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_log" ADD CONSTRAINT "attendance_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_request" ADD CONSTRAINT "swap_request_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_request" ADD CONSTRAINT "swap_request_other_staff_id_staff_id_fk" FOREIGN KEY ("other_staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_request" ADD CONSTRAINT "swap_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_request" ADD CONSTRAINT "swap_request_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_request" ADD CONSTRAINT "swap_request_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_entitlement" ADD CONSTRAINT "leave_entitlement_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_entitlement" ADD CONSTRAINT "leave_entitlement_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_entitlement" ADD CONSTRAINT "leave_entitlement_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_log_day_idx" ON "attendance_log" USING btree ("staff_id","shift_date","at");--> statement-breakpoint
CREATE INDEX "attendance_log_at_idx" ON "attendance_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "swap_request_staff_idx" ON "swap_request" USING btree ("staff_id","first_date");--> statement-breakpoint
CREATE INDEX "swap_request_other_idx" ON "swap_request" USING btree ("other_staff_id","first_date");--> statement-breakpoint
CREATE INDEX "swap_request_state_idx" ON "swap_request" USING btree ("state","first_date");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_entitlement_staff_year_unique" ON "leave_entitlement" USING btree ("staff_id","year");--> statement-breakpoint
ALTER TABLE "day_result" ADD CONSTRAINT "day_result_swap_request_id_swap_request_id_fk" FOREIGN KEY ("swap_request_id") REFERENCES "public"."swap_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_result" ADD CONSTRAINT "day_result_swap" CHECK (("day_result"."swap_request_id" IS NULL) = ("day_result"."swap_role" IS NULL) AND NOT ("day_result"."unauth_swap" AND "day_result"."swap_request_id" IS NOT NULL));