CREATE TABLE "department" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"parent_id" uuid,
	"manager_staff_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"odoo_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "department_odoo_id_unique" UNIQUE("odoo_id"),
	CONSTRAINT "department_sibling_name_unique" UNIQUE NULLS NOT DISTINCT("parent_id","name_en"),
	CONSTRAINT "department_not_own_parent" CHECK ("department"."parent_id" IS NULL OR "department"."parent_id" <> "department"."id")
);
--> statement-breakpoint
ALTER TABLE "staff" ALTER COLUMN "function_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "work_email" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "department" ADD CONSTRAINT "department_parent_id_department_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."department"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department" ADD CONSTRAINT "department_manager_staff_id_staff_id_fk" FOREIGN KEY ("manager_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "department_parent_id_idx" ON "department" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_department_id_idx" ON "staff" USING btree ("department_id");