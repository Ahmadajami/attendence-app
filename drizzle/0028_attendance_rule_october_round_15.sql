-- SP11: the user chose to keep 15-minute overtime rounding from 1 October 2026, a chosen
-- difference from Odoo (which does not round), so the October rule version is updated.
UPDATE "attendance_rule"
SET "overtime_step" = 15,
    "overtime_mode" = 'nearest',
    "reason" = 'User choice (SP11): overtime stays rounded to the nearest 15 minutes from 1 October 2026, a chosen difference from Odoo.'
WHERE "effective_from" = '2026-10-01';
