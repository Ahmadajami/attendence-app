CREATE TYPE "public"."day_kind" AS ENUM('work', 'off_work', 'holiday_work', 'holiday_off', 'absence', 'off');--> statement-breakpoint
CREATE TYPE "public"."day_status" AS ENUM('expected', 'present', 'late', 'on_break', 'done', 'missing', 'absent', 'off', 'unscheduled');--> statement-breakpoint
CREATE TYPE "public"."roster_source" AS ENUM('absence', 'override', 'personal', 'team', 'department', 'none');--> statement-breakpoint
CREATE TYPE "public"."unpaid_reason" AS ENUM('ot_off', 'person_no_ot', 'holiday_not_eligible', 'absence');--> statement-breakpoint
ALTER TYPE "public"."absence_type" ADD VALUE 'mission';--> statement-breakpoint
CREATE TABLE "day_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"shift_date" date NOT NULL,
	"kind" "day_kind" NOT NULL,
	"status" "day_status" NOT NULL,
	"source" "roster_source" NOT NULL,
	"pattern_id" uuid,
	"shift_id" uuid,
	"team_id" uuid,
	"holiday_id" uuid,
	"absence_type" "absence_type",
	"check_in" timestamp with time zone,
	"check_out" timestamp with time zone,
	"required_minutes" integer DEFAULT 0 NOT NULL,
	"worked_minutes" integer,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"overtime_minutes" integer DEFAULT 0 NOT NULL,
	"ot_rate" numeric(4, 2),
	"paid_ot_minutes" integer DEFAULT 0 NOT NULL,
	"unpaid_extra_minutes" integer DEFAULT 0 NOT NULL,
	"unpaid_reason" "unpaid_reason",
	"explanation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"inputs_hash" text NOT NULL,
	"needs_recompute" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_result_minutes" CHECK ("day_result"."required_minutes" >= 0 AND ("day_result"."worked_minutes" IS NULL OR "day_result"."worked_minutes" >= 0) AND "day_result"."late_minutes" >= 0 AND "day_result"."overtime_minutes" >= 0 AND "day_result"."paid_ot_minutes" >= 0 AND "day_result"."unpaid_extra_minutes" >= 0),
	CONSTRAINT "day_result_rate_range" CHECK ("day_result"."ot_rate" IS NULL OR "day_result"."ot_rate" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "pattern_holiday" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"ot_eligible" boolean DEFAULT false NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pattern_holiday_dates" CHECK ("pattern_holiday"."ends_on" >= "pattern_holiday"."starts_on" AND "pattern_holiday"."ends_on" - "pattern_holiday"."starts_on" < 14),
	CONSTRAINT "pattern_holiday_name_present" CHECK (length(trim("pattern_holiday"."name_en")) > 0 AND length(trim("pattern_holiday"."name_ar")) > 0),
	CONSTRAINT "pattern_holiday_reason_present" CHECK (length(trim("pattern_holiday"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "pattern_pay_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern_id" uuid NOT NULL,
	"ot_enabled" boolean,
	"work_day_rate" numeric(4, 2),
	"off_day_rate" numeric(4, 2),
	"holiday_rate" numeric(4, 2),
	"effective_from" date NOT NULL,
	"effective_to" date,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pattern_pay_rule_has_value" CHECK (num_nonnulls("pattern_pay_rule"."ot_enabled", "pattern_pay_rule"."work_day_rate", "pattern_pay_rule"."off_day_rate", "pattern_pay_rule"."holiday_rate") > 0),
	CONSTRAINT "pattern_pay_rule_rate_range" CHECK (("pattern_pay_rule"."work_day_rate" IS NULL OR "pattern_pay_rule"."work_day_rate" BETWEEN 1 AND 5) AND ("pattern_pay_rule"."off_day_rate" IS NULL OR "pattern_pay_rule"."off_day_rate" BETWEEN 1 AND 5) AND ("pattern_pay_rule"."holiday_rate" IS NULL OR "pattern_pay_rule"."holiday_rate" BETWEEN 1 AND 5)),
	CONSTRAINT "pattern_pay_rule_reason_present" CHECK (length(trim("pattern_pay_rule"."reason")) > 0),
	CONSTRAINT "pattern_pay_rule_effective_order" CHECK ("pattern_pay_rule"."effective_to" IS NULL OR "pattern_pay_rule"."effective_to" > "pattern_pay_rule"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "absence" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "absence" ADD COLUMN "pattern_id" uuid;--> statement-breakpoint
ALTER TABLE "day_result" ADD CONSTRAINT "day_result_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_result" ADD CONSTRAINT "day_result_pattern_id_pattern_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."pattern"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_result" ADD CONSTRAINT "day_result_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_result" ADD CONSTRAINT "day_result_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_result" ADD CONSTRAINT "day_result_holiday_id_pattern_holiday_id_fk" FOREIGN KEY ("holiday_id") REFERENCES "public"."pattern_holiday"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_holiday" ADD CONSTRAINT "pattern_holiday_pattern_id_pattern_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."pattern"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_holiday" ADD CONSTRAINT "pattern_holiday_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_holiday" ADD CONSTRAINT "pattern_holiday_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_pay_rule" ADD CONSTRAINT "pattern_pay_rule_pattern_id_pattern_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."pattern"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_pay_rule" ADD CONSTRAINT "pattern_pay_rule_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "day_result_staff_date_unique" ON "day_result" USING btree ("staff_id","shift_date");--> statement-breakpoint
CREATE INDEX "day_result_date_idx" ON "day_result" USING btree ("shift_date");--> statement-breakpoint
CREATE INDEX "day_result_recompute_idx" ON "day_result" USING btree ("shift_date") WHERE "day_result"."needs_recompute";--> statement-breakpoint
CREATE INDEX "pattern_holiday_pattern_idx" ON "pattern_holiday" USING btree ("pattern_id","starts_on");--> statement-breakpoint
CREATE INDEX "pattern_pay_rule_pattern_idx" ON "pattern_pay_rule" USING btree ("pattern_id","effective_from");--> statement-breakpoint
ALTER TABLE "absence" ADD CONSTRAINT "absence_pattern_id_pattern_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."pattern"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "absence_group_idx" ON "absence" USING btree ("group_id");