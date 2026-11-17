"""R0 read-only source inventory. Real invocations are user-run after diff review.

No services run on import. Console output is a fixed aggregate whitelist. Reports
are private evidence/review templates, never approval to import or archive.
"""

import argparse
import copy
from collections import Counter, defaultdict
import datetime as dt
import hashlib
import html
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import warnings
from zoneinfo import ZoneInfo

# -P deliberately excludes the script directory. Load only the reviewed sibling.
def sibling(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


inventory = sibling('workforce_inventory')
TZ = ZoneInfo('Asia/Damascus')
ROW_LIMIT = 100_000
SCHEMA_VERSION = 1
# Static allowlist, checked against the app schema and existing Odoo evidence tools.
# No new 0029/0030 fields are required. All history is retained for dependencies.
APP = {
    'department': 'id name_en name_ar parent_id active odoo_id',
    'team': 'id name_en name_ar department_id active',
    'staff': 'id full_name employee_no legacy_badge_no odoo_id active department_id team_id',
    'staff_team_membership': 'id staff_id team_id valid_from valid_to',
    'pattern': 'id name_en name_ar type slots default_work_shift_id active import_batch_id',
    'pattern_assignment': 'id pattern_id staff_id team_id department_id anchor_date effective_from effective_to import_batch_id',
    'staff_schedule': 'id staff_id off_weekdays crew_start effective_from effective_to import_batch_id',
    'shift': 'id code name_en name_ar start_time end_time ends_next_day required_minutes break_minutes grace_minutes active import_batch_id',
    'pattern_pay_rule': 'id pattern_id ot_enabled work_day_rate off_day_rate holiday_rate effective_from effective_to',
    'attendance_rule': 'id overtime_step overtime_mode friday_prayer_on friday_prayer_minutes friday_prayer_segments effective_from effective_to',
    'pattern_holiday': 'id pattern_id starts_on ends_on name_en name_ar ot_eligible cancelled_at',
    'pattern_holiday_exception': 'id pattern_id holiday_id applies ot_eligible',
    'swap_request': 'id staff_id other_staff_id first_date second_date shift_id state cancelled_at import_batch_id',
    'team_supervisor': 'id team_id staff_id added_at removed_at',
    'roster_override': 'id staff_id shift_date shift_id cancelled_at import_batch_id',
    'attendance_event': 'id staff_id team_id occurred_at shift_date type source corrects_event_id is_void import_batch_id',
    'absence': 'id staff_id starts_on ends_on type pattern_id cancelled_at import_batch_id',
    'day_result': 'id staff_id shift_date team_id pattern_id shift_id kind status source required_minutes worked_minutes credit_minutes explanation',
    'attendance_log': 'id staff_id shift_date old_value new_value cause_type cause_id at',
    'import_batch': 'id kind status created_at',
    'import_row': 'id batch_id row_no target_id parsed raw action',
    'audit_log': 'id action entity_type entity_id before after created_at',
}
ODOO = {
    'hr_employee': 'id barcode active current_version_id weekly_hours fixed_required_minutes use_fixed_schedule shift_pattern',
    'hr_version': 'id department_id job_id work_location_id resource_calendar_id',
    'hr_department': 'id name parent_id active',
    'resource_calendar': 'id name tz hours_per_day hours_per_week',
    'roster_shift_pattern': 'id name code required_minutes grace_minutes start_hour end_hour use_cycle cycle_work_days cycle_off_days active',
    'roster_shift': 'id department_id date_from date_to state default_pattern_id',
    'roster_employee_line': 'id roster_id employee_id department_id pattern_id required_minutes grace_minutes day_off_1 day_off_2 cycle_anchor_date pattern_start_hour pattern_end_hour',
    'roster_line': 'id employee_id department_id date required_minutes planned_start_hour planned_end_hour is_weekly_off actual_minutes check_in check_out break_minutes suppress_ot topup_minutes manual_state',
    'hr_attendance': 'id employee_id check_in check_out',
}
# These are configured/calculated evidence, not a separate HR adjustment ledger.
LIMITATIONS = [
    'No policy approval, import, recomputation, rename or archive was performed.',
    'Current hierarchy and current Odoo roles do not establish historical department membership.',
    'Required minutes are configured evidence pending review of approved dated policy references.',
    'Reception filenames suggest source kind only; correction precedence remains unresolved.',
    'JSON reference matches are candidate dependencies, not an exhaustive historical proof.',
    'No separate HR credit ledger collector is verified; configured/calculated credit is separate.',
    'Recorded Odoo roster_line attendance columns are calculated evidence, never raw punches.',
    'Independent app/Odoo snapshots are not one cross-database transaction.',
    'Backup/restore and team approval remain pending; R0 rollout acceptance is not automatic.',
]


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def date_value(value):
    if value is None or value == '':
        return None
    if isinstance(value, dt.datetime):
        value = value.replace(tzinfo=dt.timezone.utc) if value.tzinfo is None else value
        return value.astimezone(TZ).date()
    if isinstance(value, dt.date):
        return value
    text = str(value)
    if len(text) == 10:
        return dt.date.fromisoformat(text)
    return date_value(dt.datetime.fromisoformat(text.replace('Z', '+00:00')))


def dates(first, through):
    return [first + dt.timedelta(days=i) for i in range((through - first).days + 1)]


def issue(code, **private):
    return {'code': code, **private}


def protected_path(path, *, exists=False):
    """Resolve within the secure root, refusing symlinks even when they stay inside."""
    path = Path(path).expanduser().absolute()
    secure = (Path.home() / 'secure/syravia').absolute()
    if not path.is_relative_to(secure) or '..' in path.parts:
        raise ValueError('unsafe_path')
    for part in [path, *path.parents]:
        if part.is_symlink():
            raise ValueError('unsafe_path')
    resolved = path.resolve()
    if not resolved.is_relative_to(secure.resolve()):
        raise ValueError('unsafe_path')
    repo = Path(__file__).resolve().parents[2]
    if resolved.is_relative_to(repo) or (exists and not path.exists()):
        raise ValueError('unsafe_path')
    return resolved


PRIOR_TABLES = {
    'app': {'department': 'departments', 'team': 'teams', 'staff': 'staff', 'shift': 'shifts',
            'pattern': 'patterns', 'pattern_assignment': 'assignments', 'staff_schedule': 'schedules',
            'staff_team_membership': 'memberships', 'pattern_pay_rule': 'pay_rules', 'attendance_rule': 'attendance_rules'},
    'odoo': {'hr_department': 'departments', 'hr_employee': 'staff', 'resource_calendar': 'calendars',
             'roster_shift_pattern': 'patterns', 'roster_shift': 'rosters', 'roster_employee_line': 'roster_members'}}


def collect(database, source, prior=None):
    """Metadata probe then one data snapshot; unavailable sections never become empty."""
    spec = APP if source == 'app' else ODOO
    container, user = ('attendance-app-db', 'attendance_app') if source == 'app' else ('odoo-db', 'odoo')
    start = now()
    result = {'captured_at_utc': start, 'completed_at_utc': None,
              'database': database, 'provenance': 'measured', 'sections': {}, 'manifest': [], 'unchecked_reference_columns': []}
    sections = result['sections']
    try:
        meta = inventory.snapshot(container, user, database, {
            'columns': "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'"
        })['columns']
        available = defaultdict(set)
        for row in meta:
            available[row['table_name']].add(row['column_name'])
        result['unchecked_reference_columns'] = [
            {'table': table, 'column': col} for table, cols in available.items()
            for col in sorted(cols & {'team_id', 'shift_id', 'pattern_id', 'default_work_shift_id'})
            if col not in spec.get(table, '').split()]
        queries = {}
        for table, fields in spec.items():
            historical = (prior or {}).get(source, {}).get(PRIOR_TABLES[source].get(table), [])
            same_database = (prior or {}).get('summary', {}).get('sources', {}).get(source + '_database') == database
            reusable = same_database and historical and all(set(fields.split()) <= set(r) for r in historical)
            if reusable:
                sections[table] = {'status': 'present', 'rows': historical, 'provenance': 'historical',
                                   'captured_at_utc': prior['summary']['captured_at_utc'],
                                   'original_month': prior['summary']['month']}
                result['manifest'].append({'table': table, 'columns': fields, 'scope': 'historical_prior_evidence',
                                          'limitations': 'Original date scope; not a fresh dependency proof.'})
                continue
            missing = sorted(set(fields.split()) - available[table])
            result['manifest'].append({'table': table, 'columns': fields, 'missing': missing,
                                       'row_limit': ROW_LIMIT, 'scope': 'all_retained_history'})
            if missing:
                sections[table] = {'status': 'unavailable', 'reason': 'missing_columns', 'rows': []}
            else:
                # Every identifier originates in the static manifest, never user input.
                columns = ','.join('"' + f + '"' for f in fields.split())
                queries[table] = f'SELECT {columns} FROM public."{table}" ORDER BY id LIMIT {ROW_LIMIT + 1}'
        if queries:
            measured = inventory.snapshot(container, user, database, queries)
            for table, rows in measured.items():
                sections[table] = ({'status': 'unavailable', 'reason': 'row_limit', 'rows': []}
                                   if len(rows) > ROW_LIMIT else {'status': 'present', 'rows': rows})
    except Exception:
        # Never retain raw psql errors, which can contain employee details.
        for table in spec:
            sections.setdefault(table, {'status': 'unavailable', 'reason': 'snapshot_failed', 'rows': []})
    result['completed_at_utc'] = now()
    return result


def rows(capture, table):
    section = capture.get('sections', {}).get(table, {})
    return section.get('rows', []) if section.get('status') == 'present' else []


def available(capture, table):
    return capture.get('sections', {}).get(table, {}).get('status') == 'present'


def identity_review(app, odoo):
    matches = inventory.match_staff(rows(app, 'staff'), rows(odoo, 'hr_employee'))
    review = []
    claimed = set()
    for match in matches:
        staff, employee = match['staff'], match['odoo'] or {}
        if employee:
            claimed.add(str(employee['id']))
        review.append({'staff_id': staff['id'], 'odoo_id': employee.get('id'),
                       'app_employee_no': staff.get('employee_no'),
                       'active': staff.get('active'), 'status': match['status'],
                       'method': match['method'], 'approval': 'pending', 'reviewer': '',
                       'identity_sources_available': available(app, 'staff') and available(odoo, 'hr_employee'),
                       'app_identity_provenance': app.get('sections', {}).get('staff', {}).get('provenance', 'measured'),
                       'odoo_identity_provenance': odoo.get('sections', {}).get('hr_employee', {}).get('provenance', 'measured'),
                       'valid_from': '', 'valid_to': '', 'evidence': 'identity_crosscheck_not_dated_approval'})
    for employee in rows(odoo, 'hr_employee'):
        if str(employee['id']) not in claimed:
            review.append({'staff_id': None, 'odoo_id': employee['id'], 'status': 'source_only',
                           'method': 'none', 'approval': 'pending', 'reviewer': ''})
    return review


def workbook_helpers():
    # infer_airport_hours imports openpyxl; defer this until workbook handling.
    return sibling('infer_airport_hours')


def workbook_manifest(root):
    """No silent traversal errors, no symlink traversal, no sibling folder reads."""
    root = Path(root).resolve()
    files, issues = [], []
    def failed(_):
        issues.append(issue('unreadable_directory'))
    for directory, dirs, names in os.walk(root, followlinks=False, onerror=failed):
        for name in list(dirs):
            p = Path(directory) / name
            if p.is_symlink():
                dirs.remove(name)
                issues.append(issue('unsafe_entry', path=str(p)))
        for name in sorted(names):
            p = Path(directory) / name
            if p.is_symlink() or not p.resolve().is_relative_to(root):
                issues.append(issue('unsafe_entry', path=str(p)))
            elif p.suffix.lower() != '.xlsx' or name.startswith(('~$', '.~lock')):
                issues.append(issue('unsupported_entry', path=str(p)))
            else:
                files.append(p)
    return sorted(files), issues


def read_workbooks(root, first, through, odoo_people, helpers=None):
    import openpyxl
    helpers = helpers or workbook_helpers()
    files, issues = workbook_manifest(root)
    evidence, manifest = [], []
    badges = defaultdict(list)
    for person in odoo_people:
        key = helpers.badge_key(person.get('barcode'))
        if key:
            badges[key].append(person['id'])
    fingerprints = {}
    for file in files:
        try:
            if file.stat().st_size > 64 * 1024 * 1024:
                raise ValueError('workbook_limit')
            digest = hashlib.sha256(file.read_bytes()).hexdigest()
        except OSError:
            issues.append(issue('workbook_failed', file=str(file)))
            continue
        except ValueError:
            issues.append(issue('workbook_limit', file=str(file)))
            continue
        duplicate_of = fingerprints.get(digest)
        fingerprints.setdefault(digest, str(file))
        entry = {'file': str(file), 'sha256': digest, 'duplicate_of': duplicate_of, 'sheets': []}
        manifest.append(entry)
        if duplicate_of:
            issues.append(issue('duplicate_file', file=str(file), original=duplicate_of))
        kind = ('correction' if file.name.lower().startswith('correction') else
                'range' if '_to_' in file.name else 'daily')
        try:
            with file.open('rb') as cached, file.open('rb') as formulas:
                book = openpyxl.load_workbook(cached, read_only=True, data_only=True)
                raw = openpyxl.load_workbook(formulas, read_only=True, data_only=False)
                try:
                    for sheet in book.worksheets:
                        headers = next(sheet.iter_rows(min_row=4, max_row=4, values_only=True), ())
                        expected = {0: 'ID', 3: 'Date', 4: 'in_1', 5: 'out_1', 6: 'in_2', 7: 'out_2', 10: 'Department'}
                        valid = all(len(headers) > i and headers[i] == v for i, v in expected.items())
                        entry['sheets'].append({'sheet': sheet.title, 'layout': 'supported' if valid else 'blocked'})
                        if not valid:
                            issues.append(issue('unsupported_headers', file=str(file), sheet=sheet.title))
                            continue
                        for number, (values, cells) in enumerate(zip(
                            sheet.iter_rows(min_row=5, values_only=True),
                            raw[sheet.title].iter_rows(min_row=5)), 5):
                            if not any(v is not None for v in values):
                                continue
                            values = list(values) + [None] * max(0, 11 - len(values))
                            if number > ROW_LIMIT + 4:
                                raise ValueError('workbook_row_limit')
                            ref = {'file': str(file), 'sha256': digest, 'sheet': sheet.title, 'row': number}
                            # Keep unknown dates in evidence/issues; never select by filename.
                            value = values[3]
                            day = value.date() if isinstance(value, dt.datetime) else value
                            if not isinstance(day, dt.date):
                                issues.append(issue('invalid_row_date', **ref))
                                evidence.append({**ref, 'date': None, 'classification': 'invalid', 'raw': values})
                                continue
                            if not first <= day <= through:
                                continue
                            missing_formula = any(cell.data_type == 'f' and values[i] is None
                                                  for i, cell in enumerate(cells))
                            candidates = badges.get(helpers.badge_key(values[0]), [])
                            identity = ('matched' if len(candidates) == 1 else
                                        'ambiguous_badge' if candidates else 'unmatched')
                            parts, worked, incomplete, overlap = helpers.segments(values)
                            invalid_clock = any(v not in (None, '') and helpers.clock_minutes(v) is None
                                                for v in values[4:8])
                            classification = ('duplicate' if duplicate_of else 'invalid'
                                              if missing_formula or invalid_clock or incomplete or overlap else
                                              'quarantined' if identity != 'matched' or not parts else 'candidate')
                            evidence.append({**ref, 'date': day.isoformat(), 'source_kind': kind,
                                'source_kind_status': 'filename_hint_only', 'identity_status': identity,
                                'employee_id': candidates[0] if len(candidates) == 1 else None,
                                'attendance_group': values[10], 'raw': values, 'parts': parts,
                                'observed_minutes': worked, 'incomplete': incomplete,
                                'overlap': overlap, 'missing_formula_cache': missing_formula,
                                'empty_punches': not parts, 'classification': classification,
                                'cutoff_status': 'provisional' if day == through else 'historical',
                                'correction_status': 'unresolved' if kind == 'correction' else 'unreviewed'})
                finally:
                    book.close()
                    raw.close()
        except Exception:
            issues.append(issue('workbook_failed', file=str(file)))
            entry['status'] = 'unavailable'
    grouped = defaultdict(list)
    for row in evidence:
        if row.get('employee_id') is not None and row.get('date'):
            grouped[(str(row['employee_id']), row['date'])].append(row)
    for group in grouped.values():
        if len(group) < 2:
            continue
        signatures = {json.dumps(r.get('parts'), sort_keys=True) for r in group}
        code = 'repeated_person_date' if len(signatures) == 1 else 'conflicting_person_date'
        for row in group:
            row['conflict'] = code
            if row['classification'] == 'candidate':
                row['classification'] = 'quarantined'
        issues.append(issue(code, references=[{k: r[k] for k in ('file', 'sheet', 'row')} for r in group]))
    return {'status': 'present', 'captured_at_utc': now(), 'rows': evidence,
            'manifest': manifest, 'issues': issues}


def team_on(app, staff_id, day):
    midnight = dt.datetime.combine(day, dt.time(), TZ)
    def instant(v):
        parsed = dt.datetime.fromisoformat(str(v).replace('Z', '+00:00'))
        return parsed.replace(tzinfo=dt.timezone.utc) if parsed.tzinfo is None else parsed
    found = [r for r in rows(app, 'staff_team_membership') if r.get('staff_id') == staff_id
             and instant(r['valid_from']) <= midnight
             and (not r.get('valid_to') or midnight < instant(r['valid_to']))]
    return ('ambiguous', None) if len(found) > 1 else (
        ('dated', found[0]['team_id']) if found else ('unassigned', None))


def row_days(table, row, first, through, source):
    """Coverage only: no generation of planned or actual work from cycles."""
    if table in ('staff_team_membership',):
        start, end = date_value(row.get('valid_from')), date_value(row.get('valid_to'))
        # Timestamp boundaries are tested at local midnight, unlike plain date ends.
        if start:
            a = dt.datetime.fromisoformat(str(row['valid_from']).replace('Z', '+00:00'))
            if a.tzinfo is None:
                a = a.replace(tzinfo=dt.timezone.utc)
            if a.astimezone(TZ).time() != dt.time():
                start += dt.timedelta(days=1)
        if end:
            b = dt.datetime.fromisoformat(str(row['valid_to']).replace('Z', '+00:00'))
            if b.tzinfo is None:
                b = b.replace(tzinfo=dt.timezone.utc)
            if b.astimezone(TZ).time() != dt.time():
                end += dt.timedelta(days=1)
        return [d for d in dates(first, through) if start and d >= start and (not end or d < end)]
    if 'effective_from' in row:
        a, b = date_value(row.get('effective_from')), date_value(row.get('effective_to'))
        return [d for d in dates(first, through) if a and a <= d and (b is None or d < b)]
    if 'starts_on' in row or 'date_from' in row:
        a = date_value(row.get('starts_on', row.get('date_from')))
        b = date_value(row.get('ends_on', row.get('date_to')))
        return [d for d in dates(first, through) if a and a <= d and (b is None or d <= b)]
    value = row.get('shift_date', row.get('date'))
    if table == 'hr_attendance':
        value = row.get('check_in')
    if table == 'swap_request':
        return sorted({d for k in ('first_date', 'second_date') if (d := date_value(row.get(k))) and first <= d <= through})
    if table in ('audit_log', 'import_batch'):
        value = row.get('at', row.get('created_at'))
    day = date_value(value)
    return [day] if day and first <= day <= through else []


# Collections without event/effective dates are current snapshots, not daily history.
DATED = {
    'app': ['staff_team_membership', 'pattern_assignment', 'staff_schedule', 'pattern_pay_rule',
            'attendance_rule', 'pattern_holiday', 'roster_override', 'attendance_event',
            'absence', 'day_result', 'attendance_log', 'import_batch', 'audit_log', 'swap_request'],
    'odoo': ['roster_shift', 'roster_employee_line', 'roster_line', 'hr_attendance'],
}


def coverage(app, odoo, reception, identities, first, through):
    result = []
    crosswalk = {str(r['odoo_id']): r['staff_id'] for r in identities if r['status'] == 'matched'}
    for source, capture in [('app', app), ('odoo', odoo)]:
        for table in (APP if source == 'app' else ODOO):
            if table not in DATED[source]:
                result.append({'source': source, 'kind': table, 'date': None,
                    'group': 'current_snapshot', 'status': 'not_applicable' if available(capture, table) else 'unavailable',
                    'raw_rows': len(rows(capture, table)) if available(capture, table) else None,
                    'provenance': ('historical' if capture.get('sections', {}).get(table, {}).get('provenance') == 'historical' else 'current_snapshot_not_history'),
                    'captured_at_utc': capture.get('sections', {}).get(table, {}).get('captured_at_utc', capture.get('captured_at_utc'))})
                continue
            selected = rows(capture, table)
            if table == 'roster_employee_line':
                roster_by_id = {str(r['id']): r for r in rows(odoo, 'roster_shift')}
                selected = [{**r, **{k: roster_by_id.get(str(r['roster_id']), {}).get(k)
                                     for k in ('date_from', 'date_to')}} for r in selected]
            buckets = defaultdict(list)
            for row in selected:
                for day in row_days(table, row, first, through, source):
                    staff_id = row.get('staff_id') if source == 'app' else crosswalk.get(str(row.get('employee_id')))
                    status, team = team_on(app, staff_id, day) if staff_id else ('unresolved', None)
                    group = row.get('team_id') or team or status
                    buckets[(day, str(group))].append((row, staff_id))
            group_dates = {group: {d for d, g in buckets if g == group} for _, group in buckets}
            known_groups = {group for _, group in buckets} | {'unresolved'}
            for day in dates(first, through):
                groups = [(group, buckets.get((day, group), [])) for group in sorted(known_groups)]
                for group, data in groups:
                    state = 'present' if data else 'unverified'
                    if not available(capture, table):
                        state = 'unavailable'
                    original_month = capture.get('sections', {}).get(table, {}).get('original_month')
                    if original_month and day.strftime('%Y-%m') != original_month:
                        state = 'unverified'
                    if source == 'odoo' and table == 'hr_attendance' and dt.date(2026, 10, 21) <= day <= dt.date(2026, 10, 24):
                        state = 'conflict_with_confirmation' if data else 'confirmed_absent'
                    people = {str(person) for _, person in data if person is not None}
                    result.append({'source': source, 'kind': table, 'date': day.isoformat(),
                        'group': group, 'status': state, 'raw_rows': len(data) if available(capture, table) else None, 'people': len(people),
                        'person_dates': len(people), 'unidentified_rows': sum(p is None for _, p in data),
                        'incomplete_rows': sum(table == 'hr_attendance' and not r.get('check_out') for r, _ in data),
                        'first_observed': min(group_dates[group]).isoformat() if group_dates.get(group) else None,
                        'last_observed': max(group_dates[group]).isoformat() if group_dates.get(group) else None,
                        'provenance': capture.get('sections', {}).get(table, {}).get('provenance', capture.get('provenance', 'measured')),
                        'captured_at_utc': capture.get('sections', {}).get(table, {}).get('captured_at_utc', capture.get('captured_at_utc')),
                        'cutoff_status': 'provisional' if day == through else 'historical'})
    for kind in ('daily', 'correction', 'range'):
        for day in dates(first, through):
            by_group = defaultdict(list)
            for row in reception['rows']:
                if row.get('source_kind') == kind and row.get('date') == day.isoformat():
                    by_group[str(row.get('attendance_group') or 'unresolved')].append(row)
            for group, data in (by_group.items() or [('unresolved', [])]):
                people = {str(r['employee_id']) for r in data if r.get('employee_id') is not None}
                result.append({'source': 'reception', 'kind': kind, 'date': day.isoformat(),
                    'group': group, 'status': ('present' if data else 'unavailable' if reception.get('issues') else 'missing_source'),
                    'raw_rows': len(data), 'people': len(people), 'person_dates': len(people),
                    'unidentified_rows': sum(r.get('employee_id') is None for r in data),
                    'invalid_rows': sum(r['classification'] == 'invalid' for r in data),
                    'quarantined_rows': sum(r['classification'] == 'quarantined' for r in data),
                    'candidate_rows': sum(r['classification'] == 'candidate' for r in data),
                    'incomplete_rows': sum(bool(r.get('incomplete')) for r in data),
                    'first_observed': min((r['date'] for r in reception['rows'] if r.get('date') and r.get('source_kind') == kind and str(r.get('attendance_group') or 'unresolved') == group), default=None),
                    'last_observed': max((r['date'] for r in reception['rows'] if r.get('date') and r.get('source_kind') == kind and str(r.get('attendance_group') or 'unresolved') == group), default=None),
                    'duplicates': sum(r['classification'] == 'duplicate' for r in data),
                    'conflicts': sum(bool(r.get('conflict')) for r in data),
                    'captured_at_utc': reception.get('captured_at_utc'), 'provenance': 'measured'})
    # Explicitly unsupported record kinds cannot masquerade as zero counts.
    for source, kind in [('app', 'hr_adjustment_ledger'), ('odoo', 'hr_adjustment_ledger')]:
        for day in dates(first, through):
            result.append({'source': source, 'kind': kind, 'date': day.isoformat(),
                           'group': 'unresolved', 'status': 'unavailable', 'raw_rows': None})
    result.extend(record_kind_views(app, odoo, first, through))
    return result


def record_kind_views(app, odoo, first, through):
    """Disjoint event versions and explicitly derived/configured evidence views."""
    views = [
        ('app', 'attendance_event', 'original_punches', lambda r: not r.get('corrects_event_id')),
        ('app', 'attendance_event', 'correction_versions', lambda r: bool(r.get('corrects_event_id')) and not r.get('is_void')),
        ('app', 'attendance_event', 'void_corrections', lambda r: bool(r.get('is_void'))),
        ('app', 'day_result', 'calculated_credit', lambda r: r.get('credit_minutes') not in (None, 0)),
        ('odoo', 'roster_line', 'planned_daily_requirements', lambda r: r.get('required_minutes') is not None),
        ('odoo', 'roster_line', 'calculated_attendance', lambda r: r.get('actual_minutes') is not None),
        ('odoo', 'roster_line', 'configured_topup_credit', lambda r: r.get('topup_minutes') not in (None, 0)),
    ]
    result = []
    for source, table, kind, predicate in views:
        cap = app if source == 'app' else odoo
        counts = Counter(day for r in rows(cap, table) if predicate(r)
                         for day in row_days(table, r, first, through, source))
        for day in dates(first, through):
            result.append({'source': source, 'kind': kind, 'date': day.isoformat(),
                'group': 'all_groups', 'status': ('unavailable' if not available(cap, table) else
                                                  'present' if counts[day] else 'unverified'),
                'raw_rows': counts[day] if available(cap, table) else None,
                'evidence_role': 'raw_event_version' if table == 'attendance_event' else 'calculated_or_configured_not_raw_attendance',
                'captured_at_utc': cap.get('captured_at_utc'), 'provenance': 'measured'})
    return result


# Known direct relational edges plus arrays/JSON handled separately below.
EDGES = {
    'shift': [('pattern', 'default_work_shift_id'), ('roster_override', 'shift_id'),
              ('swap_request', 'shift_id'), ('day_result', 'shift_id')],
    'team': [('staff', 'team_id'), ('staff_team_membership', 'team_id'),
             ('pattern_assignment', 'team_id'), ('team_supervisor', 'team_id'),
             ('attendance_event', 'team_id'), ('day_result', 'team_id')],
    'pattern': [('pattern_assignment', 'pattern_id'), ('pattern_pay_rule', 'pattern_id'),
                ('pattern_holiday', 'pattern_id'), ('pattern_holiday_exception', 'pattern_id'),
                ('absence', 'pattern_id'), ('day_result', 'pattern_id')],
}


def json_has(value, target):
    if isinstance(value, dict):
        return any(json_has(v, target) for v in value.values())
    if isinstance(value, list):
        return any(json_has(v, target) for v in value)
    return str(value) == str(target) if value is not None else False


def dependency_inventory(app):
    output, proposals = [], []
    for entity, edges in EDGES.items():
        for item in rows(app, entity):
            target = item['id']
            specs = [(t, col, [r for r in rows(app, t) if r.get(col) == target]) for t, col in edges]
            if entity == 'shift':
                patterns = [p for p in rows(app, 'pattern') if target in (p.get('slots') or [])]
                specs += [('pattern', 'slots_distinct_patterns', patterns),
                          ('pattern', 'slot_occurrences', [p for p in patterns for slot in p['slots'] if slot == target])]
            for table, fields in [('import_row', ['target_id', 'parsed', 'raw']),
                                  ('audit_log', ['entity_id', 'before', 'after']),
                                  ('day_result', ['explanation']),
                                  ('attendance_log', ['old_value', 'new_value'])]:
                specs.append((table, 'candidate_json_or_target', [r for r in rows(app, table)
                             if any(json_has(r.get(f), target) for f in fields)]))
            if entity in ('shift', 'pattern'):
                specs.append((entity, 'creation_batch', [item] if item.get('import_batch_id') else []))
            if entity == 'team':
                members = {m['staff_id'] for m in rows(app, 'staff_team_membership') if m['team_id'] == target}
                for table in ['roster_override', 'absence', 'day_result']:
                    specs.append((table, 'indirect_person_history', [r for r in rows(app, table) if r.get('staff_id') in members]))
            for table, edge, refs in specs:
                known = available(app, table) and (edge != 'indirect_person_history' or available(app, 'staff_team_membership'))
                boundaries = [str(r[k]) for r in refs for k in ('shift_date', 'valid_from', 'effective_from', 'starts_on', 'valid_to', 'effective_to', 'ends_on', 'created_at', 'at') if r.get(k)]
                output.append({'entity_kind': entity, 'entity_id': target, 'table': table, 'edge': edge,
                    'status': ('historical' if app.get('sections', {}).get(table, {}).get('provenance') == 'historical' else 'measured') if known else 'unavailable', 'count': len(refs) if known else None,
                    'row_ids': [r.get('id') for r in refs], 'first_use': min(boundaries) if boundaries else None,
                    'last_use': max(boundaries) if boundaries else None,
                    'active_rows': sum(r.get('active') is True for r in refs) if known else None,
                    'inactive_rows': sum(r.get('active') is False for r in refs) if known else None,
                    'cancelled_rows': sum(bool(r.get('cancelled_at') or r.get('is_void')) for r in refs) if known else None,
                    'row_states': dict(Counter(str(r.get('state', r.get('status', 'unspecified'))) for r in refs)) if known else None,
                    'open_ended_references': sum(any(k in r and r[k] is None for k in ('valid_to', 'effective_to')) for r in refs) if known else None,
                    'reference_type': 'candidate' if 'candidate' in edge else 'indirect' if 'indirect' in edge else 'direct'})
            # No proof of exhaustive audit/JSON coverage: never automatically certify unused.
            proposals.append({'entity_kind': entity, 'old_id': target, 'retained_id': '',
                'name_en': item.get('name_en', ''), 'name_ar': item.get('name_ar', ''),
                'proposed_name_en': '', 'proposed_name_ar': '', 'semantic_equivalence': 'unreviewed',
                'required_minutes': item.get('required_minutes'), 'start_time': item.get('start_time'),
                'end_time': item.get('end_time'), 'ends_next_day': item.get('ends_next_day'),
                'dependency_status': 'incomplete' if app.get('unchecked_reference_columns') or any(not available(app, t) for t, _, _ in specs) else 'known_edges_only',
                'archive_eligibility': 'blocked_pending_review', 'approval': 'pending', 'reason': '', 'cycle_role': 'review_slot_and_default_dependencies',
                'unchecked_reference_columns': app.get('unchecked_reference_columns', [])})
    return output, proposals


def team_review(app, odoo, identities, first, through):
    """Expose evidence and interval boundaries; do not implement another roster resolver."""
    result = []
    patterns = {p['id']: p for p in rows(app, 'pattern')}
    shifts = {s['id']: s for s in rows(app, 'shift')}
    team_by_id = {t['id']: t for t in rows(app, 'team')}
    for staff in rows(app, 'staff'):
        sid = staff['id']
        mapping = next((r for r in identities if r.get('staff_id') == sid), {})
        relevant = {t: [r for r in rows(app, t) if r.get('staff_id') == sid]
                    for t in ('staff_team_membership', 'staff_schedule', 'roster_override', 'absence')}
        memberships = relevant['staff_team_membership']
        teams = {r['team_id'] for r in memberships}
        departments = {d['id']: d for d in rows(app, 'department')}
        chain, parent = [], staff.get('department_id')
        while parent is not None and parent not in chain:
            chain.append(parent)
            parent = departments.get(parent, {}).get('parent_id')
        assignments = [a for a in rows(app, 'pattern_assignment') if a.get('staff_id') == sid or
                       a.get('team_id') in teams or a.get('department_id') in chain]
        split = {first, through + dt.timedelta(days=1)}
        # Split only review intervals, not the original stored effective dates.
        if first < dt.date(2026, 10, 25) <= through:
            split.add(dt.date(2026, 10, 25))
        for row in [*memberships, *assignments, *relevant['staff_schedule'],
                    *rows(app, 'pattern_pay_rule'), *rows(app, 'attendance_rule'),
                    *relevant['roster_override'], *relevant['absence'], *rows(app, 'pattern_holiday')]:
            for key in ('valid_from', 'valid_to', 'effective_from', 'effective_to', 'shift_date', 'starts_on', 'ends_on'):
                day = date_value(row.get(key))
                if day and first < day <= through:
                    split.add(day)
                    if key in ('shift_date', 'ends_on') and day < through:
                        split.add(day + dt.timedelta(days=1))
        points = sorted(split)
        for start, end in zip(points, points[1:]):
            status, team_id = team_on(app, sid, start)
            # Preserve all possible assignment evidence; ambiguity must be reviewed.
            candidates = [a for a in assignments if start in row_days('pattern_assignment', a, start, start, 'app')
                          and (a.get('staff_id') == sid or (team_id is not None and a.get('team_id') == team_id)
                               or a.get('department_id') is not None)]
            result.append({'staff_id': sid, 'odoo_id': mapping.get('odoo_id'),
                'identity_status': mapping.get('status', 'unresolved'), 'team_id': team_id,
                'team_name_en': team_by_id.get(team_id, {}).get('name_en', ''),
                'team_name_ar': team_by_id.get(team_id, {}).get('name_ar', ''),
                'interval_from': start.isoformat(), 'interval_to_exclusive': end.isoformat(),
                'period': 'baseline' if start < dt.date(2026, 10, 25) else 'later_review',
                'membership_status': status if available(app, 'staff_team_membership') else 'unavailable',
                'membership_evidence': memberships, 'current_department_chain': chain,
                'department_history_status': 'unverified',
                'assignment_candidates': candidates,
                'assignment_precedence': 'personal_then_team_then_nearest_department; candidates_not_resolved',
                'pattern_evidence': [patterns[a['pattern_id']] for a in candidates if a.get('pattern_id') in patterns],
                'shift_evidence': [shifts[x] for a in candidates for x in patterns.get(a.get('pattern_id'), {}).get('slots', []) if x in shifts],
                'own_schedule': relevant['staff_schedule'], 'exceptions': relevant['roster_override'],
                'holiday_evidence': rows(app, 'pattern_holiday'),
                'holiday_exception_evidence': rows(app, 'pattern_holiday_exception'),
                'swap_evidence': [r for r in rows(app, 'swap_request') if sid in (r.get('staff_id'), r.get('other_staff_id'))],
                'configured_pay_rule_evidence': rows(app, 'pattern_pay_rule'),
                'dated_attendance_rule_evidence': rows(app, 'attendance_rule'),
                'policy_effective_date_notes': 'Night factor only: 2026-10-25; other new policies: 2026-11-01; no universal roster transition.',
                'absences': relevant['absence'], 'timezone': 'Asia/Damascus',
                'required_policy_reference': '', 'approved_required_minutes': None,
                'approved_from': '', 'approved_to': '', 'confirmed_change_date': '',
                'cycle_phase_confirmation': '', 'rest_day_confirmation': '', 'break_grace_credit_confirmation': '',
                'proposed_shift_name_en': '', 'proposed_shift_name_ar': '',
                'confidence': 'unreviewed', 'reviewer': '', 'approval': 'pending',
                'source_availability': {t: app.get('sections', {}).get(t, {}).get('status', 'unavailable') for t in APP},
                'unresolved': 'Department ancestry/history, policy, exceptions and cycle phase need local review.'})
    represented = {r['team_id'] for r in result}
    for team in rows(app, 'team'):
        if team['id'] not in represented:
            result.append({'team_id': team['id'], 'team_name_en': team.get('name_en'),
                           'team_name_ar': team.get('name_ar'), 'approval': 'pending',
                           'unresolved': 'No verified dated members in requested scope.'})
    roster_headers = {str(r['id']): r for r in rows(odoo, 'roster_shift')}
    for member in rows(odoo, 'roster_employee_line'):
        header = roster_headers.get(str(member['roster_id']), {})
        if header and row_days('roster_shift', header, first, through, 'odoo'):
            result.append({'source': 'odoo_planned_roster', 'odoo_id': member['employee_id'],
                'roster_header': header, 'roster_member': member, 'approval': 'pending',
                'shift_pattern_evidence': [p for p in rows(odoo, 'roster_shift_pattern')
                    if p['id'] in (member.get('pattern_id'), header.get('default_pattern_id'))],
                'unresolved': 'Validate dated employee exceptions; planned evidence is not attendance.'})
    return result


def attendance_group_reviews(reception):
    groups = defaultdict(list)
    for row in reception['rows']:
        groups[str(row.get('attendance_group') or 'unresolved')].append(row)
    return [{'source': 'reception_attendance_group', 'attendance_group': group,
             'formal_team_id': None, 'date_from': min((r.get('date') for r in records if r.get('date')), default=None),
             'date_through': max((r.get('date') for r in records if r.get('date')), default=None),
             'source_references': [{k: r.get(k) for k in ('file', 'sheet', 'row', 'date', 'employee_id', 'identity_status')} for r in records],
             'approved_required_minutes': None, 'confirmed_change_date': '', 'approval': 'pending',
             'unresolved': 'Attendance group is not a formal dated team. Confirm identities, membership and policy locally.'}
            for group, records in sorted(groups.items())]


def load_prior(path):
    with Path(path).open(encoding='utf-8') as file:
        data = json.load(file)
    summary = data.get('summary', {})
    if not summary.get('captured_at_utc') or not summary.get('month') or not isinstance(summary.get('sources'), dict):
        raise ValueError('prior_provenance_missing')
    dt.date.fromisoformat(summary['month'] + '-01')
    captured = dt.datetime.fromisoformat(summary['captured_at_utc'].replace('Z', '+00:00'))
    if captured.tzinfo is None:
        raise ValueError('prior_capture_timezone_missing')
    return {'provenance': 'historical', 'summary': summary, 'app': data.get('app') or {}, 'odoo': data.get('odoo') or {}}


def interval_issues(app):
    issues = []
    for table, start_key, end_key, targets in [
        ('staff_team_membership', 'valid_from', 'valid_to', ('staff_id',)),
        ('staff_schedule', 'effective_from', 'effective_to', ('staff_id',)),
        ('pattern_assignment', 'effective_from', 'effective_to', ('staff_id', 'team_id', 'department_id')),
        ('pattern_pay_rule', 'effective_from', 'effective_to', ('pattern_id',)),
        ('attendance_rule', 'effective_from', 'effective_to', ()),
    ]:
        grouped = defaultdict(list)
        for row in rows(app, table):
            start, end = row.get(start_key), row.get(end_key)
            # ISO timestamps include offsets, so compare normalized instants for memberships.
            def key(v):
                if table == 'staff_team_membership':
                    value = dt.datetime.fromisoformat(str(v).replace('Z', '+00:00'))
                    return value if value.tzinfo else value.replace(tzinfo=dt.timezone.utc)
                return dt.date.fromisoformat(str(v))
            if not start or (end and key(end) <= key(start)):
                issues.append(issue('invalid_interval', table=table, row_id=row.get('id')))
                continue
            grouped[tuple(row.get(t) for t in targets)].append((key(start), key(end) if end else None, row.get('id')))
        for group in grouped.values():
            ordered = sorted(group, key=lambda v: v[0])
            for index, (start, end, rid) in enumerate(ordered):
                for other_start, other_end, other_id in ordered[index + 1:]:
                    if end is None or other_start < end:
                        issues.append(issue('overlapping_intervals', table=table, row_ids=[rid, other_id]))
    return issues


def build_report(app, odoo, reception, first, through, prior=None):
    reception = copy.deepcopy(reception)
    identities = identity_review(app, odoo)
    crosswalk = {str(r['odoo_id']): r for r in identities if r['status'] == 'matched'}
    for row in reception['rows']:
        mapping = crosswalk.get(str(row.get('employee_id')))
        row['app_staff_id'] = mapping.get('staff_id') if mapping else None
        row['app_mapping_status'] = 'unique_candidate_pending_review' if mapping else 'unresolved'
        if not mapping and row['classification'] == 'candidate':
            row['classification'] = 'quarantined'
    covered = coverage(app, odoo, reception, identities, first, through)
    dependencies, proposals = dependency_inventory(app)
    issues = list(reception.get('issues', [])) + interval_issues(app)
    for source, capture in [('app', app), ('odoo', odoo)]:
        issues += [issue('historical_section', source=source, table=t) for t, section in capture.get('sections', {}).items()
                   if section.get('provenance') == 'historical']
        issues += [issue('unchecked_reference_column', source=source, **edge)
                   for edge in capture.get('unchecked_reference_columns', [])]
    for source, capture in [('app', app), ('odoo', odoo)]:
        issues += [issue('unavailable_section', source=source, table=table, reason=section.get('reason'))
                   for table, section in capture.get('sections', {}).items() if section['status'] != 'present']
    return {'schema_version': SCHEMA_VERSION, 'tool_revision': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'generated_at_utc': now(), 'requested_from': first.isoformat(), 'requested_through': through.isoformat(),
        'sources': {'app': app, 'odoo': odoo, 'reception': reception}, 'prior_evidence': prior,
        'coverage': covered, 'identity-review': identities,
        'team-roster-review': team_review(app, odoo, identities, first, through) + attendance_group_reviews(reception),
        'dependencies': dependencies, 'proposals': proposals, 'issues': issues,
        'recovery_review': {key: 'pending' for key in ('backup_coverage', 'protected_location', 'captured_at',
            'isolated_restore_target', 'count_comparison', 'reviewer', 'last_successful_restore')},
        'limitations': LIMITATIONS}


def public_summary(report):
    # Every label here is a closed code or date, never a source label or identifier.
    covered = defaultdict(Counter)
    for row in report['coverage']:
        key = (row['source'], row['kind'], row['date'])
        covered[key][row['status']] += 1
        covered[key]['raw_rows'] += row.get('raw_rows') or 0
    return {'coverage': [{'source': s, 'kind': k, 'date': d, 'counts': dict(counts)}
                         for (s, k, d), counts in sorted(covered.items(), key=lambda pair: str(pair[0]))],
            'identity_counts': dict(Counter(r['status'] for r in report['identity-review'])),
            'issue_counts': dict(Counter(r['code'] for r in report['issues'])),
            'dependency_counts': {'measured_edges': sum(r['status'] == 'measured' for r in report['dependencies']),
                'unavailable_edges': sum(r['status'] == 'unavailable' for r in report['dependencies']),
                'historical_edges': sum(r['status'] == 'historical' for r in report['dependencies']),
                'references': sum(r['count'] or 0 for r in report['dependencies'])},
            'reception_total_rows': len(report['sources']['reception']['rows']),
            'reception_classifications': dict(Counter(r['classification'] for r in report['sources']['reception']['rows']))}


def write_report(report, target):
    for name in ('coverage', 'identity-review', 'team-roster-review', 'dependencies', 'proposals', 'issues'):
        data = report[name]
        headers = list(dict.fromkeys(k for row in data for k in row)) or ['status']
        flattened = [{k: json.dumps(v, ensure_ascii=False, default=str) if isinstance(v, (dict, list)) else v
                      for k, v in row.items()} for row in data]
        inventory.write_private(target / (name + '.csv'), inventory.csv_text(flattened, headers))
    inventory.write_private(target / 'evidence.json', json.dumps(report, ensure_ascii=False, default=str, indent=2))
    summary = public_summary(report)
    inventory.write_private(target / 'summary.json', json.dumps({**summary,
        'schema_version': report['schema_version'], 'tool_revision': report['tool_revision'],
        'requested_from': report['requested_from'], 'requested_through': report['requested_through'],
        'capture_times': {s: c.get('captured_at_utc') for s, c in report['sources'].items()},
        'limitations': report['limitations']}, indent=2))
    links = ''.join(f'<li><a href="{name}.csv">{html.escape(name)}</a></li>' for name in
                    ('coverage', 'identity-review', 'team-roster-review', 'dependencies', 'proposals', 'issues'))
    review = ''.join('<h2>' + html.escape(str(row.get('team_name_en') or row.get('team_id') or 'Unresolved group')) +
                     '</h2><pre>' + html.escape(json.dumps(row, ensure_ascii=False, default=str, indent=2)) + '</pre>'
                     for row in report['team-roster-review'])
    page = ('<!doctype html><html lang="en"><meta charset="utf-8"><title>Private R0 inventory</title>'
            '<h1>Private R0 inventory — review pending</h1><ul>' + links + '</ul><h2>Recovery review</h2><pre>' +
            html.escape(json.dumps(report['recovery_review'], indent=2)) + '</pre><h2>Limitations</h2><pre>' +
            html.escape('\n'.join(report['limitations'])) + '</pre>' + review + '</html>')
    inventory.write_private(target / 'report.html', page)
    return summary


class SafeParser(argparse.ArgumentParser):
    def error(self, message):
        # argparse normally echoes rejected arguments (which may contain private paths).
        self.exit(2, 'Invalid inventory arguments; use --help.\n')


def main(argv=None):
    parser = SafeParser(description=__doc__)
    parser.add_argument('--from', dest='first', default='2026-10-01')
    parser.add_argument('--through', default='2026-11-17')
    parser.add_argument('--app-db', required=True)
    parser.add_argument('--odoo-db', required=True)
    parser.add_argument('--reception-root', required=True)
    parser.add_argument('--output-root', required=True)
    parser.add_argument('--prior-evidence')
    args = parser.parse_args(argv)
    try:
        os.umask(0o077)
        first, through = dt.date.fromisoformat(args.first), dt.date.fromisoformat(args.through)
        if first > through or (through - first).days > 366:
            raise ValueError('invalid_range')
        if not all(re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_-]{0,62}', s) for s in (args.app_db, args.odoo_db)):
            raise ValueError('invalid_database')
        root = protected_path(args.reception_root, exists=True)
        output = protected_path(args.output_root)
        if not root.is_dir() or output.is_relative_to(root) or root.is_relative_to(output):
            raise ValueError('overlapping_paths')
        prior_path = protected_path(args.prior_evidence, exists=True) if args.prior_evidence else None
        prior = load_prior(prior_path) if prior_path else None
        # Fail before database reads when workbook support is absent.
        workbook_helpers()
        app, odoo = collect(args.app_db, 'app', prior), collect(args.odoo_db, 'odoo', prior)
        with warnings.catch_warnings(record=True) as caught:
            reception = read_workbooks(root, first, through, rows(odoo, 'hr_employee'))
        if caught:
            reception['issues'].append(issue('workbook_warning', count=len(caught)))
        report = build_report(app, odoo, reception, first, through, prior)
        target = inventory.private_directory(output)
        summary = write_report(report, target)
        print(json.dumps(summary, sort_keys=True))
        return 0
    except Exception:
        print('Inventory failed; review local prerequisites. No database writes were performed.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
