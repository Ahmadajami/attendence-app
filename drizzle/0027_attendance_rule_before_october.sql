-- The rules before October 2026 are the app's former ones (overtime to the nearest 15 minutes, no
-- Friday Prayer credit), so the 9 270 stored days before 1 October keep their figures after the
-- engine change (OC7). Odoo's values start on 1 October (0026).
INSERT INTO "attendance_rule" ("overtime_step", "overtime_mode", "friday_prayer_on", "friday_prayer_minutes", "friday_prayer_segments", "effective_from", "effective_to", "reason")
VALUES (15, 'nearest', false, 60, 2, '2026-01-01', '2026-10-01', 'The app''s rules before October 2026 (OC7): overtime to the nearest 15 minutes, no Friday Prayer credit, so earlier months keep their figures.');
