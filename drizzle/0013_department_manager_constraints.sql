-- Department manager history (management plan M3, task 1.2): the EXCLUDE Drizzle can't express,
-- and the move of every `department.manager_staff_id` into an open `department_manager` row. The
-- column itself is dropped by the next migration. Schema and converted rows only: never put people
-- or other real data here.

-- One manager per department on any day (M2); an open row (valid_to NULL) runs forever.
-- btree_gist is installed by 0001.
ALTER TABLE "department_manager" ADD CONSTRAINT "department_manager_no_overlap"
	EXCLUDE USING gist (
		"department_id" WITH =,
		daterange("valid_from", "valid_to", '[)') WITH &&
	);
--> statement-breakpoint

-- Data: today's manager of each department becomes an open row from the department's creation
-- day (Damascus), as the plan says (§2). Nothing older is known: the audit log has the rest.
INSERT INTO "department_manager" ("department_id", "staff_id", "valid_from", "valid_to", "reason")
SELECT "id", "manager_staff_id", ("created_at" AT TIME ZONE 'Asia/Damascus')::date, NULL,
	'Converted from department.manager_staff_id (migration 0013)'
FROM "department"
WHERE "manager_staff_id" IS NOT NULL;
--> statement-breakpoint

-- Refuse to go on unless every department with a manager has exactly one matching open row.
DO $$
DECLARE
	old_rows bigint := (SELECT count(*) FROM "department" WHERE "manager_staff_id" IS NOT NULL);
	new_rows bigint := (SELECT count(*) FROM "department_manager");
	matching bigint := (
		SELECT count(*) FROM "department" d
		JOIN "department_manager" dm
			ON dm."department_id" = d."id" AND dm."staff_id" = d."manager_staff_id" AND dm."valid_to" IS NULL
	);
BEGIN
	IF new_rows <> old_rows OR matching <> old_rows THEN
		RAISE EXCEPTION 'department manager conversion: % departments with a manager, % rows, % matching',
			old_rows, new_rows, matching;
	END IF;
END;
$$;
