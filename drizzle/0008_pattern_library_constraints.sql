-- Pattern library DDL Drizzle can't express, and the move of every `shift_pattern` row into
-- `pattern` + `pattern_assignment` (builder plan B1, task 1.2). `shift_pattern` itself is dropped by
-- the next migration. Schema and converted rows only: never put people or other real data here.

-- Pattern slots are shift ids (NULL = off). Postgres has no FK on array elements, so check them here
-- (moved from `shift_pattern`, migration 0005).
CREATE FUNCTION "pattern_slots_exist"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM unnest(NEW."slots") AS s("id")
		WHERE s."id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "shift" WHERE "shift"."id" = s."id")
	) THEN
		RAISE EXCEPTION 'pattern % has a slot that is not a shift', NEW."id"
			USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'pattern_slots_fk';
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "pattern_slots_fk"
	AFTER INSERT OR UPDATE OF "slots" ON "pattern"
	FOR EACH ROW EXECUTE FUNCTION "pattern_slots_exist"();
--> statement-breakpoint

-- A shift a pattern slot points at can't be deleted (shifts are deactivated anyway, plan P2). Same
-- function as in 0005, now reading `pattern`; `default_work_shift_id` is a plain FK.
CREATE OR REPLACE FUNCTION "shift_not_in_pattern"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF EXISTS (SELECT 1 FROM "pattern" WHERE OLD."id" = ANY("slots")) THEN
		RAISE EXCEPTION 'shift % is used by a pattern', OLD."id"
			USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'pattern_slots_fk';
	END IF;
	RETURN OLD;
END;
$$;
--> statement-breakpoint

-- An assignment has an anchor date iff its pattern is a cycle (B4). The type lives on `pattern`,
-- so a CHECK can't see it: check the assignment on write, and the pattern when its type changes.
CREATE FUNCTION "pattern_assignment_anchor_matches"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "pattern" p
		WHERE p."id" = NEW."pattern_id" AND (p."type" = 'cycle') <> (NEW."anchor_date" IS NOT NULL)
	) THEN
		RAISE EXCEPTION 'pattern_assignment % needs an anchor date iff its pattern is a cycle', NEW."id"
			USING ERRCODE = 'check_violation', CONSTRAINT = 'pattern_assignment_anchor';
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "pattern_assignment_anchor"
	AFTER INSERT OR UPDATE OF "pattern_id", "anchor_date" ON "pattern_assignment"
	FOR EACH ROW EXECUTE FUNCTION "pattern_assignment_anchor_matches"();
--> statement-breakpoint
CREATE FUNCTION "pattern_type_matches_assignments"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "pattern_assignment" a
		WHERE a."pattern_id" = NEW."id" AND (NEW."type" = 'cycle') <> (a."anchor_date" IS NOT NULL)
	) THEN
		RAISE EXCEPTION 'pattern % is assigned: its type no longer matches the anchor dates', NEW."id"
			USING ERRCODE = 'check_violation', CONSTRAINT = 'pattern_assignment_anchor';
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "pattern_type_anchor"
	AFTER UPDATE OF "type" ON "pattern"
	FOR EACH ROW EXECUTE FUNCTION "pattern_type_matches_assignments"();
--> statement-breakpoint

-- The assignments of one target never overlap; an open one (effective_to NULL) runs forever
-- (moved from `shift_pattern`, migrations 0001 and 0005).
ALTER TABLE "pattern_assignment" ADD CONSTRAINT "pattern_assignment_staff_no_overlap"
	EXCLUDE USING gist (
		"staff_id" WITH =,
		daterange("effective_from", "effective_to", '[)') WITH &&
	)
	WHERE ("staff_id" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "pattern_assignment" ADD CONSTRAINT "pattern_assignment_team_no_overlap"
	EXCLUDE USING gist (
		"team_id" WITH =,
		daterange("effective_from", "effective_to", '[)') WITH &&
	)
	WHERE ("team_id" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "pattern_assignment" ADD CONSTRAINT "pattern_assignment_department_no_overlap"
	EXCLUDE USING gist (
		"department_id" WITH =,
		daterange("effective_from", "effective_to", '[)') WITH &&
	)
	WHERE ("department_id" IS NOT NULL);
--> statement-breakpoint

-- The same for one person's own schedule rules.
ALTER TABLE "staff_schedule" ADD CONSTRAINT "staff_schedule_no_overlap"
	EXCLUDE USING gist (
		"staff_id" WITH =,
		daterange("effective_from", "effective_to", '[)') WITH &&
	);
--> statement-breakpoint

-- Data: each `shift_pattern` row becomes one library pattern (same id; named from that id, never
-- from a person or team, HR renames it later) and one assignment with the same target, dates,
-- anchor and reason. The triggers above check the converted rows.
INSERT INTO "pattern" ("id", "name_en", "name_ar", "type", "slots", "created_by", "created_at", "updated_at")
SELECT "id", 'Pattern ' || left("id"::text, 8), 'نمط ' || left("id"::text, 8), "type", "slots",
	"created_by", "created_at", "updated_at"
FROM "shift_pattern";
--> statement-breakpoint
INSERT INTO "pattern_assignment" (
	"pattern_id", "staff_id", "team_id", "department_id", "anchor_date", "effective_from",
	"effective_to", "reason", "created_by", "created_at", "updated_at"
)
SELECT "id", "staff_id", "team_id", "department_id", "anchor_date", "effective_from",
	"effective_to", "reason", "created_by", "created_at", "updated_at"
FROM "shift_pattern";
--> statement-breakpoint

-- Refuse to go on unless every old row arrived once.
DO $$
DECLARE
	old_rows bigint := (SELECT count(*) FROM "shift_pattern");
	patterns bigint := (SELECT count(*) FROM "pattern" WHERE "id" IN (SELECT "id" FROM "shift_pattern"));
	assignments bigint := (SELECT count(*) FROM "pattern_assignment" WHERE "pattern_id" IN (SELECT "id" FROM "shift_pattern"));
BEGIN
	IF patterns <> old_rows OR assignments <> old_rows THEN
		RAISE EXCEPTION 'shift_pattern conversion: % rows, % patterns, % assignments', old_rows, patterns, assignments;
	END IF;
END;
$$;
--> statement-breakpoint

-- `shift_pattern` is read-only from here and dropped next; its slot trigger goes with it.
DROP TRIGGER "shift_pattern_slots_fk" ON "shift_pattern";
--> statement-breakpoint
DROP FUNCTION "shift_pattern_slots_exist"();
