CREATE TABLE "job_title" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_title_name_en_unique" UNIQUE("name_en")
);
--> statement-breakpoint
CREATE TABLE "custody_item_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custody_item_type_name_en_unique" UNIQUE("name_en")
);
--> statement-breakpoint
CREATE TABLE "document_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_type_name_en_unique" UNIQUE("name_en")
);
--> statement-breakpoint
CREATE TABLE "skill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_name_en_unique" UNIQUE("name_en")
);
--> statement-breakpoint
CREATE TABLE "staff_custody_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"item_type_id" uuid NOT NULL,
	"identifier" text,
	"issued_on" date NOT NULL,
	"status" text DEFAULT 'with_employee' NOT NULL,
	"status_on" date,
	"note" text,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_custody_item_status" CHECK ("staff_custody_item"."status" IN ('with_employee', 'returned', 'lost', 'damaged')),
	CONSTRAINT "staff_custody_item_status_on" CHECK ("staff_custody_item"."status_on" IS NULL OR "staff_custody_item"."status_on" >= "staff_custody_item"."issued_on")
);
--> statement-breakpoint
CREATE TABLE "staff_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"document_type_id" uuid NOT NULL,
	"received" boolean DEFAULT false NOT NULL,
	"received_on" date,
	"reference_no" text,
	"expires_on" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_document_staff_type_unique" UNIQUE("staff_id","document_type_id"),
	CONSTRAINT "staff_document_received_on" CHECK (NOT "staff_document"."received" OR "staff_document"."received_on" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "staff_emergency_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relationship" text NOT NULL,
	"phone" text NOT NULL,
	"phone_2" text,
	"position" smallint DEFAULT 0 NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_experience" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"employer" text NOT NULL,
	"job_title" text NOT NULL,
	"started_on" date NOT NULL,
	"ended_on" date,
	"note" text,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_experience_dates_order" CHECK ("staff_experience"."ended_on" IS NULL OR "staff_experience"."ended_on" >= "staff_experience"."started_on")
);
--> statement-breakpoint
CREATE TABLE "staff_skill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"level" smallint,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_skill_level_range" CHECK ("staff_skill"."level" IS NULL OR "staff_skill"."level" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "staff_social_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "first_name_en" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "last_name_en" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "first_name_ar" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "last_name_ar" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "job_title_id" uuid;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "personal_email" text;--> statement-breakpoint
ALTER TABLE "staff_custody_item" ADD CONSTRAINT "staff_custody_item_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_custody_item" ADD CONSTRAINT "staff_custody_item_item_type_id_custody_item_type_id_fk" FOREIGN KEY ("item_type_id") REFERENCES "public"."custody_item_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_custody_item" ADD CONSTRAINT "staff_custody_item_removed_by_user_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_document" ADD CONSTRAINT "staff_document_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_document" ADD CONSTRAINT "staff_document_document_type_id_document_type_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."document_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_emergency_contact" ADD CONSTRAINT "staff_emergency_contact_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_emergency_contact" ADD CONSTRAINT "staff_emergency_contact_removed_by_user_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_experience" ADD CONSTRAINT "staff_experience_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_experience" ADD CONSTRAINT "staff_experience_removed_by_user_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_skill" ADD CONSTRAINT "staff_skill_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_skill" ADD CONSTRAINT "staff_skill_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_skill" ADD CONSTRAINT "staff_skill_removed_by_user_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_social_account" ADD CONSTRAINT "staff_social_account_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_social_account" ADD CONSTRAINT "staff_social_account_removed_by_user_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_custody_item_staff_idx" ON "staff_custody_item" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "staff_custody_item_type_idx" ON "staff_custody_item" USING btree ("item_type_id");--> statement-breakpoint
CREATE INDEX "staff_document_type_idx" ON "staff_document" USING btree ("document_type_id");--> statement-breakpoint
CREATE INDEX "staff_emergency_contact_staff_idx" ON "staff_emergency_contact" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "staff_experience_staff_idx" ON "staff_experience" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_skill_active_unique" ON "staff_skill" USING btree ("staff_id","skill_id") WHERE "staff_skill"."removed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "staff_skill_skill_idx" ON "staff_skill" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "staff_social_account_staff_idx" ON "staff_social_account" USING btree ("staff_id");--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_job_title_id_job_title_id_fk" FOREIGN KEY ("job_title_id") REFERENCES "public"."job_title"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_job_title_id_idx" ON "staff" USING btree ("job_title_id");--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_personal_email_format" CHECK ("staff"."personal_email" ~ '^[^@[:space:]]+@[^@[:space:]]+$');