CREATE TABLE "pattern" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"type" "pattern_type" NOT NULL,
	"slots" uuid[] NOT NULL,
	"default_work_shift_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pattern_name_en_unique" UNIQUE("name_en"),
	CONSTRAINT "pattern_name_present" CHECK (length(trim("pattern"."name_en")) > 0 AND length(trim("pattern"."name_ar")) > 0),
	CONSTRAINT "pattern_slots_shape" CHECK (array_ndims("pattern"."slots") = 1 AND CASE "pattern"."type" WHEN 'weekly' THEN cardinality("pattern"."slots") = 7 ELSE cardinality("pattern"."slots") BETWEEN 1 AND 28 END),
	CONSTRAINT "pattern_slots_work" CHECK (cardinality(array_remove("pattern"."slots", NULL)) > 0)
);
--> statement-breakpoint
CREATE TABLE "pattern_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern_id" uuid NOT NULL,
	"staff_id" uuid,
	"team_id" uuid,
	"department_id" uuid,
	"anchor_date" date,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pattern_assignment_one_target" CHECK (num_nonnulls("pattern_assignment"."staff_id", "pattern_assignment"."team_id", "pattern_assignment"."department_id") = 1),
	CONSTRAINT "pattern_assignment_effective_order" CHECK ("pattern_assignment"."effective_to" IS NULL OR "pattern_assignment"."effective_to" > "pattern_assignment"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "staff_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"off_weekdays" smallint[],
	"crew_start" smallint,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_schedule_has_rule" CHECK (num_nonnulls("staff_schedule"."off_weekdays", "staff_schedule"."crew_start") > 0),
	CONSTRAINT "staff_schedule_off_weekdays" CHECK ("staff_schedule"."off_weekdays" IS NULL OR (array_ndims("staff_schedule"."off_weekdays") = 1 AND "staff_schedule"."off_weekdays" <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[])),
	CONSTRAINT "staff_schedule_crew_start" CHECK ("staff_schedule"."crew_start" IS NULL OR "staff_schedule"."crew_start" BETWEEN 0 AND 27),
	CONSTRAINT "staff_schedule_effective_order" CHECK ("staff_schedule"."effective_to" IS NULL OR "staff_schedule"."effective_to" > "staff_schedule"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "pattern" ADD CONSTRAINT "pattern_default_work_shift_id_shift_id_fk" FOREIGN KEY ("default_work_shift_id") REFERENCES "public"."shift"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern" ADD CONSTRAINT "pattern_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_assignment" ADD CONSTRAINT "pattern_assignment_pattern_id_pattern_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."pattern"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_assignment" ADD CONSTRAINT "pattern_assignment_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_assignment" ADD CONSTRAINT "pattern_assignment_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_assignment" ADD CONSTRAINT "pattern_assignment_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_assignment" ADD CONSTRAINT "pattern_assignment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_schedule" ADD CONSTRAINT "staff_schedule_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_schedule" ADD CONSTRAINT "staff_schedule_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pattern_assignment_pattern_idx" ON "pattern_assignment" USING btree ("pattern_id");--> statement-breakpoint
CREATE INDEX "pattern_assignment_staff_idx" ON "pattern_assignment" USING btree ("staff_id","effective_from");--> statement-breakpoint
CREATE INDEX "pattern_assignment_team_idx" ON "pattern_assignment" USING btree ("team_id","effective_from");--> statement-breakpoint
CREATE INDEX "pattern_assignment_department_idx" ON "pattern_assignment" USING btree ("department_id","effective_from");--> statement-breakpoint
CREATE INDEX "staff_schedule_staff_idx" ON "staff_schedule" USING btree ("staff_id","effective_from");--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE restrict ON UPDATE no action;