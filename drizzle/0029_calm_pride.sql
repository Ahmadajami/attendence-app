CREATE TABLE "off_day_leave_conversion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"minutes" numeric,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "off_day_leave_conversion_minutes_positive" CHECK ("off_day_leave_conversion"."minutes" IS NULL OR ("off_day_leave_conversion"."minutes" > 0 AND "off_day_leave_conversion"."minutes" < 'Infinity'::numeric)),
	CONSTRAINT "off_day_leave_conversion_reason_present" CHECK (length(trim("off_day_leave_conversion"."reason")) > 0),
	CONSTRAINT "off_day_leave_conversion_effective_order" CHECK ("off_day_leave_conversion"."effective_to" IS NULL OR "off_day_leave_conversion"."effective_to" > "off_day_leave_conversion"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "pattern_pay_rule" DROP CONSTRAINT "pattern_pay_rule_has_value";--> statement-breakpoint
ALTER TABLE "pattern_pay_rule" DROP CONSTRAINT "pattern_pay_rule_rate_range";--> statement-breakpoint
ALTER TABLE "pattern_pay_rule" ADD COLUMN "night_rate" numeric(4, 2);--> statement-breakpoint
ALTER TABLE "off_day_leave_conversion" ADD CONSTRAINT "off_day_leave_conversion_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "off_day_leave_conversion_from_unique" ON "off_day_leave_conversion" USING btree ("effective_from");--> statement-breakpoint
ALTER TABLE "pattern_pay_rule" ADD CONSTRAINT "pattern_pay_rule_has_value" CHECK (num_nonnulls("pattern_pay_rule"."ot_enabled", "pattern_pay_rule"."work_day_rate", "pattern_pay_rule"."off_day_rate", "pattern_pay_rule"."holiday_rate", "pattern_pay_rule"."night_rate") > 0);--> statement-breakpoint
ALTER TABLE "pattern_pay_rule" ADD CONSTRAINT "pattern_pay_rule_rate_range" CHECK (("pattern_pay_rule"."work_day_rate" IS NULL OR "pattern_pay_rule"."work_day_rate" BETWEEN 1 AND 5) AND ("pattern_pay_rule"."off_day_rate" IS NULL OR "pattern_pay_rule"."off_day_rate" BETWEEN 1 AND 5) AND ("pattern_pay_rule"."holiday_rate" IS NULL OR "pattern_pay_rule"."holiday_rate" BETWEEN 1 AND 5) AND ("pattern_pay_rule"."night_rate" IS NULL OR "pattern_pay_rule"."night_rate" BETWEEN 1 AND 5));