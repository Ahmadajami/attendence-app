-- DDL Drizzle can't express, and the seeds (consolidated from the Airport-Staff template's custom
-- migrations 0001/0004/0007/0009/0011, without the flight domain and overtime approval).
-- Schema and roles only: never put people or other real data in a migration.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- One person is in one team at a time: open-ended rows (valid_to NULL) count as running forever.
ALTER TABLE "staff_team_membership" ADD CONSTRAINT "staff_team_membership_no_overlap"
	EXCLUDE USING gist (
		"staff_id" WITH =,
		tstzrange("valid_from", "valid_to", '[)') WITH &&
	);
--> statement-breakpoint

-- Versions of one team's cycle never overlap; an open version (effective_to NULL) runs forever.
ALTER TABLE "shift_pattern" ADD CONSTRAINT "shift_pattern_team_no_overlap"
	EXCLUDE USING gist (
		"team_id" WITH =,
		daterange("effective_from", "effective_to", '[)') WITH &&
	)
	WHERE ("team_id" IS NOT NULL);
--> statement-breakpoint

-- The same for one person's own cycle.
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

-- RBAC. Keys must match src/lib/server/rbac/permissions.ts. Change the matrix in a later migration,
-- never by editing this one. Roles are the template's; the HR levels (plan D5) come with login (S8).
INSERT INTO "role" ("key", "name_en", "name_ar") VALUES
	('admin', 'Admin', 'مسؤول النظام'),
	('operations_manager', 'Operations Manager', 'مدير العمليات'),
	('supervisor', 'Supervisor', 'مشرف'),
	('dispatcher', 'Dispatcher', 'منسق الحركة'),
	('viewer', 'Viewer', 'مطّلع')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

INSERT INTO "permission" ("key") VALUES
	('attendance.record'),
	('staff.write'),
	('import.run'),
	('report.read'),
	('user.manage'),
	('user.manage_operational'),
	('user.issue_code'),
	('settings.manage'),
	('audit.read'),
	('roster.manage')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
	-- admin: everything
	('admin', 'attendance.record'),
	('admin', 'staff.write'),
	('admin', 'import.run'),
	('admin', 'report.read'),
	('admin', 'user.manage'),
	('admin', 'user.manage_operational'),
	('admin', 'user.issue_code'),
	('admin', 'settings.manage'),
	('admin', 'audit.read'),
	('admin', 'roster.manage'),
	-- operations_manager
	('operations_manager', 'staff.write'),
	('operations_manager', 'import.run'),
	('operations_manager', 'report.read'),
	('operations_manager', 'user.manage_operational'),
	('operations_manager', 'user.issue_code'),
	('operations_manager', 'audit.read'),
	-- supervisor
	('supervisor', 'report.read'),
	('supervisor', 'user.issue_code'),
	-- dispatcher, viewer
	('dispatcher', 'report.read'),
	('viewer', 'report.read')
) AS m("role_key", "permission_key")
JOIN "role" r ON r."key" = m."role_key"
JOIN "permission" p ON p."key" = m."permission_key"
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Default staff functions (the template's; revisited when departments arrive in S1).
INSERT INTO "staff_function" ("key", "name_en", "name_ar") VALUES
	('ramp', 'Ramp', 'ساحة الطائرات'),
	('baggage', 'Baggage', 'الأمتعة'),
	('check_in', 'Check-in', 'تسجيل الوصول'),
	('gate', 'Gate', 'البوابة')
ON CONFLICT ("key") DO NOTHING;
