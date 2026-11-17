"""Read-only Odoo/app evidence inventory. Standard library only; stdout contains counts only.

Run: python3 -I tools/odoo/workforce_inventory.py --month 2026-10
Outputs a new private directory under ~/secure/syravia/inventory/; never imports or recomputes.
Configured values are evidence, not confirmed policy. Current assignments are not October history.
"""

import argparse
import collections
import csv
import datetime as dt
import html
import io
import json
import os
from pathlib import Path
import subprocess


def snapshot(container, user, database, queries):
    """All queries for one source share a repeatable-read, read-only transaction."""
    csv.field_size_limit(16 * 1024 * 1024)
    statements = [
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;",
        "SET LOCAL statement_timeout = '60s';",
        "SET LOCAL TIME ZONE 'UTC';",
    ]
    for key, query in queries.items():
        statements.append(
            f"COPY (SELECT json_build_object('section', '{key}', 'rows', "
            f"coalesce(json_agg(q), '[]'::json)) FROM ({query}) q) TO STDOUT WITH (FORMAT csv);"
        )
    statements.append("ROLLBACK;")
    result = subprocess.run(
        ["docker", "exec", "-i", container, "psql", "-X", "-q", "-A", "-t",
         "-v", "ON_ERROR_STOP=1", "-U", user, "-d", database],
        input="\n".join(statements), capture_output=True, text=True, timeout=180,
        check=False,
    )
    if result.returncode:
        # PostgreSQL errors can contain data; do not echo them into provider context.
        raise RuntimeError(f"Read-only snapshot failed for {database}; no report created.")
    sections = {}
    for row in csv.reader(io.StringIO(result.stdout)):
        item = json.loads(row[0])
        sections[item["section"]] = item["rows"]
    if sections.keys() != queries.keys():
        raise RuntimeError("Incomplete snapshot; no report created.")
    return sections


def match_staff(app_staff, odoo_staff):
    """Exact legacy badge match; employee number fallback only when legacy badge is empty.

    Names are never match keys. Duplicates, cross-source ID conflicts and shared claims
    remain unresolved instead of choosing an employee arbitrarily.
    """
    by_badge = collections.defaultdict(list)
    for employee in odoo_staff:
        if employee.get("barcode"):
            by_badge[str(employee["barcode"])].append(employee)
    rows = []
    for staff in app_staff:
        badge = staff.get("legacy_badge_no") or staff.get("employee_no")
        candidates = by_badge.get(str(badge), []) if badge else []
        status = "missing_key" if not badge else "unmatched"
        employee = candidates[0] if len(candidates) == 1 else None
        if len(candidates) > 1:
            status = "ambiguous_badge"
        elif employee:
            status = "matched"
            if staff.get("odoo_id") and str(staff["odoo_id"]) != str(employee["id"]):
                status = "odoo_id_conflict"
        rows.append({"staff": staff, "odoo": employee, "status": status,
                     "method": "legacy_badge" if staff.get("legacy_badge_no") else "employee_no_fallback"})
    claims = collections.Counter(str(r["odoo"]["id"]) for r in rows if r["odoo"])
    for row in rows:
        if row["status"] == "matched" and claims[str(row["odoo"]["id"])] > 1:
            row["status"] = "shared_odoo_claim"
    return rows


def private_directory(root):
    root = root.expanduser().resolve()
    secure = (Path.home() / "secure/syravia").resolve()
    if not root.is_relative_to(secure):
        raise ValueError("Output must be under ~/secure/syravia/.")
    repo = Path(__file__).resolve().parents[2]
    if root.is_relative_to(repo):
        raise ValueError("Output must stay outside the repository.")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(root, 0o700)
    target = root / dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    target.mkdir(mode=0o700)
    return target


def write_private(path, content):
    with path.open("x", encoding="utf-8", newline="") as file:
        os.chmod(path, 0o600)
        file.write(content)


def csv_text(rows, headers):
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=headers)
    writer.writeheader()
    for row in rows:
        # Keep spreadsheet programs from interpreting untrusted labels as formulas.
        writer.writerow({key: ("'" + value if isinstance(value, str)
                               and value.lstrip().startswith(("=", "+", "-", "@")) else value)
                         for key, value in row.items()})
    return "\ufeff" + output.getvalue()


def build_report(app, odoo, month, sources):
    departments = {str(d["id"]): d for d in app["departments"]}
    teams = {str(t["id"]): t for t in app["teams"]}
    odoo_departments = {str(d["id"]): d for d in odoo["departments"]}
    locations = {str(location["id"]): location for location in odoo["locations"]}
    matches = match_staff(app["staff"], odoo["staff"])
    review = []
    for match in matches:
        staff, employee = match["staff"], match["odoo"] or {}
        department = departments.get(str(staff["department_id"]), {})
        team = teams.get(str(staff["team_id"]), {})
        mapped_department = department.get("odoo_id")
        comparable = match["status"] == "matched" and mapped_department and employee.get("department_id")
        review.append({
            "staff_id": staff["id"], "employee_name": staff["full_name"],
            "app_active": staff["active"], "app_department": department.get("name_en", ""),
            "app_team": team.get("name_en", ""), "match_status": match["status"],
            "match_method": match["method"], "odoo_employee_id": employee.get("id", ""),
            "odoo_active": employee.get("active", ""),
            "odoo_department_id": employee.get("department_id", ""),
            "odoo_department": odoo_departments.get(str(employee.get("department_id")), {}).get("name", ""),
            "odoo_location": locations.get(str(employee.get("work_location_id")), {}).get("name", ""),
            "department_comparison": ("same" if str(mapped_department) == str(employee.get("department_id"))
                                      else "different") if comparable else "unresolved",
            "configured_weekly_hours": employee.get("weekly_hours", ""),
            "configured_fixed_minutes": employee.get("fixed_required_minutes", ""),
            "hr_group": "", "hr_required_hours": "", "hr_overtime_policy": "",
            "hr_cancellation_policy": "", "hr_leave_adjustment": "",
            "effective_date": "", "approved_by": "", "review_status": "unconfirmed",
        })
    counts = dict(collections.Counter(row["match_status"] for row in review))
    counts.update({
        "app_staff": len(app["staff"]), "app_active_staff": sum(s["active"] for s in app["staff"]),
        "odoo_staff": len(odoo["staff"]), "app_departments": len(app["departments"]),
        "app_teams": len(app["teams"]), "odoo_departments": len(odoo["departments"]),
        "app_active_without_department": sum(s["active"] and not s["department_id"] for s in app["staff"]),
        "app_active_without_team": sum(s["active"] and not s["team_id"] for s in app["staff"]),
        "different_departments": sum(r["department_comparison"] == "different" for r in review),
        "unresolved_departments": sum(r["department_comparison"] == "unresolved" for r in review),
        "app_departments_without_odoo_link": sum(not d.get("odoo_id") for d in app["departments"]),
        "matched_active_app_staff": sum(r["status"] == "matched" and r["staff"]["active"] for r in matches),
        "odoo_staff_not_uniquely_matched": len(odoo["staff"]) - sum(r["status"] == "matched" for r in matches),
    })
    summary = {"month": month, "sources": sources, "counts": counts,
               "captured_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
               "warning": "Current hierarchy is not historical membership. Configured hours are not approved policy."}
    return review, summary


def report_html(summary, app, odoo):
    def table(rows):
        if not rows:
            return "<p>No rows / لا توجد سجلات</p>"
        headers = list(rows[0])
        return '<div class="scroll"><table><thead><tr>' + ''.join(
            '<th scope="col">' + html.escape(key) + '</th>' for key in headers
        ) + '</tr></thead><tbody>' + ''.join('<tr>' + ''.join(
            '<td>' + html.escape(str(row.get(key, ""))) + '</td>' for key in headers
        ) + '</tr>' for row in rows) + '</tbody></table></div>'

    groups = []
    for team in app["teams"]:
        members = [s for s in app["staff"] if s["active"] and s["team_id"] == team["id"]]
        groups.append({"team / الفريق": team["name_en"], "id": team["id"],
                       "active_staff / الموظفون النشطون": len(members),
                       "policy / السياسة": "Needs HR review / تحتاج مراجعة الموارد البشرية"})
    return '''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Workforce inventory / حصر الهيكل والسياسات</title>
<style>body{font:17px/1.7 system-ui;margin:24px;color:#172c38;background:#f5f7f8}
main{max-width:1200px;margin:auto}section{background:white;padding:20px;margin-block:20px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #bac6ce;padding:10px;text-align:start}
.scroll{overflow:auto}h1{font-size:28px}a{color:#15576c}</style><main>
<h1>Workforce evidence inventory<br><span lang="ar" dir="rtl">حصر أدلة الهيكل والسياسات</span></h1>
<p>This report is private. Both databases were read only. Nothing was imported or recomputed.</p>
<p lang="ar" dir="rtl">هذا التقرير خاص. تمت قراءة القاعدتين فقط دون استيراد أو إعادة حساب.</p>
<p>Current assignments are not October history. Configured values require HR confirmation.
Operations shifts and roster remain the user-confirmed baseline; no Operations recalculation was verified here.</p>
<p>Missing team membership can be intentional when a department or personal pattern applies.
Department comparisons require existing external IDs; unresolved does not mean different.</p>
<p lang="ar" dir="rtl">التكليفات الحالية لا تثبت عضويات تشرين الأول. الإعدادات تحتاج تأكيد الموارد البشرية.
تبقى ورديات العمليات وجدولها الأساس الذي أكده المستخدم؛ لم يتحقق هذا التقرير من إعادة حساب العمليات.</p>
<section><h2>Sources / المصادر</h2>''' + table([summary["sources"]]) + '''</section>
<section><h2>Counts / الأعداد</h2>''' + table([{"metric": k, "count": v} for k, v in summary["counts"].items()]) + '''</section>
<section><h2>App teams / فرق التطبيق</h2>''' + table(groups) + '''</section>
<section><h2>App department hierarchy / هيكل أقسام التطبيق</h2>''' + table(app["departments"]) + '''</section>
<section><h2>Odoo department settings / إعدادات أقسام أودو</h2>''' + table(odoo["departments"]) + '''</section>
<section><h2>Odoo locations / مواقع أودو</h2>''' + table(odoo["locations"]) + '''</section>
<section><h2>October Odoo roster groups / مجموعات جدول أودو لتشرين الأول</h2>''' + table(odoo["rosters"]) + '''</section>
<section><h2>Configured weekly hours, not approved policy / ساعات أسبوعية مضبوطة وليست سياسة معتمدة</h2>''' + table(odoo["hour_groups"]) + '''</section>
<section><h2>October evidence coverage / تغطية أدلة تشرين الأول</h2>''' + table(odoo["coverage"]) + '''</section>
<section><h2>Review locally / المراجعة المحلية</h2>
<p><a href="employee-review.csv">Employee mapping worksheet / جدول مراجعة ربط الموظفين</a> ·
<a href="evidence.json">Full evidence / الأدلة الكاملة</a></p>
<p>Resolve unmatched/ambiguous records and department differences first. Then confirm each group's hours,
overtime, cancellation pay and leave adjustments with HR. A difference does not prove either system is wrong.</p>
<p lang="ar" dir="rtl">نراجع الربط غير المحسوم واختلاف الأقسام أولاً، ثم نؤكد ساعات كل مجموعة والإضافي
والدفع عند الإلغاء وتسويات الإجازة مع الموارد البشرية. وجود اختلاف لا يثبت خطأ أحد النظامين.</p>
</section></main></html>'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--month", default="2026-10")
    parser.add_argument("--odoo-db", default="syravia_dev")
    parser.add_argument("--app-db", default="attendance_app")
    parser.add_argument("--output-root", type=Path, default=Path.home() / "secure/syravia/inventory")
    args = parser.parse_args()
    first = dt.date.fromisoformat(args.month + "-01")
    month = first.strftime("%Y-%m")
    end = (first.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    os.umask(0o077)
    app_queries = {
        "departments": "SELECT id,name_en,name_ar,parent_id,active,odoo_id FROM department ORDER BY id",
        "teams": "SELECT id,name_en,name_ar,department_id,active FROM team ORDER BY id",
        "staff": "SELECT id,full_name,employee_no,legacy_badge_no,odoo_id,active,department_id,team_id FROM staff ORDER BY id",
        "memberships": "SELECT staff_id,team_id,valid_from,valid_to FROM staff_team_membership ORDER BY staff_id,valid_from",
        "patterns": "SELECT id,name_en,type,slots,default_work_shift_id,active FROM pattern ORDER BY id",
        "assignments": "SELECT pattern_id,staff_id,team_id,department_id,anchor_date,effective_from,effective_to FROM pattern_assignment ORDER BY effective_from,id",
        "schedules": "SELECT staff_id,off_weekdays,crew_start,effective_from,effective_to FROM staff_schedule ORDER BY staff_id,effective_from",
        "shifts": "SELECT id,code,start_time,end_time,required_minutes,break_minutes,grace_minutes,active FROM shift ORDER BY id",
        "pay_rules": "SELECT pattern_id,ot_enabled,work_day_rate,off_day_rate,holiday_rate,effective_from,effective_to FROM pattern_pay_rule ORDER BY effective_from,id",
        "attendance_rules": "SELECT overtime_step,overtime_mode,friday_prayer_on,friday_prayer_minutes,friday_prayer_segments,effective_from,effective_to FROM attendance_rule ORDER BY effective_from",
    }
    odoo_queries = {
        "departments": "SELECT id,name,parent_id,manager_id,active,late_grace_minutes,biotime_commute_credit FROM hr_department ORDER BY id",
        "locations": "SELECT id,name,active FROM hr_work_location ORDER BY id",
        "staff": """SELECT e.id,e.barcode,e.active,e.parent_id manager_employee_id,
            e.weekly_hours,e.fixed_required_minutes,e.use_fixed_schedule,e.shift_pattern,
            e.attendance_mode,e.subtract_neg_balance_from_ot,e.late_grace_minutes,
            v.department_id,v.work_location_id,v.resource_calendar_id
            FROM hr_employee e LEFT JOIN hr_version v ON v.id=e.current_version_id ORDER BY e.id""",
        "calendars": "SELECT id,name,tz,hours_per_day,hours_per_week,full_time_required_hours,late_grace_minutes,active FROM resource_calendar ORDER BY id",
        "patterns": "SELECT id,name,code,required_minutes,grace_minutes,start_hour,end_hour,use_cycle,cycle_work_days,cycle_off_days,active FROM roster_shift_pattern ORDER BY id",
        "rosters": f"SELECT id,department_id,manager_id,date_from,date_to,state,default_pattern_id FROM roster_shift WHERE date_from < '{end}' AND date_to >= '{first}' ORDER BY id",
        "roster_members": f"""SELECT l.id,l.roster_id,l.employee_id,l.department_id,l.pattern_id,
            l.required_minutes,l.grace_minutes,l.day_off_1,l.day_off_2,l.cycle_anchor_date,
            l.pattern_start_hour,l.pattern_end_hour FROM roster_employee_line l
            JOIN roster_shift r ON r.id=l.roster_id WHERE r.date_from < '{end}' AND r.date_to >= '{first}' ORDER BY l.id""",
        "hour_groups": """SELECT v.department_id,v.work_location_id,e.weekly_hours,
            e.fixed_required_minutes,e.use_fixed_schedule,count(*) staff_count
            FROM hr_employee e LEFT JOIN hr_version v ON v.id=e.current_version_id
            WHERE e.active GROUP BY 1,2,3,4,5 ORDER BY 1,2,3,4,5""",
        "coverage": f"""SELECT department_id,min(date) first_day,max(date) last_day,
            count(*) day_rows,count(DISTINCT employee_id) employees,
            count(*) FILTER (WHERE check_in IS NOT NULL) punched_days,
            count(*) FILTER (WHERE is_weekly_off) off_days,
            count(*) FILTER (WHERE suppress_ot) overtime_suppressed_days,
            count(*) FILTER (WHERE tardiness_applied) tardiness_applied_days,
            count(*) FILTER (WHERE is_leave_day > 0 OR is_sick_day > 0 OR is_mission_day > 0) leave_state_days
            FROM roster_line WHERE date >= '{first}' AND date < '{end}' GROUP BY department_id ORDER BY department_id""",
        "daily_rule_groups": f"""SELECT department_id,required_minutes,planned_start_hour,planned_end_hour,
            suppress_ot,count(*) day_rows FROM roster_line WHERE date >= '{first}' AND date < '{end}'
            GROUP BY 1,2,3,4,5 ORDER BY 1,2,3,4,5""",
        "overtime_settings": """SELECT id,active,normal_ot_factor,weekend_ot_factor,holiday_ot_factor,
            night_ot_factor,tardy_b1_max,tardy_b1_ded,tardy_b2_max,tardy_b2_ded,
            tardy_b3_max,tardy_b3_ded,tardy_b4_ded FROM roster_overtime_config ORDER BY id""",
    }
    app = snapshot("attendance-app-db", "attendance_app", args.app_db, app_queries)
    odoo = snapshot("odoo-db", "odoo", args.odoo_db, odoo_queries)
    review, summary = build_report(app, odoo, month, {"app_database": args.app_db, "odoo_database": args.odoo_db})
    target = private_directory(args.output_root)
    write_private(target / "evidence.json", json.dumps({"summary": summary, "app": app, "odoo": odoo}, ensure_ascii=False, indent=2))
    headers = list(review[0]) if review else ["staff_id", "review_status"]
    write_private(target / "employee-review.csv", csv_text(review, headers))
    write_private(target / "summary.json", json.dumps(summary, indent=2))
    write_private(target / "report.html", report_html(summary, app, odoo))
    print(json.dumps(summary["counts"], sort_keys=True))
    print(f"Private report: {target / 'report.html'}")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, OSError, subprocess.TimeoutExpired):
        raise SystemExit("Inventory failed; database/schema or output checks need local review. No database writes were performed.") from None
