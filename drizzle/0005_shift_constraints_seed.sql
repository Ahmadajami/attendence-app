-- Shift DDL Drizzle can't express, and the two default shifts (plan P3, P4).
-- Schema and seeds only: never put people or other real data in a migration.

-- Pattern slots are shift ids (NULL = off). Postgres has no FK on array elements, so check them here.
CREATE FUNCTION "shift_pattern_slots_exist"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM unnest(NEW."slots") AS s("id")
		WHERE s."id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "shift" WHERE "shift"."id" = s."id")
	) THEN
		RAISE EXCEPTION 'shift_pattern % has a slot that is not a shift', NEW."id"
			USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'shift_pattern_slots_fk';
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "shift_pattern_slots_fk"
	AFTER INSERT OR UPDATE OF "slots" ON "shift_pattern"
	FOR EACH ROW EXECUTE FUNCTION "shift_pattern_slots_exist"();
--> statement-breakpoint

-- The other side of that check: a shift a pattern slot points at can't be deleted (shifts are
-- deactivated anyway, plan P2).
CREATE FUNCTION "shift_not_in_pattern"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF EXISTS (SELECT 1 FROM "shift_pattern" WHERE OLD."id" = ANY("slots")) THEN
		RAISE EXCEPTION 'shift % is used by a pattern', OLD."id"
			USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'shift_pattern_slots_fk';
	END IF;
	RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "shift_not_in_pattern"
	BEFORE DELETE ON "shift"
	FOR EACH ROW EXECUTE FUNCTION "shift_not_in_pattern"();
--> statement-breakpoint

-- Versions of one department's pattern never overlap (next to the team and staff ones in 0001).
ALTER TABLE "shift_pattern" ADD CONSTRAINT "shift_pattern_department_no_overlap"
	EXCLUDE USING gist (
		"department_id" WITH =,
		daterange("effective_from", "effective_to", '[)') WITH &&
	)
	WHERE ("department_id" IS NOT NULL);
--> statement-breakpoint

-- The two shifts the template's fixed 12 h kinds stood for. Colours are from SHIFT_COLOURS.
INSERT INTO "shift" ("code", "name_en", "name_ar", "colour", "start_time", "end_time") VALUES
	('D', 'Day', 'نهاري', '#b45309', '07:00', '19:00'),
	('N', 'Night', 'ليلي', '#4338ca', '19:00', '07:00')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint

-- Shift times now live on each shift.
DELETE FROM "app_setting" WHERE "key" = 'roster.shift_starts';
