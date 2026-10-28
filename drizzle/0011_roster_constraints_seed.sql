-- DDL Drizzle can't express (CLAUDE.md §7) and the permission changes for ROSTER_PLAN.md (RB6).
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- Versions of one team's cycle never overlap; an open version (effective_to NULL) runs forever.
ALTER TABLE "shift_pattern" ADD CONSTRAINT "shift_pattern_team_no_overlap"
	EXCLUDE USING gist (
		"team_id" WITH =,
		daterange("effective_from", "effective_to", '[)') WITH &&
	)
	WHERE ("team_id" IS NOT NULL);
--> statement-breakpoint

-- The same for one person's personal cycle.
ALTER TABLE "shift_pattern" ADD CONSTRAINT "shift_pattern_staff_no_overlap"
	EXCLUDE USING gist (
		"staff_id" WITH =,
		daterange("effective_from", "effective_to", '[)') WITH &&
	)
	WHERE ("staff_id" IS NOT NULL);
--> statement-breakpoint

-- One person's active absences never overlap (both dates inclusive).
ALTER TABLE "absence" ADD CONSTRAINT "absence_no_overlap"
	EXCLUDE USING gist (
		"staff_id" WITH =,
		daterange("starts_on", "ends_on", '[]') WITH &&
	)
	WHERE ("cancelled_at" IS NULL);
--> statement-breakpoint

-- New permissions. Keep in sync with src/lib/server/rbac/permissions.ts (PERMISSIONS).
INSERT INTO "permission" ("key") VALUES
	('roster.manage'),
	('overtime.approve')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

-- Roster, attendance and overtime work is admin only (owner, 2026-10-27).
INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
	('admin', 'roster.manage'),
	('admin', 'overtime.approve')
) AS m("role_key", "permission_key")
JOIN "role" r ON r."key" = m."role_key"
JOIN "permission" p ON p."key" = m."permission_key"
ON CONFLICT DO NOTHING;
--> statement-breakpoint

DELETE FROM "role_permission" rp
USING "role" r, "permission" p
WHERE rp."role_id" = r."id"
	AND rp."permission_id" = p."id"
	AND p."key" = 'attendance.record'
	AND r."key" IN ('operations_manager', 'supervisor');
