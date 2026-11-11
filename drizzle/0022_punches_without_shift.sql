ALTER TABLE "attendance_event" DROP CONSTRAINT "attendance_event_shift_id_shift_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_event" DROP COLUMN "shift_id";