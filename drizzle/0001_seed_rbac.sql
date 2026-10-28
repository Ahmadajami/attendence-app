-- RBAC seed: the 5 roles, all permission keys, and the proposed default role -> permission matrix.
-- Keys must match src/lib/server/rbac/permissions.ts. The matrix is provisional (CLAUDE.md §10):
-- change it in a later migration, never by editing this one.

INSERT INTO "role" ("key", "name_en", "name_ar") VALUES
	('admin', 'Admin', 'مسؤول النظام'),
	('operations_manager', 'Operations Manager', 'مدير العمليات'),
	('supervisor', 'Supervisor', 'مشرف'),
	('dispatcher', 'Dispatcher', 'منسق الحركة'),
	('viewer', 'Viewer', 'مطّلع')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

INSERT INTO "permission" ("key") VALUES
	('flight.read'),
	('flight.write'),
	('assignment.write'),
	('attendance.record'),
	('staff.write'),
	('import.run'),
	('report.read'),
	('user.manage'),
	('user.manage_operational'),
	('settings.manage'),
	('audit.read')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
	-- admin: everything
	('admin', 'flight.read'),
	('admin', 'flight.write'),
	('admin', 'assignment.write'),
	('admin', 'attendance.record'),
	('admin', 'staff.write'),
	('admin', 'import.run'),
	('admin', 'report.read'),
	('admin', 'user.manage'),
	('admin', 'user.manage_operational'),
	('admin', 'settings.manage'),
	('admin', 'audit.read'),
	-- operations_manager: operations + supervisor/dispatcher/viewer accounts
	('operations_manager', 'flight.read'),
	('operations_manager', 'flight.write'),
	('operations_manager', 'assignment.write'),
	('operations_manager', 'attendance.record'),
	('operations_manager', 'staff.write'),
	('operations_manager', 'import.run'),
	('operations_manager', 'report.read'),
	('operations_manager', 'user.manage_operational'),
	('operations_manager', 'audit.read'),
	-- supervisor
	('supervisor', 'flight.read'),
	('supervisor', 'attendance.record'),
	('supervisor', 'report.read'),
	-- dispatcher
	('dispatcher', 'flight.read'),
	('dispatcher', 'flight.write'),
	('dispatcher', 'assignment.write'),
	('dispatcher', 'report.read'),
	-- viewer
	('viewer', 'flight.read'),
	('viewer', 'report.read')
) AS m("role_key", "permission_key")
JOIN "role" r ON r."key" = m."role_key"
JOIN "permission" p ON p."key" = m."permission_key"
ON CONFLICT DO NOTHING;
