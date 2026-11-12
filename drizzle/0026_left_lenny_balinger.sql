CREATE TABLE "attendance_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"overtime_step" integer NOT NULL,
	"overtime_mode" text NOT NULL,
	"friday_prayer_on" boolean NOT NULL,
	"friday_prayer_minutes" integer NOT NULL,
	"friday_prayer_segments" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_rule_step" CHECK ("attendance_rule"."overtime_step" IN (0, 5, 10, 15, 30)),
	CONSTRAINT "attendance_rule_mode" CHECK ("attendance_rule"."overtime_mode" IN ('nearest', 'up', 'down')),
	CONSTRAINT "attendance_rule_prayer_minutes" CHECK ("attendance_rule"."friday_prayer_minutes" BETWEEN 0 AND 240 AND "attendance_rule"."friday_prayer_segments" BETWEEN 1 AND 10),
	CONSTRAINT "attendance_rule_reason_present" CHECK (length(trim("attendance_rule"."reason")) > 0),
	CONSTRAINT "attendance_rule_effective_order" CHECK ("attendance_rule"."effective_to" IS NULL OR "attendance_rule"."effective_to" > "attendance_rule"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "day_result" DROP CONSTRAINT "day_result_minutes";--> statement-breakpoint
ALTER TABLE "day_result" ADD COLUMN "credit_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "day_result" ADD COLUMN "shortage_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "day_result" ADD COLUMN "credit_extra_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_rule" ADD CONSTRAINT "attendance_rule_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_rule_from_unique" ON "attendance_rule" USING btree ("effective_from");--> statement-breakpoint
CREATE INDEX "attendance_rule_to_idx" ON "attendance_rule" USING btree ("effective_to");--> statement-breakpoint
ALTER TABLE "day_result" ADD CONSTRAINT "day_result_minutes" CHECK ("day_result"."required_minutes" >= 0 AND ("day_result"."worked_minutes" IS NULL OR "day_result"."worked_minutes" >= 0) AND "day_result"."late_minutes" >= 0 AND "day_result"."overtime_minutes" >= 0 AND "day_result"."paid_ot_minutes" >= 0 AND "day_result"."unpaid_extra_minutes" >= 0 AND "day_result"."credit_minutes" >= 0 AND "day_result"."shortage_minutes" >= 0 AND "day_result"."credit_extra_minutes" >= 0);--> statement-breakpoint
INSERT INTO "attendance_rule" ("overtime_step", "overtime_mode", "friday_prayer_on", "friday_prayer_minutes", "friday_prayer_segments", "effective_from", "effective_to", "reason")
VALUES (0, 'nearest', true, 60, 2, '2026-10-01', NULL, 'Odoo rules for October 2026 (OC7): no overtime rounding; Friday Prayer 60 minutes on a Friday with two segments (FP1).');
