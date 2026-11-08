ALTER TABLE "staff" ADD COLUMN "legacy_badge_no" text;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_legacy_badge_no_unique" UNIQUE("legacy_badge_no");--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_legacy_badge_no_digits" CHECK ("staff"."legacy_badge_no" ~ '^[0-9]+$');