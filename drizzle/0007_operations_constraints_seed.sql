-- DDL Drizzle can't express (CLAUDE.md §7): team overlap guard + staff-function seed.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- A team may work many flights a day, but never two overlapping handling windows.
ALTER TABLE "team_flight_assignment" ADD CONSTRAINT "team_flight_assignment_no_overlap"
	EXCLUDE USING gist (
		"team_id" WITH =,
		tstzrange("starts_at", "ends_at", '[)') WITH &&
	)
	WHERE ("status" <> 'cancelled');
--> statement-breakpoint

-- Default handling functions (EN / AR names match the staff page labels).
INSERT INTO "staff_function" ("key", "name_en", "name_ar")
VALUES
	('ramp', 'Ramp', 'ساحة الطائرات'),
	('baggage', 'Baggage', 'الأمتعة'),
	('check_in', 'Check-in', 'تسجيل الوصول'),
	('gate', 'Gate', 'البوابة')
ON CONFLICT ("key") DO NOTHING;
