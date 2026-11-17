"""Compare October punch evidence with Odoo requirements; never infer approved policy.

python3 -P tools/odoo/infer_airport_hours.py
Requires the existing user-installed openpyxl. No employee data is printed.
"""

import collections
import datetime as dt
import json
from pathlib import Path
import re
import runpy

import openpyxl


def badge_key(value):
    if value is None:
        return ""
    if isinstance(value, (int, float)) and float(value).is_integer():
        return str(int(value))
    text = str(value).strip()
    # These workbooks format seven-digit badges as four digits, hyphen, three digits.
    # Preserve all digits (including leading zeros); reject collisions downstream.
    return text.replace("-", "") if re.fullmatch(r"\d{4}-\d{3}", text) else text


def clock_minutes(value):
    if isinstance(value, dt.datetime):
        value = value.time()
    if isinstance(value, dt.time):
        return value.hour * 60 + value.minute + value.second / 60
    if isinstance(value, str):
        match = re.fullmatch(r"\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*", value)
        if match:
            hour, minute, second = (int(part or 0) for part in match.groups())
            if hour < 24 and minute < 60 and second < 60:
                return hour * 60 + minute + second / 60
    return None


def segments(row):
    intervals = []
    incomplete = False
    for start, end in [(4, 5), (6, 7)]:
        left, right = clock_minutes(row[start]), clock_minutes(row[end])
        if left is None and right is None:
            continue
        if left is None or right is None:
            incomplete = True
            continue
        if right < left:
            right += 1440
        if intervals:
            while left < intervals[0][0]:
                left += 1440
                right += 1440
        intervals.append((left, right))
    # Overlapping parts cannot provide reliable total worked time.
    ordered = sorted(intervals)
    overlap = any(b[0] < a[1] for a, b in zip(ordered, ordered[1:]))
    total = None if incomplete or overlap or not intervals else round(sum(b - a for a, b in intervals))
    return intervals, total, incomplete, overlap


def role(job, department):
    if department != 224:
        return None
    return {157: "damascus_porters", 195: "cabin_cleaners", 159: "other_airport_cleaners"}.get(job)


def stats(rows):
    worked = [r for r in rows if r["worked_minutes"] is not None]
    duration = collections.Counter(round(r["worked_minutes"] / 30) * 30 for r in worked)
    windows = collections.Counter(
        (round(r["parts"][0][0] / 30) * 30 % 1440,
         round(r["parts"][-1][1] / 30) * 30 % 1440)
        for r in worked
    )
    return {
        "rows": len(rows), "people": len({r["odoo_id"] for r in rows if r["odoo_id"] is not None}),
        "unidentified_rows": sum(r["odoo_id"] is None for r in rows),
        "complete_punched_rows": len(worked),
        "duration_half_hour_buckets": sorted(duration.items()),
        "common_half_hour_windows": [(list(window), count) for window, count in windows.most_common(6)],
        "incomplete_rows": sum(r["incomplete"] for r in rows),
        "overlapping_rows": sum(r["overlap"] for r in rows),
    }


def main():
    helpers = runpy.run_path(str(Path(__file__).with_name("workforce_inventory.py")))
    data = helpers["snapshot"]("odoo-db", "odoo", "syravia_dev", {
        "people": """SELECT e.id,e.barcode,e.active,e.fixed_required_minutes,e.weekly_hours,
            v.department_id,v.job_id,v.work_location_id FROM hr_employee e
            LEFT JOIN hr_version v ON v.id=e.current_version_id ORDER BY e.id""",
        "days": """SELECT l.employee_id,l.date,l.required_minutes,l.is_weekly_off,
            l.actual_minutes,l.check_in,l.check_out,l.planned_start_hour,l.planned_end_hour,
            l.break_minutes,l.suppress_ot,l.topup_minutes,l.manual_state
            FROM roster_line l WHERE l.date >= '2026-10-01' AND l.date < '2026-11-01'
            AND l.employee_id IN (SELECT e.id FROM hr_employee e JOIN hr_version v
                ON v.id=e.current_version_id WHERE v.department_id=224 AND v.job_id IN (157,195,159))
            ORDER BY l.date,l.employee_id,l.id""",
        "roster_members": """SELECT el.employee_id,el.required_minutes,el.pattern_id,
            el.pattern_start_hour,el.pattern_end_hour,el.day_off_1,el.day_off_2,
            r.date_from,r.date_to FROM roster_employee_line el JOIN roster_shift r ON r.id=el.roster_id
            WHERE r.date_from < '2026-11-01' AND r.date_to >= '2026-10-01' ORDER BY el.employee_id,el.id""",
    })
    people = {p["id"]: p for p in data["people"] if role(p["job_id"], p["department_id"])}
    badges = collections.defaultdict(list)
    for person in data["people"]:
        if person["barcode"]:
            badges[badge_key(person["barcode"])].append(person)
    rows, files, rejected, attendance_rows = [], [], collections.Counter(), []
    root = Path.home() / "secure/syravia/imports/october-2026"
    for file in sorted(root.glob("*.xlsx")):
        if file.name.startswith(".~lock"):
            continue
        kind = "range" if "_to_" in file.name else "correction" if file.name.lower().startswith("correction") else "daily"
        book = openpyxl.load_workbook(file, read_only=True, data_only=True)
        sheet = book.worksheets[0]
        headers = list(next(sheet.iter_rows(min_row=4, max_row=4, values_only=True)))
        expected = {0: "ID", 3: "Date", 4: "in_1", 5: "out_1", 6: "in_2", 7: "out_2", 10: "Department"}
        if any(len(headers) <= i or headers[i] != label for i, label in expected.items()):
            book.close()
            raise ValueError("Unexpected workbook headers; analysis stopped.")
        selected = 0
        for source_row, row in enumerate(sheet.iter_rows(min_row=5, values_only=True), 5):
            date = row[3]
            if not isinstance(date, (dt.datetime, dt.date)):
                continue
            if isinstance(date, dt.datetime):
                date = date.date()
            if not dt.date(2026, 10, 1) <= date < dt.date(2026, 11, 1):
                continue
            key = badge_key(row[0])
            candidates = badges.get(key, [])
            label = str(row[10] or "").strip()
            attendance_group = None
            if label == "DAM Porters && Drivers":
                attendance_group = "porters_and_drivers_attendance"
            elif label == "تنظيف طائرات":
                attendance_group = "aircraft_cleaning_attendance"
            if attendance_group:
                parts, worked, incomplete, overlap = segments(row)
                attendance_rows.append({"group": attendance_group,
                    "odoo_id": candidates[0]["id"] if len(candidates) == 1 else None,
                    "date": date.isoformat(), "source_kind": kind,
                    "source_row": source_row, "source_file": file.name,
                    "parts": parts, "worked_minutes": worked,
                    "incomplete": incomplete, "overlap": overlap})
            if len(candidates) != 1:
                rejected["unmatched" if not candidates else "ambiguous"] += 1
                continue
            person = candidates[0]
            group = role(person["job_id"], person["department_id"])
            if group is None:
                continue
            parts, worked, incomplete, overlap = segments(row)
            # File labels retained privately to help check current-role cohort assumptions.
            rows.append({"group": group, "odoo_id": person["id"], "date": date.isoformat(),
                         "source_kind": kind, "source_row": source_row,
                         "source_file": file.name, "excel_department": row[10],
                         "parts": parts, "worked_minutes": worked,
                         "incomplete": incomplete, "overlap": overlap})
            selected += 1
        files.append({"kind": kind, "selected_rows": selected})
        book.close()
    summary = {"source_database": "syravia_dev", "files": files,
               "all_october_rows_unmatched_or_ambiguous": dict(rejected), "groups": {}}
    summary["excel_attendance_groups"] = {}
    for group in sorted({r["group"] for r in attendance_rows}):
        selected = [r for r in attendance_rows if r["group"] == group]
        summary["excel_attendance_groups"][group] = [
            {"date": date, "kind": kind, **stats([r for r in selected if r["date"] == date and r["source_kind"] == kind])}
            for date, kind in sorted({(r["date"], r["source_kind"]) for r in selected})
        ]
    for group in ("damascus_porters", "cabin_cleaners", "other_airport_cleaners"):
        members = {pid for pid, person in people.items() if role(person["job_id"], person["department_id"]) == group}
        evidence = [r for r in rows if r["group"] == group]
        days = [r for r in data["days"] if r["employee_id"] in members]
        per_date = []
        for date in sorted({r["date"] for r in evidence}):
            day = [r for r in evidence if r["date"] == date]
            for kind in sorted({r["source_kind"] for r in day}):
                per_date.append({"date": date, "kind": kind, **stats([r for r in day if r["source_kind"] == kind])})
        daily_requirements = []
        for date in sorted({r["date"] for r in days}):
            day = [r for r in days if r["date"] == date]
            daily_requirements.append({"date": date, "people": len({r["employee_id"] for r in day}),
                "required_minutes_counts": sorted(collections.Counter(r["required_minutes"] for r in day if not r["is_weekly_off"]).items()),
                "off_days": sum(bool(r["is_weekly_off"]) for r in day)})
        summary["groups"][group] = {"current_role_people": len(members), "excel_by_date": per_date,
            "odoo_by_date": daily_requirements,
            "odoo_non_off_required_minutes": sorted(collections.Counter(r["required_minutes"] for r in days if not r["is_weekly_off"]).items()),
            "configured_fixed_minutes": sorted(collections.Counter(people[pid]["fixed_required_minutes"] for pid in members).items(), key=lambda pair: str(pair[0]))}
    summary["limitations"] = [
        "Cohorts use current Odoo department 224 and jobs 157/195/159, not confirmed historical attendance groups.",
        "Punch duration is observed attendance, not required hours or paid time. No overtime/leave policy is inferred.",
        "Clock buckets use nearest half hour for descriptive counts only; no payroll rounding was applied.",
        "Daily/correction/range sources remain separate. Repeated person-dates are not silently merged.",
        "Workbook four-digit/hyphen/three-digit badge formatting is normalized without dropping digits; ambiguous matches are refused.",
    ]
    target = helpers["private_directory"](Path.home() / "secure/syravia/reports/airport-hours")
    helpers["write_private"](target / "summary.json", json.dumps(summary, ensure_ascii=False, indent=2))
    helpers["write_private"](target / "evidence.json", json.dumps({"excel": rows, "attendance_rows": attendance_rows, "odoo": data}, ensure_ascii=False, default=str, indent=2))
    print(json.dumps({"groups": {key: {"people": value["current_role_people"],
        "odoo_non_off_required_minutes": value["odoo_non_off_required_minutes"]}
        for key, value in summary["groups"].items()},
        "excel_attendance_groups": summary["excel_attendance_groups"]}, ensure_ascii=False))
    print("Private evidence directory:", target)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Workbook/driver exceptions can include private filenames or cell contents.
        raise SystemExit("Evidence analysis failed; review the source schema and workbook layout locally. No database writes were performed.") from None
