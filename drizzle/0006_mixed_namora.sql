CREATE TYPE "public"."assignment_status" AS ENUM('assigned', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."flight_direction" AS ENUM('arrival', 'departure');--> statement-breakpoint
CREATE TYPE "public"."flight_source" AS ENUM('manual', 'import', 'feed');--> statement-breakpoint
CREATE TYPE "public"."flight_status" AS ENUM('scheduled', 'delayed', 'boarding', 'departed', 'arrived', 'cancelled', 'diverted');--> statement-breakpoint
CREATE TYPE "public"."import_action" AS ENUM('create', 'update', 'skip');--> statement-breakpoint
CREATE TYPE "public"."import_kind" AS ENUM('staff', 'flights');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('previewed', 'committed', 'failed');--> statement-breakpoint
CREATE TABLE "team_flight_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"flight_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "assignment_status" DEFAULT 'assigned' NOT NULL,
	"assigned_by" uuid,
	"override_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_flight_assignment_window_order" CHECK ("team_flight_assignment"."ends_at" > "team_flight_assignment"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "flight" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"airline_code" text NOT NULL,
	"flight_no" text NOT NULL,
	"direction" "flight_direction" NOT NULL,
	"origin" text,
	"destination" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"estimated_at" timestamp with time zone,
	"actual_at" timestamp with time zone,
	"status" "flight_status" DEFAULT 'scheduled' NOT NULL,
	"stand" text,
	"gate" text,
	"aircraft_type" text,
	"handling_starts_at" timestamp with time zone NOT NULL,
	"handling_ends_at" timestamp with time zone NOT NULL,
	"source" "flight_source" DEFAULT 'manual' NOT NULL,
	"external_ref" text,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flight_handling_window_order" CHECK ("flight"."handling_ends_at" > "flight"."handling_starts_at")
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
ALTER TABLE "team_flight_assignment" ADD CONSTRAINT "team_flight_assignment_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_flight_assignment" ADD CONSTRAINT "team_flight_assignment_flight_id_flight_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flight"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_flight_assignment" ADD CONSTRAINT "team_flight_assignment_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_row" ADD CONSTRAINT "import_row_batch_id_import_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_function_id_staff_function_id_fk" FOREIGN KEY ("function_id") REFERENCES "public"."staff_function"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_flight_assignment_team_idx" ON "team_flight_assignment" USING btree ("team_id","starts_at");--> statement-breakpoint
CREATE INDEX "team_flight_assignment_flight_idx" ON "team_flight_assignment" USING btree ("flight_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_flight_assignment_active_flight_unique" ON "team_flight_assignment" USING btree ("flight_id") WHERE "team_flight_assignment"."status" <> 'cancelled';--> statement-breakpoint
CREATE UNIQUE INDEX "flight_source_external_ref_unique" ON "flight" USING btree ("source","external_ref");--> statement-breakpoint
CREATE INDEX "flight_scheduled_at_idx" ON "flight" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "import_batch_created_at_idx" ON "import_batch" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "import_row_batch_row_unique" ON "import_row" USING btree ("batch_id","row_no");--> statement-breakpoint
CREATE INDEX "import_row_batch_idx" ON "import_row" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "staff_function_id_idx" ON "staff" USING btree ("function_id");--> statement-breakpoint
CREATE INDEX "staff_team_id_idx" ON "staff" USING btree ("team_id");