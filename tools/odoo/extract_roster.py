"""Read-only: Odoo's month plan → the roster import's two files (plan 2026-11-12-roster-import, RI9).

Writes, outside the repo only:
  <out dir>/shifts_<YYYY-MM>.md  Code | Name EN | Name AR | Start | End | Required minutes | Break minutes | Colour
  <out dir>/roster_<YYYY-MM>.md  Employee No | Department | Team | <one column per date>

Rules (RI10, OC2, OC3):
- People: active app staff matched by Odoo barcode = staff.legacy_badge_no (else employee_no),
  people in ~/secure/syravia/imports/exclude.json left out, and members of a team that already has
  a roster in the month (e.g. Operations) left out.
- Group: Odoo plans by roster, and a roster belongs to departments. Each Odoo roster gets the
  nearest app department holding all its app people (Aleppo: Station Aleppo). The app plans a person
  by the nearest such department in their own chain, so that is their Department; a chain with none
  uses the person's own department; no department: their Team.
- Cells: `O` on Odoo's off days, a shift code on work days, empty where Odoo has no line.
  A shift is (required minutes of the day, start = median check-in of that group and length, to
  30 min). Code: length (8, 9, T = 10 h, E = 11 h, W = 12 h) + start hour, `H<h>` for :30.

Prints counts only. Usage:
  python3 -I tools/odoo/extract_roster.py 2026-10 ~/secure/syravia/imports/rosters/2026-10/odoo
"""
import collections, csv, datetime as dt, io, json, os, subprocess, sys

MONTH, OUT = sys.argv[1], os.path.abspath(os.path.expanduser(sys.argv[2]))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if OUT.startswith(REPO + os.sep):
    sys.exit('Refusing to write inside the repo (real data stays in ~/secure/syravia/).')
first = dt.date.fromisoformat(MONTH + '-01')
nxt = (first.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
DAYS = [(first + dt.timedelta(days=i)).isoformat() for i in range((nxt - first).days)]
COLOURS = ['#b45309', '#4338ca', '#0369a1']
LENGTH = {480: '8', 540: '9', 600: 'T', 660: 'E', 720: 'W'}


def psql(container, user, db, sql):
    out = subprocess.run(['docker', 'exec', '-i', container, 'psql', '-U', user, '-d', db, '-X', '-q', '-c',
                          f'copy ({sql}) to stdout with csv header'], capture_output=True, text=True, check=True).stdout
    return list(csv.DictReader(io.StringIO(out)))


APP = ('attendance-app-db', 'attendance_app', os.environ.get('APP_DB', 'attendance_app'))
excl = {p['staff_id'] for p in json.load(open(os.path.expanduser('~/secure/syravia/imports/exclude.json')))['people']}
depts = {d['id']: d for d in psql(*APP, 'select id::text, name_en, parent_id::text from department')}
staff = psql(*APP, f"""select s.id::text, s.employee_no, coalesce(nullif(s.legacy_badge_no,''), s.employee_no) badge,
  coalesce(s.department_id::text,'') dept, coalesce(t.name_en,'') team,
  exists (select 1 from pattern_assignment pa where pa.team_id = s.team_id
          and pa.effective_from < '{nxt}' and (pa.effective_to is null or pa.effective_to > '{first}')) team_rostered
  from staff s left join team t on t.id = s.team_id where s.active""")
by_badge = {s['badge']: s for s in staff if s['id'] not in excl and s['team_rostered'] != 't'}
existing_codes = {r['code']: r for r in psql(*APP, 'select code, start_time::text st, end_time::text et, required_minutes::text req from shift')}

L = "at time zone 'UTC' at time zone 'Asia/Damascus'"
lines = psql('odoo-db', 'odoo', 'syravia_dev', f"""
  select e.barcode b, l.date::text d, coalesce(l.is_weekly_off,false) off, coalesce(l.required_minutes,0) req,
         coalesce(el.roster_id::text,'') roster, coalesce(p.required_minutes,0) pat_req,
         extract(epoch from (l.check_in {L})::time)/60 cin
  from roster_line l join hr_employee e on e.id = l.employee_id
  left join roster_employee_line el on el.id = l.employee_line_id
  left join roster_shift_pattern p on p.id = el.pattern_id
  where l.date >= '{first}' and l.date < '{nxt}'""")

per = collections.defaultdict(dict)
roster_of = collections.defaultdict(collections.Counter)
for r in lines:
    if r['b'] in by_badge:
        per[r['b']][r['d']] = r
        if r['roster']:
            roster_of[r['b']][r['roster']] += 1


def chain(dept_id):
    out = []
    while dept_id:
        out.append(dept_id)
        dept_id = depts[dept_id]['parent_id'] if depts[dept_id]['parent_id'] else None
    return out


# Each Odoo roster → the nearest app department holding all its people that have one.
members = collections.defaultdict(list)
for b in per:
    if roster_of[b]:
        members[roster_of[b].most_common(1)[0][0]].append(by_badge[b])
roster_dept = {}
for roster, people in members.items():
    chains = [chain(p['dept']) for p in people if p['dept']]
    if not chains:
        continue
    common = [d for d in chains[0] if all(d in c for c in chains)]
    if common:
        roster_dept[roster] = common[0]


# The app plans a person by the NEAREST department of their chain that has a pattern, so a person's
# group is the first department in their chain that is some roster's department; someone whose
# chain has none uses their own department; no department: their team.
targets = set(roster_dept.values())


def group_of(b):
    s = by_badge[b]
    if s['dept']:
        for d in chain(s['dept']):
            if d in targets:
                return depts[d]['name_en'], ''
        return depts[s['dept']]['name_en'], ''
    return '', s['team']


groups = {b: group_of(b) for b in per}
# Shift starts: median check-in per (group, required), to 30 minutes.
ins = collections.defaultdict(list)
for b, days in per.items():
    for r in days.values():
        req = int(r['req']) or int(r['pat_req'])
        if r['off'] == 'f' and r['cin']:
            ins[(groups[b], req)].append(float(r['cin']))


def start_of(group, req):
    xs = sorted(ins.get((group, req)) or [x for (g, q), v in ins.items() if q == req for x in v] or [480])
    return int(round(xs[len(xs) // 2] / 30) * 30) % 1440


hm = lambda m: f'{m // 60:02d}:{m % 60:02d}'
shifts = {}  # (start, req) -> code


def code_of(start, req):
    if (start, req) in shifts:
        return shifts[(start, req)]
    h, mm = divmod(start, 60)
    code = LENGTH.get(req, 'X') + (f'{h:02d}' if mm == 0 else f'H{h}' if h < 10 else f'{h}')
    old = existing_codes.get(code)
    if old and (old['st'][:5], old['et'][:5], old['req']) != (hm(start), hm((start + req) % 1440), str(req)):
        sys.exit(f'Shift code {code} exists in the app with other times; nothing written.')
    shifts[(start, req)] = code
    return code


rows = []
for b, days in sorted(per.items(), key=lambda kv: (groups[kv[0]], by_badge[kv[0]]['employee_no'])):
    dept, team = groups[b]
    cells = []
    for d in DAYS:
        r = days.get(d)
        if r is None:
            cells.append('')
        elif r['off'] == 't':
            cells.append('O')
        else:
            req = int(r['req']) or int(r['pat_req']) or 540
            cells.append(code_of(start_of((dept, team), req), req))
    rows.append([by_badge[b]['employee_no'], dept, team] + cells)

os.makedirs(OUT, mode=0o700, exist_ok=True)
os.chmod(OUT, 0o700)


def write(name, header, body):
    path = os.path.join(OUT, name)
    with open(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as f:
        f.write('| ' + ' | '.join(header) + ' |\n|' + '---|' * len(header) + '\n')
        for r in body:
            f.write('| ' + ' | '.join(str(c) for c in r) + ' |\n')
    return path


shift_rows = []
for i, ((start, req), code) in enumerate(sorted(shifts.items(), key=lambda kv: kv[1])):
    end = hm((start + req) % 1440)
    shift_rows.append([code, f'{req // 60}h from {hm(start)}', f'{req // 60} ساعات من {hm(start)}', hm(start), end, req, 0,
                       COLOURS[i % len(COLOURS)]])
write(f'shifts_{MONTH}.md', ['Code', 'Name EN', 'Name AR', 'Start', 'End', 'Required minutes', 'Break minutes', 'Colour'], shift_rows)
write(f'roster_{MONTH}.md', ['Employee No', 'Department', 'Team'] + DAYS, rows)

g = collections.Counter(dept or f'team: {team}' for dept, team in groups.values())
print(f'people {len(rows)}; groups {len(g)} (departments {sum(1 for k in g if not k.startswith("team: "))}); shifts {len(shift_rows)}'
      f' (already in the app: {sum(1 for c in shifts.values() if c in existing_codes)})')
print('people per group:', dict(sorted(g.items(), key=lambda kv: -kv[1])))
print('left out: excluded', len(excl), '; members of a team rostered this month',
      sum(1 for s in staff if s['team_rostered'] == 't'))
