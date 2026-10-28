ALTER TABLE "attendance_event" DROP CONSTRAINT "attendance_event_worked_kind";--> statement-breakpoint
ALTER TABLE "shift_pattern" DROP CONSTRAINT "shift_pattern_cycle_shape";--> statement-breakpoint
ALTER TABLE "shift_pattern" DROP CONSTRAINT "shift_pattern_cycle_works";--> statement-breakpoint
ALTER TABLE "attendance_event" DROP COLUMN "shift_kind";--> statement-breakpoint
ALTER TABLE "roster_override" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "shift_pattern" DROP COLUMN "cycle";--> statement-breakpoint
ALTER TABLE "shift_pattern" DROP COLUMN "day_start";--> statement-breakpoint
ALTER TABLE "shift_pattern" DROP COLUMN "night_start";--> statement-breakpoint
DROP TYPE "public"."shift_kind";