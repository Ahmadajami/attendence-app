"""Pure tests for engine.schedule.

The cases live in a mixin so the same methods run twice:
  * outside Odoo:  python3 -m unittest discover -s engine/tests -t .
                   (from custom_addons/hr_attendance_builder)
  * inside Odoo:   tests/test_engine_schedule.py mixes them into a BaseCase,
                   because Odoo's runner skips plain unittest.TestCase.
"""
import unittest
from datetime import date, timedelta

try:
    from odoo.addons.hr_attendance_builder.engine import schedule
except ImportError:  # running outside Odoo
    from engine import schedule

# A Sunday, so weekly slot 0 is easy to read.
SUNDAY = date(2026, 1, 4)


class ScheduleCases:
    """Test methods only; mixed into a concrete TestCase class."""

    def test_overnight_span_16_to_4(self):
        self.assertTrue(schedule.crosses_midnight(16, 4))
        self.assertEqual(schedule.span_minutes(16, 4), 720)

    def test_midnight_start_does_not_cross(self):
        self.assertFalse(schedule.crosses_midnight(0, 8))
        self.assertEqual(schedule.span_minutes(0, 8), 480)

    def test_end_equal_start_is_a_full_day(self):
        self.assertTrue(schedule.crosses_midnight(8, 8))
        self.assertEqual(schedule.span_minutes(8, 8), 1440)

    def test_fractional_hours(self):
        self.assertEqual(schedule.span_minutes(7.5, 19.25), 705)
        self.assertEqual(schedule.span_minutes(19.0, 7.0), 720)

    def test_required_is_span_minus_break(self):
        self.assertEqual(schedule.required_minutes(720, 0), 720)
        self.assertEqual(schedule.required_minutes(720, 60), 660)
        self.assertEqual(schedule.required_minutes(30, 60), 0)

    def test_night_overlap(self):
        self.assertEqual(schedule.overlap_minutes(16, 4, 22, 6), 360)
        self.assertEqual(schedule.overlap_minutes(0, 8, 22, 6), 360)
        self.assertEqual(schedule.overlap_minutes(8, 17, 22, 6), 0)
        self.assertEqual(schedule.overlap_minutes(20, 23, 22, 6), 60)

    def test_is_night(self):
        self.assertTrue(schedule.is_night(16, 4, 22, 6))   # crosses midnight
        self.assertTrue(schedule.is_night(0, 8, 22, 6))    # 360 of 480 at night
        self.assertFalse(schedule.is_night(8, 17, 22, 6))
        self.assertFalse(schedule.is_night(14, 22, 22, 6))

    def test_weekly_slot_is_the_weekday(self):
        for offset in range(14):
            day = SUNDAY + timedelta(days=offset)
            self.assertEqual(
                schedule.slot_index(schedule.WEEKLY, 7, day), offset % 7, day)

    def test_cycle_slot_after_anchor(self):
        anchor = SUNDAY
        for offset, expected in [(0, 0), (1, 1), (7, 7), (8, 0), (17, 1)]:
            self.assertEqual(
                schedule.slot_index(schedule.CYCLE, 8,
                                    anchor + timedelta(days=offset), anchor),
                expected, offset)

    def test_cycle_slot_before_anchor(self):
        # Same expectations as the old rotation_math tests: floor modulo.
        anchor = SUNDAY
        for offset, expected in [(-1, 7), (-8, 0), (-9, 7), (-3, 5)]:
            self.assertEqual(
                schedule.slot_index(schedule.CYCLE, 8,
                                    anchor + timedelta(days=offset), anchor),
                expected, offset)

    def test_cycle_needs_an_anchor(self):
        with self.assertRaises(ValueError):
            schedule.slot_index(schedule.CYCLE, 4, SUNDAY)


class TestSchedule(ScheduleCases, unittest.TestCase):
    pass


if __name__ == '__main__':
    unittest.main()
