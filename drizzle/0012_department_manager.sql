CREATE TABLE "department_manager" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "department_manager_valid_order" CHECK ("department_manager"."valid_to" IS NULL OR "department_manager"."valid_to" > "department_manager"."valid_from")
);
--> statement-breakpoint
ALTER TABLE "department_manager" ADD CONSTRAINT "department_manager_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_manager" ADD CONSTRAINT "department_manager_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_manager" ADD CONSTRAINT "department_manager_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "department_manager_department_idx" ON "department_manager" USING btree ("department_id","valid_from");--> statement-breakpoint
CREATE INDEX "department_manager_staff_idx" ON "department_manager" USING btree ("staff_id","valid_from");