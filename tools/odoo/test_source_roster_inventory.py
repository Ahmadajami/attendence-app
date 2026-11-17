"""R0 synthetic verification. Live execution is blocked for every test."""

import contextlib
from collections import Counter
import csv
import datetime as dt
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import source_roster_inventory as r0

D = dt.date.fromisoformat


def capture(spec=None, **tables):
    spec = spec or r0.APP
    return {'captured_at_utc': '2026-11-17T12:00:00+00:00', 'provenance': 'measured',
            'sections': {t: {'status': 'present', 'rows': tables.get(t, [])} for t in spec}}


def reception():
    return {'captured_at_utc': '2026-11-17T12:00:00+00:00', 'rows': [], 'issues': [], 'manifest': []}


class SyntheticOnly(unittest.TestCase):
    def setUp(self):
        self.block = patch.object(r0.inventory.subprocess, 'run', side_effect=AssertionError('Live execution forbidden'))
        self.block.start()
        self.addCleanup(self.block.stop)

    def report(self, app=None, odoo=None, recv=None, first='2026-10-20', through='2026-11-17'):
        return r0.build_report(app or capture(), odoo or capture(r0.ODOO), recv or reception(), D(first), D(through))


class CollectionTests(SyntheticOnly):
    def test_metadata_missing_columns_and_shared_data_snapshot(self):
        meta = [{'table_name': 'team', 'column_name': col} for col in r0.APP['team'].split()]
        with patch.object(r0.inventory, 'snapshot', side_effect=[{'columns': meta}, {'team': []}]) as run:
            result = r0.collect('synthetic', 'app')
        self.assertEqual(run.call_count, 2)
        self.assertTrue(r0.available(result, 'team'))
        self.assertFalse(r0.available(result, 'attendance_event'))
        query = run.call_args.args[-1]['team']
        self.assertIn('LIMIT 100001', query)
        self.assertNotIn('*', query)
        self.assertEqual(result['manifest'][0]['scope'], 'all_retained_history')

    def test_timeout_and_row_limit_never_become_zero(self):
        with patch.object(r0.inventory, 'snapshot', side_effect=RuntimeError('SECRET_SENTINEL')):
            result = r0.collect('synthetic', 'odoo')
        self.assertTrue(all(s['status'] == 'unavailable' for s in result['sections'].values()))
        self.assertNotIn('SECRET_SENTINEL', json.dumps(result))
        meta = [{'table_name': 'team', 'column_name': col} for col in r0.APP['team'].split()]
        with patch.object(r0, 'ROW_LIMIT', 1), patch.object(r0.inventory, 'snapshot',
                side_effect=[{'columns': meta}, {'team': [{'id': 1}, {'id': 2}]}]):
            self.assertEqual(r0.collect('synthetic', 'app')['sections']['team']['reason'], 'row_limit')

    def test_help_and_rejected_arguments_never_collect(self):
        with patch.object(r0, 'collect', side_effect=AssertionError), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(SystemExit) as exit:
                r0.main(['--help'])
        self.assertEqual(exit.exception.code, 0)
        err = io.StringIO()
        with contextlib.redirect_stderr(err), self.assertRaises(SystemExit):
            r0.main(['--PRIVATE_SENTINEL'])
        self.assertNotIn('PRIVATE_SENTINEL', err.getvalue())

    def test_invalid_dates_fail_before_path_or_database_access(self):
        args = ['--from', 'bad', '--app-db', 'x', '--odoo-db', 'y',
                '--reception-root', '/PRIVATE_SENTINEL', '--output-root', '/PRIVATE_SENTINEL']
        err = io.StringIO()
        with patch.object(r0, 'collect', side_effect=AssertionError), contextlib.redirect_stderr(err):
            self.assertEqual(r0.main(args), 1)
        self.assertNotIn('PRIVATE_SENTINEL', err.getvalue())


class IdentityTests(SyntheticOnly):
    def test_identity_safeguards_and_source_only(self):
        app = capture(staff=[{'id': 'a', 'employee_no': 'new', 'legacy_badge_no': '001', 'odoo_id': 8},
                             {'id': 'b', 'employee_no': '002', 'active': False},
                             {'id': 'c', 'full_name': 'Same name'}])
        odoo = capture(r0.ODOO, hr_employee=[{'id': 1, 'barcode': '001'}, {'id': 2, 'barcode': '002'},
                                           {'id': 3, 'name': 'Same name'}])
        review = r0.identity_review(app, odoo)
        self.assertEqual([r['status'] for r in review], ['odoo_id_conflict', 'matched', 'missing_key', 'source_only'])
        self.assertFalse(review[1]['active'])
        self.assertTrue(all(r['approval'] == 'pending' for r in review))


class CoverageTests(SyntheticOnly):
    def test_planned_roster_does_not_create_punches(self):
        odoo = capture(r0.ODOO, roster_shift=[{'id': 1, 'date_from': '2026-10-01', 'date_to': '2026-10-31'}])
        report = self.report(odoo=odoo, first='2026-10-21', through='2026-10-24')
        planned = [r for r in report['coverage'] if r['kind'] == 'roster_shift']
        actual = [r for r in report['coverage'] if r['kind'] == 'hr_attendance']
        self.assertTrue(any(r['raw_rows'] for r in planned))
        self.assertTrue(all(r['status'] == 'confirmed_absent' for r in actual))

    def test_per_date_gaps_and_results_are_not_raw_punches(self):
        app = capture(day_result=[{'id': 'd', 'staff_id': 'a', 'shift_date': '2026-10-21', 'credit_minutes': 20}],
                      attendance_event=[{'id': 'e', 'staff_id': 'a', 'shift_date': '2026-10-20'},
                                        {'id': 'f', 'staff_id': 'a', 'shift_date': '2026-10-22'}])
        report = self.report(app=app, through='2026-10-22')
        gap = [r for r in report['coverage'] if r['kind'] == 'attendance_event' and r['date'] == '2026-10-21']
        self.assertTrue(all(r['raw_rows'] == 0 for r in gap))
        self.assertTrue(all(r['status'] == 'unverified' for r in gap))
        self.assertTrue(any(r['kind'] == 'day_result' and r['raw_rows'] == 1 for r in report['coverage']))

    def test_unavailable_not_zero_and_undated_current_snapshot(self):
        app = capture(team=[{'id': 'team'}])
        app['sections']['absence'] = {'status': 'unavailable', 'rows': []}
        report = self.report(app=app, through='2026-10-20')
        self.assertEqual(next(r['status'] for r in report['coverage'] if r['kind'] == 'absence'), 'unavailable')
        team = next(r for r in report['coverage'] if r['kind'] == 'team')
        self.assertEqual(team['date'], None)
        self.assertEqual(team['provenance'], 'current_snapshot_not_history')

    def test_membership_exclusive_end_and_no_current_pointer_fallback(self):
        app = capture(staff_team_membership=[{'id': 'm', 'staff_id': 'a', 'team_id': 'old',
                          'valid_from': '2026-09-01T21:00:00Z', 'valid_to': '2026-10-24T21:00:00Z'}],
                      staff=[{'id': 'a', 'team_id': 'new'}])
        self.assertEqual(r0.team_on(app, 'a', D('2026-10-24')), ('dated', 'old'))
        self.assertEqual(r0.team_on(app, 'a', D('2026-10-25')), ('unassigned', None))

    def test_ambiguous_membership_and_midnight_in_damascus(self):
        m = {'staff_id': 'a', 'team_id': 'old', 'valid_from': '2026-09-01T21:00:00Z', 'valid_to': None}
        self.assertEqual(r0.team_on(capture(staff_team_membership=[m, m]), 'a', D('2026-10-25')), ('ambiguous', None))
        self.assertEqual(r0.date_value('2026-10-24T22:00:00Z'), D('2026-10-25'))

    def test_coverage_exclusive_versions_and_inclusive_absences(self):
        self.assertEqual(r0.row_days('pattern_assignment', {'effective_from': '2026-09-01',
            'effective_to': '2026-11-01'}, D('2026-10-31'), D('2026-11-01'), 'app'), [D('2026-10-31')])
        self.assertEqual(r0.row_days('absence', {'starts_on': '2026-10-31', 'ends_on': '2026-11-01'},
            D('2026-10-31'), D('2026-11-01'), 'app'), [D('2026-10-31'), D('2026-11-01')])

    def test_overnight_cutoff_keeps_start_day_and_raw_exit(self):
        att = {'id': 1, 'employee_id': 1, 'check_in': '2026-11-17T17:00:00', 'check_out': '2026-11-18T05:00:00'}
        odoo = capture(r0.ODOO, hr_attendance=[att])
        report = self.report(odoo=odoo, first='2026-11-17', through='2026-11-17')
        row = next(r for r in report['coverage'] if r['kind'] == 'hr_attendance' and r['raw_rows'])
        self.assertEqual(row['date'], '2026-11-17')
        self.assertEqual(row['cutoff_status'], 'provisional')
        self.assertEqual(report['sources']['odoo']['sections']['hr_attendance']['rows'][0]['check_out'], att['check_out'])


class TeamAndDependenciesTests(SyntheticOnly):
    def test_team_review_preserves_original_night_dates_and_policy_unknown(self):
        app = capture(staff=[{'id': 'a', 'employee_no': '01'}],
            team=[{'id': 'g', 'name_en': 'Synthetic Guards'}],
            staff_team_membership=[{'id': 'm', 'staff_id': 'a', 'team_id': 'g', 'valid_from': '2026-09-01T21:00:00Z', 'valid_to': None}],
            pattern=[{'id': 'p', 'type': 'cycle', 'slots': ['n', None], 'default_work_shift_id': None}],
            pattern_assignment=[{'id': 'as', 'team_id': 'g', 'pattern_id': 'p', 'anchor_date': '2026-09-02',
                                 'effective_from': '2026-09-02', 'effective_to': None}],
            shift=[{'id': 'n', 'start_time': '20:00', 'end_time': '08:00', 'required_minutes': 540}])
        review = self.report(app=app)['team-roster-review']
        self.assertEqual(len(review), 2)
        self.assertEqual(review[0]['assignment_candidates'][0]['effective_from'], '2026-09-02')
        self.assertEqual(review[1]['interval_from'], '2026-10-25')
        self.assertIsNone(review[1]['approved_required_minutes'])
        self.assertEqual(review[1]['shift_evidence'][0]['required_minutes'], 540)

    def test_personal_department_evidence_and_own_exceptions_retained(self):
        app = capture(staff=[{'id': 'a', 'department_id': 'd'}], pattern_assignment=[
            {'id': 'personal', 'staff_id': 'a', 'effective_from': '2026-09-01', 'effective_to': None},
            {'id': 'department', 'department_id': 'd', 'effective_from': '2026-09-01', 'effective_to': None}],
            staff_schedule=[{'id': 's', 'staff_id': 'a', 'off_weekdays': [1], 'crew_start': 2,
                             'effective_from': '2026-09-01', 'effective_to': None}],
            roster_override=[{'id': 'o', 'staff_id': 'a', 'shift_date': '2026-10-24'}])
        review = self.report(app=app, first='2026-10-24', through='2026-10-24')['team-roster-review'][0]
        self.assertEqual({a['id'] for a in review['assignment_candidates']}, {'personal', 'department'})
        self.assertEqual(review['exceptions'][0]['id'], 'o')
        self.assertEqual(review['own_schedule'][0]['crew_start'], 2)

    def test_default_shift_slots_and_history_without_current_members(self):
        app = capture(shift=[{'id': 's'}], team=[{'id': 't'}], pattern=[
            {'id': 'p', 'slots': ['s', 's', None], 'default_work_shift_id': 's'}],
            staff_team_membership=[{'id': 'm', 'staff_id': 'a', 'team_id': 't',
                                    'valid_from': '2025-01-01T00:00:00Z', 'valid_to': '2025-02-01T00:00:00Z'}],
            pattern_assignment=[{'id': 'future', 'pattern_id': 'p', 'team_id': 't', 'effective_from': '2027-01-01'}],
            day_result=[{'id': 'd', 'shift_id': 's', 'staff_id': 'a', 'team_id': 't', 'shift_date': '2026-10-20'}])
        deps, proposals = r0.dependency_inventory(app)
        count = lambda kind, edge: next(r['count'] for r in deps if r['entity_kind'] == kind and r['edge'] == edge)
        self.assertEqual(count('shift', 'slots_distinct_patterns'), 1)
        self.assertEqual(count('shift', 'slot_occurrences'), 2)
        self.assertTrue(any(r['table'] == 'pattern' and r['edge'] == 'default_work_shift_id' and r['count'] == 1 for r in deps))
        self.assertTrue(any(r['table'] == 'staff_team_membership' and r['count'] == 1 for r in deps))
        self.assertTrue(all(p['archive_eligibility'] == 'blocked_pending_review' for p in proposals))

    def test_json_candidates_and_unknown_dependencies_block_unused(self):
        app = capture(shift=[{'id': 's'}], import_row=[{'id': 'r', 'parsed': {'shiftId': 's'}}])
        app['sections']['pattern'] = {'status': 'unavailable', 'rows': []}
        deps, proposals = r0.dependency_inventory(app)
        self.assertIsNone(next(r['count'] for r in deps if r['table'] == 'pattern'))
        self.assertTrue(any(r['reference_type'] == 'candidate' and r['count'] == 1 for r in deps))
        self.assertEqual(proposals[0]['dependency_status'], 'incomplete')


class WorkbookTests(SyntheticOnly):
    def setUp(self):
        super().setUp()
        try:
            import openpyxl
        except ImportError:
            self.skipTest('openpyxl unavailable: workbook checks unrun')
        self.xlsx = openpyxl
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def workbook(self, name, rows, second_sheet=False, bad_header=False):
        path = self.root / name
        book = self.xlsx.Workbook()
        headers = ['ID', '', '', 'Date', 'in_1', 'out_1', 'in_2', 'out_2', '', '', 'Department']
        for sheet in ([book.active, book.create_sheet('Second')] if second_sheet else [book.active]):
            sheet.append([])
            sheet.append([])
            sheet.append([])
            sheet.append(['unsupported'] if bad_header else headers)
            for row in rows:
                sheet.append(row)
        book.save(path)
        book.close()
        return path

    def row(self, badge='0123-456', date=None, times=('20:00', '08:00', None, None)):
        return [badge, 'PRIVATE_SENTINEL', None, date or dt.datetime(2026, 10, 25), *times, None, None, 'PRIVATE_GROUP']

    def read(self, people=None):
        return r0.read_workbooks(self.root, D('2026-10-21'), D('2026-11-17'),
                                 people or [{'id': 1, 'barcode': '0123456'}])

    def test_all_sheets_and_content_dates_not_filename(self):
        self.workbook('daily_2020-01-01.xlsx', [self.row()], second_sheet=True)
        data = self.read()
        self.assertEqual(len(data['rows']), 2)
        self.assertTrue(all(r['date'] == '2026-10-25' for r in data['rows']))
        self.assertTrue(all(r['observed_minutes'] == 720 for r in data['rows']))
        self.assertTrue(all(r['conflict'] == 'repeated_person_date' for r in data['rows']))

    def test_normalized_collision_and_blank_id_never_name_match(self):
        self.workbook('daily.xlsx', [self.row(), self.row(badge=None)])
        data = self.read([{'id': 1, 'barcode': '0123456'}, {'id': 2, 'barcode': '0123-456', 'name': 'PRIVATE_SENTINEL'}])
        self.assertEqual(data['rows'][0]['identity_status'], 'ambiguous_badge')
        self.assertEqual(data['rows'][1]['identity_status'], 'unmatched')
        self.assertTrue(all(r['classification'] == 'quarantined' for r in data['rows']))

    def test_duplicate_files_and_corrections_remain_separate(self):
        path = self.workbook('daily.xlsx', [self.row()])
        (self.root / 'duplicate.xlsx').write_bytes(path.read_bytes())
        self.workbook('correction.xlsx', [self.row(times=('20:00', '09:00', None, None))])
        data = self.read()
        self.assertEqual(sum(r['classification'] == 'duplicate' for r in data['rows']), 1)
        self.assertEqual({r['source_kind'] for r in data['rows']}, {'daily', 'correction'})
        self.assertTrue(any(r.get('correction_status') == 'unresolved' for r in data['rows']))
        self.assertTrue(any(i['code'] == 'conflicting_person_date' for i in data['issues']))

    def test_incomplete_overlap_blank_formula_and_invalid_dates(self):
        self.workbook('daily.xlsx', [self.row(times=('08:00', None, None, None)),
            self.row(times=('08:00', '14:00', '13:00', '17:00')),
            self.row(times=(None, None, None, None)),
            self.row(times=('=1+1', '17:00', None, None)), self.row(date='not a date')])
        data = self.read()
        self.assertIsNone(data['rows'][0]['observed_minutes'])
        self.assertTrue(data['rows'][1]['overlap'])
        self.assertIsNone(data['rows'][2]['observed_minutes'])
        self.assertTrue(data['rows'][3]['missing_formula_cache'])
        self.assertEqual(data['rows'][4]['classification'], 'invalid')

    def test_unknown_headers_and_unsafe_entries_visible(self):
        self.workbook('bad.xlsx', [], bad_header=True)
        (self.root / 'outside.xlsx').symlink_to(self.root.parent / 'not-read.xlsx')
        (self.root / 'unsupported.csv').write_text('not read')
        data = self.read()
        self.assertEqual({i['code'] for i in data['issues']}, {'unsafe_entry', 'unsupported_entry', 'unsupported_headers'})
        self.assertEqual(data['rows'], [])


class PrivacyTests(SyntheticOnly):
    def test_private_root_symlinks_and_escape(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(Path, 'home', return_value=Path(temp)):
            root = Path(temp) / 'secure/syravia'
            root.mkdir(parents=True)
            self.assertEqual(r0.protected_path(root / 'new'), root / 'new')
            (root / 'link').symlink_to(root, target_is_directory=True)
            for bad in (root / 'link/report', root / '../escape', Path(temp) / 'elsewhere'):
                with self.assertRaises(ValueError):
                    r0.protected_path(bad)

    def test_write_modes_exclusive_csv_html_and_console_whitelist(self):
        report = self.report(app=capture(team=[{'id': 'PRIVATE_ID', 'name_en': '<script>PRIVATE_SENTINEL</script>'}]))
        report['team-roster-review'][0]['team_name_ar'] = '=PRIVATE_FORMULA'
        out = io.StringIO()
        with tempfile.TemporaryDirectory() as temp, patch.object(Path, 'home', return_value=Path(temp)):
            target = r0.inventory.private_directory(Path(temp) / 'secure/syravia/inventory')
            with contextlib.redirect_stdout(out):
                summary = r0.write_report(report, target)
            self.assertEqual(out.getvalue(), '')
            self.assertNotIn('PRIVATE', json.dumps(summary))
            self.assertEqual(target.stat().st_mode & 0o777, 0o700)
            self.assertTrue(all(p.stat().st_mode & 0o777 == 0o600 for p in target.iterdir()))
            page = (target / 'report.html').read_text()
            self.assertNotIn('<script>', page)
            self.assertIn('&lt;script&gt;', page)
            data = list(csv.DictReader(io.StringIO((target / 'team-roster-review.csv').read_text().lstrip('\ufeff'))))
            self.assertEqual(data[0]['team_name_ar'], "'=PRIVATE_FORMULA")
            with self.assertRaises(FileExistsError):
                r0.write_report(report, target)
            self.assertTrue(all(v == 'pending' for v in report['recovery_review'].values()))

    def test_prior_requires_provenance_and_stays_historical(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp) / 'prior.json'
            p.write_text('{}')
            with self.assertRaises(ValueError):
                r0.load_prior(p)
            p.write_text(json.dumps({'summary': {'month': '2026-10', 'sources': {'app_database': 'synthetic'},
                                                 'captured_at_utc': '2026-10-31T12:00:00Z'}}))
            self.assertEqual(r0.load_prior(p)['provenance'], 'historical')

    def test_main_never_echoes_collection_failure(self):
        with patch.object(r0, 'protected_path', side_effect=RuntimeError('/PRIVATE_SENTINEL')):
            error = io.StringIO()
            with contextlib.redirect_stderr(error):
                result = r0.main(['--app-db', 'app', '--odoo-db', 'odoo', '--reception-root', 'x', '--output-root', 'y'])
            self.assertEqual(result, 1)
            self.assertNotIn('PRIVATE_SENTINEL', error.getvalue())




class AdditionalContractTests(SyntheticOnly):
    def test_historical_sections_reused_without_query_or_current_claim(self):
        staff = {k: None for k in r0.APP['staff'].split()}
        staff.update(id='a', employee_no='01')
        prior = {'summary': {'captured_at_utc': '2026-10-31T12:00:00Z', 'month': '2026-10',
                              'sources': {'app_database': 'synthetic'}}, 'app': {'staff': [staff]}}
        with patch.object(r0.inventory, 'snapshot', return_value={'columns': []}) as run:
            app = r0.collect('synthetic', 'app', prior)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(app['sections']['staff']['provenance'], 'historical')
        report = self.report(app=app)
        row = next(r for r in report['coverage'] if r['kind'] == 'staff')
        self.assertEqual(row['provenance'], 'historical')
        self.assertTrue(any(i['code'] == 'historical_section' for i in report['issues']))

    def test_prior_database_mismatch_does_not_reuse(self):
        prior = {'summary': {'sources': {'app_database': 'other'}}, 'app': {'team': [{'id': 'private'}]}}
        with patch.object(r0.inventory, 'snapshot', return_value={'columns': []}):
            app = r0.collect('synthetic', 'app', prior)
        self.assertFalse(r0.available(app, 'team'))

    def test_additional_schema_reference_is_reported_not_queried(self):
        with patch.object(r0.inventory, 'snapshot', return_value={'columns': [
                {'table_name': 'unknown_table', 'column_name': 'shift_id'}]}) as run:
            app = r0.collect('synthetic', 'app')
        self.assertEqual(run.call_count, 1)
        self.assertEqual(app['unchecked_reference_columns'], [{'table': 'unknown_table', 'column': 'shift_id'}])
        self.assertTrue(any(i['code'] == 'unchecked_reference_column' for i in self.report(app=app)['issues']))

    def test_midday_membership_end_includes_its_midnight(self):
        row = {'valid_from': '2026-10-20T12:00:00Z', 'valid_to': '2026-10-22T12:00:00Z'}
        self.assertEqual(r0.row_days('staff_team_membership', row, D('2026-10-20'), D('2026-10-23'), 'app'),
                         [D('2026-10-21'), D('2026-10-22')])

    def test_interval_overlap_invalid_and_adjacent_ranges(self):
        app = capture(pattern_assignment=[
            {'id': 'one', 'team_id': 'a', 'effective_from': '2026-10-01', 'effective_to': '2026-10-25'},
            {'id': 'two', 'team_id': 'a', 'effective_from': '2026-10-25', 'effective_to': None},
            {'id': 'three', 'team_id': 'b', 'effective_from': '2026-10-01', 'effective_to': None},
            {'id': 'four', 'team_id': 'b', 'effective_from': '2026-10-25', 'effective_to': None},
            {'id': 'five', 'team_id': 'c', 'effective_from': '2026-10-25', 'effective_to': '2026-10-24'}])
        problems = r0.interval_issues(app)
        self.assertEqual(Counter(i['code'] for i in problems),
                         {'invalid_interval': 1, 'overlapping_intervals': 1})
        self.assertEqual(next(i['row_ids'] for i in problems if 'row_ids' in i), ['three', 'four'])

    def test_event_views_partition_originals_corrections_and_voids(self):
        base = {'staff_id': 'a', 'shift_date': '2026-10-24'}
        app = capture(attendance_event=[{'id': 'o', **base},
            {'id': 'c', **base, 'corrects_event_id': 'o'},
            {'id': 'v', **base, 'corrects_event_id': 'c', 'is_void': True}],
            day_result=[{'id': 'd', **base, 'credit_minutes': 30}])
        views = r0.record_kind_views(app, capture(r0.ODOO), D('2026-10-24'), D('2026-10-24'))
        counts = {r['kind']: r['raw_rows'] for r in views}
        self.assertEqual([counts[k] for k in ('original_punches', 'correction_versions', 'void_corrections')], [1, 1, 1])
        credit = next(r for r in views if r['kind'] == 'calculated_credit')
        self.assertEqual(credit['raw_rows'], 1)
        self.assertIn('not_raw', credit['evidence_role'])

    def test_app_mapping_conflict_quarantines_workbook_candidate_without_mutation(self):
        recv = reception()
        recv['rows'] = [{'employee_id': 1, 'date': '2026-10-24', 'source_kind': 'daily',
                         'classification': 'candidate', 'attendance_group': 'PRIVATE_GROUP'}]
        app = capture(staff=[{'id': 'a', 'employee_no': '01'}, {'id': 'b', 'employee_no': '01'}])
        odoo = capture(r0.ODOO, hr_employee=[{'id': 1, 'barcode': '01'}])
        report = self.report(app=app, odoo=odoo, recv=recv)
        row = report['sources']['reception']['rows'][0]
        self.assertEqual(row['classification'], 'quarantined')
        self.assertEqual(row['app_mapping_status'], 'unresolved')
        self.assertEqual(recv['rows'][0]['classification'], 'candidate')
        group = next(r for r in report['team-roster-review'] if r.get('attendance_group'))
        self.assertIsNone(group['formal_team_id'])
        self.assertNotIn('PRIVATE_GROUP', json.dumps(r0.public_summary(report)))

    def test_dated_swap_rows_and_department_filter(self):
        app = capture(staff=[{'id': 'a', 'department_id': 'child'}],
            department=[{'id': 'child', 'parent_id': 'parent'}, {'id': 'parent', 'parent_id': None}],
            pattern_assignment=[{'id': 'parent', 'department_id': 'parent', 'effective_from': '2026-10-01', 'effective_to': None},
                                {'id': 'unrelated', 'department_id': 'other', 'effective_from': '2026-10-01', 'effective_to': None}],
            swap_request=[{'id': 'swap', 'staff_id': 'a', 'first_date': '2026-10-24', 'second_date': '2026-10-25'}])
        report = self.report(app=app, first='2026-10-24', through='2026-10-25')
        review = report['team-roster-review'][0]
        self.assertEqual([r['id'] for r in review['assignment_candidates']], ['parent'])
        self.assertEqual(review['department_history_status'], 'unverified')
        self.assertEqual(review['swap_evidence'][0]['id'], 'swap')
        self.assertEqual(sum(r['raw_rows'] or 0 for r in report['coverage'] if r['kind'] == 'swap_request'), 2)

    def test_synthetic_main_writes_private_reports_and_only_aggregate_stdout(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(Path, 'home', return_value=Path(temp)):
            secure = Path(temp) / 'secure/syravia'
            sources = secure / 'inputs'
            sources.mkdir(parents=True)
            out, err = io.StringIO(), io.StringIO()
            with patch.object(r0, 'collect', side_effect=[capture(), capture(r0.ODOO)]) as collect, \
                    patch.object(r0, 'workbook_helpers'), patch.object(r0, 'read_workbooks', return_value=reception()), \
                    contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                result = r0.main(['--app-db', 'app', '--odoo-db', 'odoo', '--reception-root', str(sources),
                                  '--output-root', str(secure / 'reports')])
            self.assertEqual(result, 0)
            self.assertEqual(collect.call_count, 2)
            self.assertEqual(err.getvalue(), '')
            self.assertNotIn(temp, out.getvalue())
            self.assertEqual(len(list((secure / 'reports').glob('*/report.html'))), 1)
            summary = json.loads(out.getvalue())
            self.assertEqual(summary['reception_total_rows'], 0)


if __name__ == '__main__':
    unittest.main()
