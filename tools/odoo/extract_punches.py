"""Read-only: Odoo punches + full-day states for one month → the app's punch import file (Markdown).

Columns: Employee No | Date | Check in | Check out | State. One line per punch part (a day with a
break window from roster_line becomes two parts) or per full-day state (sick / leave / mission).
People are matched by Odoo barcode = app staff.legacy_badge_no (else employee_no) and written with
their app employee number; Odoo people the app doesn't know keep their Odoo badge, so the import
lists them as refused instead of losing them. People in ~/secure/syravia/imports/exclude.json are
left out entirely. Prints counts only.

Usage (outside the repo only; the output is real data):
  python3 -I tools/odoo/extract_punches.py 2026-10 ~/secure/syravia/imports/odoo/2026-10/punches_2026-10.md
Then upload the file on /imports as "Punches and full-day states" (plan
2026-11-11-attendance-import-odoo-and-devices, IM1, IM3).
"""
import csv, io, json, os, subprocess, sys, collections, datetime as dt

MONTH, OUT = sys.argv[1], os.path.abspath(os.path.expanduser(sys.argv[2]))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if OUT.startswith(REPO + os.sep):
    sys.exit('Refusing to write inside the repo (real data stays in ~/secure/syravia/).')
first = dt.date.fromisoformat(MONTH + '-01')
nxt = (first.replace(day=28) + dt.timedelta(days=4)).replace(day=1)


def psql(c, u, d, sql):
    o = subprocess.run(['docker', 'exec', '-i', c, 'psql', '-U', u, '-d', d, '-X', '-q', '-c',
                        f'copy ({sql}) to stdout with csv header'], capture_output=True, text=True, check=True).stdout
    return list(csv.DictReader(io.StringIO(o)))


excl = json.load(open(os.path.expanduser('~/secure/syravia/imports/exclude.json')))['people']
excl_odoo = {str(p['odoo_employee_id']) for p in excl}
excl_staff = {p['staff_id'] for p in excl}

app = psql('attendance-app-db', 'attendance_app', 'attendance_app',
           "select id, employee_no, coalesce(nullif(legacy_badge_no,''), employee_no) badge from staff")
by_badge = {a['badge']: a for a in app if a['id'] not in excl_staff}

L = "at time zone 'UTC' at time zone 'Asia/Damascus'"
att = psql('odoo-db', 'odoo', 'syravia_dev', f"""
  select a.employee_id::text eid, coalesce(e.barcode,'') barcode,
         (a.check_in {L}) cin, (a.check_out {L}) cout
  from hr_attendance a join hr_employee e on e.id = a.employee_id
  where (a.check_in {L})::date >= '{first}' and (a.check_in {L})::date < '{nxt}'
  order by 2, 3""")
lines = psql('odoo-db', 'odoo', 'syravia_dev', f"""
  select l.employee_id::text eid, coalesce(e.barcode,'') barcode, l.date::text d,
         (l.break_start {L}) bs, (l.break_end {L}) be,
         case when l.is_sick_day > 0 then 'sick' when l.is_leave_day > 0 then 'leave'
              when l.is_mission_day > 0 then 'mission' end state
  from roster_line l join hr_employee e on e.id = l.employee_id
  where l.date >= '{first}' and l.date < '{nxt}'""")
brk = {(r['eid'], r['d']): (r['bs'], r['be']) for r in lines if r['bs'] and r['be']}

ts = lambda s: dt.datetime.fromisoformat(s) if s else None
hm = lambda t: t.strftime('%H:%M')
out, stats = [], collections.Counter()


def number(barcode):
    a = by_badge.get(barcode)
    if a: return a['employee_no'], True
    return barcode or '-', False


for r in att:
    if r['eid'] in excl_odoo:
        stats['excluded punches'] += 1; continue
    no, known = number(r['barcode'])
    stats['punch rows ' + ('matched' if known else 'not in app')] += 1
    cin, cout = ts(r['cin']), ts(r['cout'])
    day = cin.date().isoformat()
    b = brk.get((r['eid'], day))
    bs, be = (ts(b[0]), ts(b[1])) if b else (None, None)
    if cout and bs and be and cin < bs < be < cout:
        out.append((no, day, hm(cin), hm(bs), ''))
        out.append((no, day, hm(be), hm(cout), ''))
        stats['days split at a break'] += 1
    else:
        out.append((no, day, hm(cin), hm(cout) if cout else '', ''))
        if not cout: stats['open (no check-out)'] += 1
for r in lines:
    if not r['state']: continue
    if r['eid'] in excl_odoo:
        stats['excluded states'] += 1; continue
    no, known = number(r['barcode'])
    out.append((no, r['d'], '', '', r['state']))
    stats['state lines ' + ('matched' if known else 'not in app')] += 1

out.sort(key=lambda x: (x[0], x[1], x[4] != '', x[2]))
os.makedirs(os.path.dirname(OUT), mode=0o700, exist_ok=True)
os.chmod(os.path.dirname(OUT), 0o700)
with open(os.open(OUT, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as f:
    f.write('| Employee No | Date | Check in | Check out | State |\n|---|---|---|---|---|\n')
    for row in out:
        f.write('| ' + ' | '.join(row) + ' |\n')
print(f'lines written: {len(out)}; size {os.path.getsize(OUT)} bytes')
for k, v in sorted(stats.items()):
    print(f'  {k}: {v}')
print('  dates:', min(x[1] for x in out), 'to', max(x[1] for x in out))
