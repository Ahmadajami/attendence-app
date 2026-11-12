"""Read-only: Odoo people with punches in a month whom the app doesn't have → an `Employees` workbook
for `scripts/import-employees.ts` (plan 2026-11-12-october-odoo-parity, OC9).

A person is "missing" when their Odoo barcode is neither an app employee number nor an app legacy
badge (any staff, active or not), they are not in ~/secure/syravia/imports/exclude.json, and Odoo has
a punch for them in the month (hr_attendance, or a roster_line check-in). Each becomes one row:
employee number = old badge = the Odoo barcode, names, department path (as the app's departments),
job, joining date, work email and phone; no team; `Source` "Odoo <month>" (imported active).

Writes, outside the repo only: <out dir>/new-staff_<YYYY-MM>.xlsx (mode 600). Prints counts only.
Usage:
  python3 -P tools/odoo/extract_new_staff.py   # not -I: openpyxl is a user package 2026-10 ~/secure/syravia/imports/odoo/2026-10
"""
import csv, datetime as dt, io, json, os, subprocess, sys

import openpyxl

MONTH, OUT = sys.argv[1], os.path.abspath(os.path.expanduser(sys.argv[2]))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if OUT.startswith(REPO + os.sep) or OUT == REPO:
    sys.exit('Refusing to write inside the repo (real data stays in ~/secure/syravia/).')
first = dt.date.fromisoformat(MONTH + '-01')
nxt = (first.replace(day=28) + dt.timedelta(days=4)).replace(day=1)

# The 22 headers of scripts/import-employees.ts (EXPECTED_HEADERS in src/lib/workforce/employee-seed.ts).
HEADERS = ['#', 'ID (All Staff)', 'Odoo Badge ID', 'ID Mismatch', 'Name (English)', 'الاسم (Arabic)',
           'Odoo Name', 'Location', 'Team', 'Department (Odoo)', 'Job (Odoo)', 'Manager (Odoo)', 'Joining',
           'Weekly (H)', 'Shift', 'Email', 'Work Email (Odoo)', 'Work Phone (Odoo)', 'Probation (days)',
           'Probation Till', 'Source', 'Match Method']


def psql(container, user, db, sql):
    out = subprocess.run(['docker', 'exec', '-i', container, 'psql', '-U', user, '-d', db, '-X', '-q', '-c',
                          f'copy ({sql}) to stdout with csv header'], capture_output=True, text=True, check=True).stdout
    return list(csv.DictReader(io.StringIO(out)))


APP = ('attendance-app-db', 'attendance_app', os.environ.get('APP_DB', 'attendance_app'))
known = set()
for s in psql(*APP, "select employee_no, coalesce(legacy_badge_no,'') badge from staff"):
    known.update(v for v in (s['employee_no'], s['badge']) if v)
excluded = {str(p['odoo_employee_id'])
            for p in json.load(open(os.path.expanduser('~/secure/syravia/imports/exclude.json')))['people']}

T = lambda col: f"coalesce({col}->>'en_US', {col}::text)"
people = psql('odoo-db', 'odoo', 'syravia_dev', f"""
  with recursive dept as (
      select id, {T('name')} path from hr_department where parent_id is null
      union all select d.id, dept.path || ' / ' || {T('d.name')} from hr_department d join dept on d.parent_id = dept.id),
    punched as (
      select employee_id from hr_attendance where check_in >= '{first}'::date - 1 and check_in < '{nxt}'
      union select employee_id from roster_line where date >= '{first}' and date < '{nxt}' and check_in is not null),
    planned as (select distinct employee_id from roster_line where date >= '{first}' and date < '{nxt}')
  select e.id::text oid, coalesce(e.barcode, '') badge, e.name, coalesce(e.name_ar, '') name_ar,
         coalesce(dept.path, '') dept, coalesce({T('j.name')}, '') job,
         coalesce(v.contract_date_start::text, '') joining, coalesce(e.work_email, '') email,
         coalesce(e.work_phone, '') phone, (p.employee_id is not null) punched
  from hr_employee e
  join (select employee_id from planned union select employee_id from punched) m on m.employee_id = e.id
  left join punched p on p.employee_id = e.id
  left join hr_version v on v.id = e.current_version_id
  left join dept on dept.id = v.department_id
  left join hr_job j on j.id = v.job_id""")

missing = [p for p in people if p['oid'] not in excluded and p['badge'] not in known]
rows = [p for p in missing if p['badge'] and p['punched'] == 't']

wb = openpyxl.Workbook()
ws = wb.active
ws.title = 'Employees'
ws.append(HEADERS)
for i, p in enumerate(sorted(rows, key=lambda p: p['badge']), 1):
    joining = dt.date.fromisoformat(p['joining']) if p['joining'] else None
    cells = {'#': i, 'ID (All Staff)': p['badge'], 'Odoo Badge ID': p['badge'], 'Name (English)': p['name'],
             'الاسم (Arabic)': p['name_ar'], 'Odoo Name': p['name'], 'Department (Odoo)': p['dept'],
             'Job (Odoo)': p['job'], 'Joining': joining, 'Work Email (Odoo)': p['email'],
             'Work Phone (Odoo)': p['phone'], 'Source': f'Odoo {MONTH}', 'Match Method': 'Odoo badge'}
    ws.append([cells.get(h, '') for h in HEADERS])

os.makedirs(OUT, mode=0o700, exist_ok=True)
os.chmod(OUT, 0o700)
path = os.path.join(OUT, f'new-staff_{MONTH}.xlsx')
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'wb') as f:
    wb.save(f)
os.chmod(path, 0o600)

print(f'Odoo people in {MONTH}: {len(people)}; not in the app: {len(missing)}')
print(f'written: {len(rows)} (badge and punches); left out: '
      f'{sum(1 for p in missing if not p["badge"] and p["punched"] == "t")} with punches but no badge, '
      f'{sum(1 for p in missing if p["punched"] != "t")} planned without punches')
print(f'rows without a department: {sum(1 for p in rows if not p["dept"])}; without a job: '
      f'{sum(1 for p in rows if not p["job"])}; without a joining date: {sum(1 for p in rows if not p["joining"])}')
