-- DDL Drizzle can't express (CLAUDE.md §7), for OPERATIONS_PLAN X6.
-- One person is in one team at a time: open-ended rows (valid_to NULL) count as running forever.
ALTER TABLE "staff_team_membership" ADD CONSTRAINT "staff_team_membership_no_overlap"
	EXCLUDE USING gist (
		"staff_id" WITH =,
		tstzrange("valid_from", "valid_to", '[)') WITH &&
	);
--> statement-breakpoint

-- Backfill: every staff member already in a team gets an open membership from when the row was
-- last changed (the best known start; the history begins here).
INSERT INTO "staff_team_membership" ("staff_id", "team_id", "valid_from")
SELECT "id", "team_id", "updated_at"
FROM "staff"
WHERE "team_id" IS NOT NULL
	AND NOT EXISTS (
		SELECT 1 FROM "staff_team_membership" m WHERE m."staff_id" = "staff"."id" AND m."valid_to" IS NULL
	);
