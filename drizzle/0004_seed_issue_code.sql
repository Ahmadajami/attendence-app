-- Permission to issue 6-digit sign-in codes for supervisor / dispatcher / viewer accounts.
-- Keep in sync with src/lib/server/rbac/permissions.ts (PERMISSIONS, MANAGEABLE_ROLES).

INSERT INTO "permission" ("key") VALUES ('user.issue_code')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (VALUES
	('admin', 'user.issue_code'),
	('operations_manager', 'user.issue_code'),
	('supervisor', 'user.issue_code')
) AS m("role_key", "permission_key")
JOIN "role" r ON r."key" = m."role_key"
JOIN "permission" p ON p."key" = m."permission_key"
ON CONFLICT DO NOTHING;
