CREATE TYPE "public"."punch_source" AS ENUM('manual', 'seed', 'import');--> statement-breakpoint
ALTER TABLE "attendance_event" ADD COLUMN "source" "punch_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_event" ADD COLUMN "is_void" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "attendance_event_staff_date_idx" ON "attendance_event" USING btree ("staff_id","shift_date");--> statement-breakpoint
ALTER TABLE "attendance_event" ADD CONSTRAINT "attendance_event_void_is_correction" CHECK (NOT "attendance_event"."is_void" OR "attendance_event"."corrects_event_id" IS NOT NULL);