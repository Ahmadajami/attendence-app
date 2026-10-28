CREATE TYPE "public"."pattern_type" AS ENUM('weekly', 'cycle');--> statement-breakpoint
CREATE TABLE "shift" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"colour" text NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"ends_next_day" boolean GENERATED ALWAYS AS ("end_time" <= "start_time") STORED NOT NULL,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"required_minutes" integer,
	"window_before_minutes" integer DEFAULT 180 NOT NULL,
	"window_after_minutes" integer DEFAULT 360 NOT NULL,
	"grace_minutes" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_code_unique" UNIQUE("code"),
	CONSTRAINT "shift_code_format" CHECK ("shift"."code" ~ '^[A-Z0-9]{1,3}$' AND "shift"."code" <> 'OFF'),
	CONSTRAINT "shift_colour_format" CHECK ("shift"."colour" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "shift_break_range" CHECK ("shift"."break_minutes" BETWEEN 0 AND 720),
	CONSTRAINT "shift_required_range" CHECK ("shift"."required_minutes" IS NULL OR "shift"."required_minutes" BETWEEN 1 AND 1440),
	CONSTRAINT "shift_window_range" CHECK ("shift"."window_before_minutes" BETWEEN 0 AND 720 AND "shift"."window_after_minutes" BETWEEN 0 AND 720),
	CONSTRAINT "shift_grace_range" CHECK ("shift"."grace_minutes" BETWEEN 0 AND 120)
);
--> statement-breakpoint
ALTER TABLE "shift_pattern" DROP CONSTRAINT "shift_pattern_one_owner";--> statement-breakpoint
ALTER TABLE "shift_pattern" ALTER COLUMN "anchor_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_event" ADD COLUMN "shift_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "roster_override" ADD COLUMN "shift_id" uuid;--> statement-breakpoint
ALTER TABLE "shift_pattern" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "shift_pattern" ADD COLUMN "type" "pattern_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "shift_pattern" ADD COLUMN "slots" uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_event" ADD CONSTRAINT "attendance_event_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_override" ADD CONSTRAINT "roster_override_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_pattern" ADD CONSTRAINT "shift_pattern_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shift_pattern_department_idx" ON "shift_pattern" USING btree ("department_id","effective_from");--> statement-breakpoint
ALTER TABLE "shift_pattern" ADD CONSTRAINT "shift_pattern_slots_shape" CHECK (array_ndims("shift_pattern"."slots") = 1 AND CASE "shift_pattern"."type" WHEN 'weekly' THEN cardinality("shift_pattern"."slots") = 7 ELSE cardinality("shift_pattern"."slots") BETWEEN 1 AND 28 END);--> statement-breakpoint
ALTER TABLE "shift_pattern" ADD CONSTRAINT "shift_pattern_slots_work" CHECK (cardinality(array_remove("shift_pattern"."slots", NULL)) > 0);--> statement-breakpoint
ALTER TABLE "shift_pattern" ADD CONSTRAINT "shift_pattern_anchor" CHECK (("shift_pattern"."type" = 'cycle') = ("shift_pattern"."anchor_date" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "shift_pattern" ADD CONSTRAINT "shift_pattern_one_owner" CHECK (num_nonnulls("shift_pattern"."team_id", "shift_pattern"."staff_id", "shift_pattern"."department_id") = 1);