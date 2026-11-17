"""Synthetic clock, badge and evidence checks; no employee data."""

import datetime as dt
import unittest

import infer_airport_hours as inference


class AirportHoursTests(unittest.TestCase):
    def row(self, first_in, first_out, second_in=None, second_out=None):
        return [None] * 4 + [first_in, first_out, second_in, second_out]

    def test_formatted_badge_preserves_digits(self):
        self.assertEqual(inference.badge_key("0123-456"), "0123456")
        self.assertEqual(inference.badge_key("123-456"), "123-456")
        self.assertEqual(inference.badge_key(1234.0), "1234")

    def test_normal_day(self):
        _, minutes, incomplete, overlap = inference.segments(self.row(dt.time(8), dt.time(17)))
        self.assertEqual(minutes, 540)
        self.assertFalse(incomplete or overlap)

    def test_overnight(self):
        _, minutes, _, _ = inference.segments(self.row(dt.time(20), dt.time(8)))
        self.assertEqual(minutes, 720)

    def test_split_overnight_excludes_break(self):
        _, minutes, _, overlap = inference.segments(self.row(dt.time(20), dt.time(1), dt.time(2), dt.time(8)))
        self.assertEqual(minutes, 660)
        self.assertFalse(overlap)

    def test_incomplete_day_has_no_inferred_duration(self):
        _, minutes, incomplete, _ = inference.segments(self.row(dt.time(8), None))
        self.assertIsNone(minutes)
        self.assertTrue(incomplete)

    def test_overlapping_segments_have_no_inferred_duration(self):
        _, minutes, _, overlap = inference.segments(self.row(dt.time(8), dt.time(14), dt.time(13), dt.time(17)))
        self.assertIsNone(minutes)
        self.assertTrue(overlap)

    def test_no_punch_does_not_become_zero_work(self):
        self.assertIsNone(inference.segments(self.row(None, None))[1])

    def test_invalid_clock_and_role_are_not_guessed(self):
        self.assertIsNone(inference.clock_minutes("25:00"))
        self.assertIsNone(inference.role(157, 604))

    def test_anonymous_rows_are_not_counted_as_identified_people(self):
        rows = [{"odoo_id": None, "worked_minutes": 540, "parts": [(480, 1020)], "incomplete": False, "overlap": False}]
        stats = inference.stats(rows)
        self.assertEqual(stats["people"], 0)
        self.assertEqual(stats["unidentified_rows"], 1)


if __name__ == "__main__":
    unittest.main()
