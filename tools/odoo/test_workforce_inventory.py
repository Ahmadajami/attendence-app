"""Synthetic checks for inventory identity matching and private export safety."""

import csv
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import workforce_inventory as inventory


class InventoryTests(unittest.TestCase):
    def test_legacy_badge_takes_precedence(self):
        rows = inventory.match_staff(
            [{"legacy_badge_no": "20", "employee_no": "10"}],
            [{"id": 1, "barcode": "10"}, {"id": 2, "barcode": "20"}],
        )
        self.assertEqual(rows[0]["odoo"]["id"], 2)

    def test_fallback_only_without_legacy_badge(self):
        rows = inventory.match_staff(
            [{"employee_no": "10"}, {"employee_no": "10", "legacy_badge_no": "99"}],
            [{"id": 1, "barcode": "10"}],
        )
        self.assertEqual([r["status"] for r in rows], ["matched", "unmatched"])

    def test_duplicate_badges_are_not_matched(self):
        rows = inventory.match_staff(
            [{"employee_no": "10"}],
            [{"id": 1, "barcode": "10"}, {"id": 2, "barcode": "10"}],
        )
        self.assertEqual(rows[0]["status"], "ambiguous_badge")

    def test_shared_claim_and_external_id_conflict(self):
        rows = inventory.match_staff(
            [{"employee_no": "10"}, {"employee_no": "11", "legacy_badge_no": "10"}],
            [{"id": 1, "barcode": "10"}],
        )
        self.assertTrue(all(r["status"] == "shared_odoo_claim" for r in rows))
        rows = inventory.match_staff(
            [{"employee_no": "10", "odoo_id": "2"}], [{"id": 1, "barcode": "10"}],
        )
        self.assertEqual(rows[0]["status"], "odoo_id_conflict")

    def test_names_never_match_and_missing_keys_stay_unresolved(self):
        rows = inventory.match_staff(
            [{"full_name": "Synthetic Person"}], [{"id": 1, "name": "Synthetic Person"}],
        )
        self.assertEqual(rows[0]["status"], "missing_key")

    def test_csv_formula_and_quoted_multiline_label(self):
        text = inventory.csv_text([{"name": '=1+1'}, {"name": 'Example,"label"\nnext'}], ["name"])
        rows = list(csv.DictReader(io.StringIO(text.lstrip("\ufeff"))))
        self.assertEqual(rows[0]["name"], "'=1+1")
        self.assertEqual(rows[1]["name"], 'Example,"label"\nnext')

    def test_refuse_output_outside_secure_folder(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(ValueError):
                inventory.private_directory(Path(root))

    def test_snapshot_read_only_and_multiline_json(self):
        response = type("Response", (), {"returncode": 0, "stdout": '"{""section"":""example"",""rows"":[\n{""name"":""label""}]}"\n'})()
        with patch.object(inventory.subprocess, "run", return_value=response) as run:
            result = inventory.snapshot("container", "user", "database", {"example": "SELECT 1"})
        self.assertEqual(result["example"], [{"name": "label"}])
        sql = run.call_args.kwargs["input"]
        self.assertIn("REPEATABLE READ READ ONLY", sql)
        self.assertTrue(sql.endswith("ROLLBACK;"))


if __name__ == "__main__":
    unittest.main()
