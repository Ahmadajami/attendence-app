ALTER TABLE "staff" ADD COLUMN "father_name_en" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "father_name_ar" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "mother_name_en" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "mother_name_ar" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "national_id_no" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "national_id_issued_on" date;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "national_id_expires_on" date;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "passport_no" text;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_national_id_dates" CHECK ("staff"."national_id_expires_on" IS NULL OR "staff"."national_id_issued_on" IS NULL OR "staff"."national_id_expires_on" >= "staff"."national_id_issued_on");