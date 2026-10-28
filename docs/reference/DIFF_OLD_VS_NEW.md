# Old vs new: `roster_attendance` → `hr_attendance_builder`

Phase 0 deliverable (brief §7.2). Paths are relative to
`custom_addons/roster_attendance/` unless stated. Data figures come from
`DATA_PROFILE.md` (counts only). **"Drop" needs HR approval**; nothing is
dropped until then.

## 1. Feature parity checklist

Decision key: **Rebuild** = new design (brief §9–§10); **Port** = keep the code
and its tests, re-point to `attendance.builder.day`; **Replace** = a new
feature takes its place; **Drop** = not carried over (approval needed).

| # | Old feature | Where | Decision | Note |
|---|---|---|---|---|
| 1 | Shift patterns (start/end, grace, night box, N-on/M-off) | `roster_shift.py:13` | **Rebuild** → `shift` + `pattern` | Night box removed (P17) |
| 2 | Department rosters (states, lifecycle, 2 off days per employee) | `roster_shift.py:84,571` | **Rebuild** → `assignment` + `offday.override` | |
| 3 | Roster Builder (OWL) + Excel roster template import/export | `roster_builder.py`, `wizard/roster_template_wizard.py` | **Replace** → Svelte Pattern Builder | Template import: ask HR if still used (Q14) |
| 4 | Re-approve regenerates the whole period | `wizard/reapprove_confirm_wizard.py` | **Replace** → "Change pattern from date" | Brief §9.4 |
| 5 | Rebuild Days (one employee, from today) | `roster_shift.py` employee line | **Replace** → same action | |
| 6 | Duplicate as Next Period | `roster_shift.py` | **Replace** → assignments have open end dates | |
| 7 | Roster lifecycle cron (upcoming/active/expiring/expired) | `roster_shift.py:467` | **Replace** → assignment `draft/active/ended` | |
| 8 | Shift cycles (D/N/O per employee) + generate wizards | `roster_cycle.py` | **Rebuild** → cycle pattern + employee assignment | 6 cycles, 986 lines in use |
| 9 | Rotation groups + generate/exchange/change-period wizards + weekly cron | `roster_rotation.py`, `rotation_math.py` | **Rebuild** → `rotation` on a team | **0 groups in real data** (Q13) |
| 10 | Fixed schedule from Working Schedule + weekly cron | `fixed_schedule.py` | **Rebuild** → calendar fallback (§9.4 step 7) | 27 employees use it |
| 11 | Day row `roster.line` and its compute chain | `roster_line.py` | **Rebuild** → `attendance.builder.day` + pure engine | Unique (employee, date) |
| 12 | Day buttons: excuse, leave, sick, mission, set off, void, unpaid off, reset, set required, cancel/restore OT, time correction, delete attendance | `views/roster_line_views.xml:16-87` | **Rebuild** (Control Panel actions) | Same semantics (R7–R10) |
| 13 | Partial Leave button / `partial_leave_minutes` | `roster_line.py:2085` | **Drop** | Deprecated, 0 rows use it (P16) |
| 14 | Bulk Day-Action wizard | `wizard/bulk_day_action_wizard.py` | **Port** | |
| 15 | Bulk server actions (mark leave/sick/mission/excused, review approve/reject, reset) | `wizard/attendance_review_wizard_views.xml:171-219` | **Port** | |
| 16 | Review Board | `wizard/attendance_review_wizard.py` | **Port** | Review fields: test_employee_review |
| 17 | Control Panel (OWL) | `attendance_control_panel.py` | **Rebuild** in Svelte | Same `period_summary` figures |
| 18 | Attendance Overview (OWL) | `attendance_overview.py` | **Rebuild** in Svelte | |
| 19 | Attendance Dashboard (OWL) + JSON route | `attendance_dashboard.py`, `controllers/dashboard_controller.py` | **Rebuild** in Svelte (Overview) | Ask if both are needed (Q15) |
| 20 | Operations hub (OWL launcher) | `static/src/components/operations_dashboard` | **Replace** → app home in Svelte | |
| 21 | Attendance Patterns (HR managers only) | `attendance_pattern.py` | **Rebuild** in Svelte, same access (R18) | Health data |
| 22 | Attendance Analysis (pivot/graph) | `views/attendance_dashboard_views.xml:65` | **Port** (standard view on the new day model) | |
| 23 | Swap request (employee↔employee) | `roster_swap_request.py` | **Rebuild** → `change` `emp_swap` | + server-side approval check (§5) |
| 24 | Self off-day request | `self_offday_request.py` | **Rebuild** → `change` `self_offday` + week/month scope | + server-side approval check (§5) |
| 25 | Quick Swap / Quick Self Swap wizards | `roster_shift.py:876`, `wizard/self_swap_wizard.py` | **Rebuild** (roster grid drag & drop) | |
| 26 | Holidays + assignments + bulk assign wizard | `public_holiday.py`, `holiday_assignment.py`, `wizard/holiday_assign_wizard.py` | **Rebuild** (same concept) | 586 assignments |
| 27 | Holiday sync from Odoo calendar | `hr_leave_extend.py:109-137` | **Rebuild**, fixed (P1) | Q4 |
| 28 | Leave sync (`hr.leave` → day state) | `hr_leave_extend.py:37` | **Rebuild** with a mapping on `hr.leave.type` | Only 1 `hr.leave` in data (Q2) |
| 29 | Overtime configuration (singleton) + "Apply to all lines" | `overtime_config.py` | **Rebuild** → company + department `rule` | |
| 30 | BioTime sync, staging, held punches, identity diff/ack, terminals, period approve, backfill, settings | `biotime_*.py`, `raw_attendance_log.py`, wizards | **Port**, with pairing **rebuilt** on shift windows (P18, §3) | Staging empty in data |
| 31 | CSV/XLSX import + code aliases + new-hire flow | `wizard/import_attendance_wizard.py`, `import_alias.py` | **Port** | Reject future dates (P15) |
| 32 | Reception entry template + export order | `attendance_entry_template.py`, `export_layout.py` | **Port** | |
| 33 | Training catalogue + records + day credit | `training_course.py`, `training_record.py` | **Port** | 38 courses, 1 record |
| 34 | Attendance emails (daily/weekly/monthly), templates, send wizard, log | `email_template.py`, `attendance_email_log.py`, `wizard/attendance_email_wizard.py` | **Port**; sender from company (P11) | |
| 35 | Daily email + missing-punch alert crons | `data/cron.xml:15,26` | **Port** (cron `noupdate`, inactive by default) | |
| 36 | Recompute-today cron | `data/cron.xml:4` | **Replace** → recompute queue cron (§10.5) | |
| 37 | Payroll Period Report (26 columns) + preview | `payroll_report.py:36` | **Port**, column for column | §4 |
| 38 | Period Balance Report (11 columns) + preview + emails | `period_balance_report.py:124` | **Port**, column for column | §4 |
| 39 | Department Report | `payroll_report.py:803` | **Port** | |
| 40 | Export Report / Export to Excel (generic) | `wizard/export_wizard.py` | **Port** | Two menus, one action |
| 41 | Custom Period Report (sub-roster) | `wizard/hr_summary_wizard.py:37` | **Port** or **Drop** | Rosters disappear; ask (Q15) |
| 42 | HR Monthly Summary + generate wizard | `hr_summary.py`, `wizard/hr_summary_wizard.py:6` | **Port** | 39 records |
| 43 | Employee fields (§3.2 of the brief) | `fixed_schedule.py:27` etc. | **Port** (+ `ot_eligible`, `primary_team_id`) | |
| 44 | Department `late_grace_minutes`, `biotime_commute_credit`; calendar grace | `fixed_schedule.py:218-251` | **Port** into the department rule | |
| 45 | `hr.attendance` synchronous recompute on every write | `hr_attendance_extend.py:123-152` | **Replace** → mark + batch queue (P10) | |
| 46 | `cron_sync_leaves`, `cron_flag_repeated_delay` (methods with no cron) | `roster_line.py:2533,2538` | **Drop** (dead code) | |
| 47 | Orphan tables from older versions | `roster_net_balance_*`, `roster_shift_cycle_wizard`, `roster_assign_holiday_wizard` | **Drop** (not migrated) | 1 row in total |

## 2. Old vs new, by area (brief §6, completed)

| Area | Old (`roster_attendance`) | New (`hr_attendance_builder`) |
|---|---|---|
| Shift definition | Pattern = name, start/end hour, grace, manual night box, optional N-on/M-off cycle | **Shift** = code, colour, start → end; "ends next day" automatic; break, windows, night settings |
| Weekly / rotating schedule | 4 engines (roster with 2 off days, D/N/O cycle, rotation groups, fixed calendar) | **Pattern** (weekly 7 slots / cycle 1–28) + **Rotation** |
| Who follows what | Roster per department with an employee line; cycle per employee; rotation members; fixed flag | **Assignment** to employee / team / department + off-day override |
| Approval of schedules | Roster draft → submitted → approved; re-approval rebuilds the whole period | Assignment draft → active; changes regenerate future days only; manual edits kept |
| Teams & supervisors | None (department manager, HR groups) | Teams with a supervisor |
| OT rules | One company config 1.25 / 1.5 (holiday 2.0 and night 1.5 unused) + brackets | Company defaults + department overrides, OT on/off per department and employee |
| Night shifts | Night box; noon→noon window; allowance flag only | Night rule (window, premium, night OT rate, rest, attribution, holiday split) |
| Swaps | Swap request, self off-day change, quick swap | Same three + week/month scope, "pay as OT", supervisor approval, activities |
| Daily record | `roster.line`, duplicates possible (11 pairs, none approved) | `attendance.builder.day`, unique (employee, date), stored explanation |
| Punch matching | Calendar day, or noon→noon if night box (`roster_line.py:785-829`) | Planned shift window (§10.2) |
| BioTime pairing | Calendar day (`raw_attendance_log.py:514,574,639`) | Planned shift window (P18) |
| Recompute | Synchronous on every punch write | Queue + batch cron + "Recompute now" |
| Period netting | One engine (`compute_period_totals`) + report-specific views of it (§4) | One engine with explicit report modes |
| Reports & emails | xlsxwriter, fixed formats; sender default `hr@syravia.com` | Same formats; sender and company from the company record |
| Leave sync | Hard-coded code map (UL → paid leave) | Mapping field on `hr.leave.type` |
| Holiday sync from calendar | Broken (P1) | Fixed, or switched off by HR choice (Q4) |
| Security | Odoo HR groups; rules by department manager or **creator**; no rules for plain users; approvals unchecked on the server | Own groups (Supervisor, HR Officer, HR Approver, HR Manager); rules by team/department; server-side checks |
| UI | 6 OWL screens + ~60 list/form views | Svelte app + standard config views |

## 3. Known problems P1–P18: confirmations

| # | Confirmed? | Evidence (code) | Evidence (data) |
|---|---|---|---|
| P1 | ✅ | `hr_leave_extend.py:130-137` searches and creates `roster.public.holiday` with `date`; the model only has `date_from/date_to` (`public_holiday.py:37-40`). Any company-wide calendar leave create/write calls it | 4 holiday windows exist, all created by hand |
| P2 | ✅ code / ❌ data | `roster_shift.py:55-64`: `end < start` without the night box → `end − start` < 0 → clamped to 0 | 4 overnight patterns, **all** with the box ticked; 0 victim rows |
| P3 | ✅ code / ❌ data | `roster_line.py:815-825` uses the calendar day unless night | 0 shifts start at 00:00–04:00 |
| P4 | ✅ | `roster_line.py:1239` reads the holiday factor and never uses it; `overtime_config.py:80-89` | Config holds 2.00 / 1.50, unused |
| P5 | ✅ | `overtime_config.py:60`, one record | 1 record |
| P6 | ✅ | `hr_leave_extend.py:19` `'UL': 'leave'` | 1 `hr.leave` in total, so no impact today |
| P7 | ✅ | No unique constraint on `roster.line` | 11 duplicate pairs, all draft + rejected, **0 approved** |
| P8 | ✅ | `line_source` (`roster_line.py:28`), `_schedule_window` (`:965`) | roster 30,205 · fixed 5,608 · cycle 986 · rotation 0 |
| P9 | ✅ | `roster_shift.py:587-592` (`day_off_1/2`), template rejects > 2 (`wizard/roster_template_wizard.py:458`) | All 1,337 employee lines have exactly 2 |
| P10 | ✅ | `hr_attendance_extend.py:123-152` | |
| P11 | ✅ | 39 × `Asia/Damascus` in 7 files; `email_template.py:100` default `hr@syravia.com`; **also** the payroll wizard defaults to `Asia/Riyadh` (`payroll_report.py:49-52`) | All 312 employees have `tz` set |
| P12 | ✅ | 79 × `sudo()`; rules use `create_uid` (`security/record_rules.xml:23-68`) | |
| P13 | ✅ | No `activity_schedule` in `roster_swap_request.py` / `self_offday_request.py` | |
| P14 | ✅ (nuanced) | One netting engine, but the reports present it differently: see §4 | |
| P15 | ✅ | `_compute_actual` (`roster_line.py:908-932`) sets `missing_in` only when no check-in at all, which cannot happen once a record exists | `missing_out` 1, `missing_in` 0 of 36,799 rows; **26 future-dated** punches (latest 2026-11-08) |
| P16 | ✅ | `roster_line.py:2083-2090`, still written at `:2313` | 0 rows > 0 |
| P17 | ✅ | `roster_shift.py:29`, `roster_line.py:50,613,815,976-982` | 172 night rows |
| P18 | ✅ | `raw_attendance_log.py:514` (`punch_date` = calendar date), `_pair_punches :574`, `_existing_attendance :601` | 2 open `hr.attendance`; 163 records cross local midnight; staging empty in this copy |

### 3.1 New findings (P19 onwards)

| # | Problem | Evidence | New behaviour |
|---|---|---|---|
| P19 | **Approvals are not checked on the server** (§5) | `self_offday_request.py:108`, `roster_swap_request.py:129`, `ir.model.access.csv:25` | Server-side check + "not your own request" rule |
| P20 | **Any internal user can read every day row**, including sick status | `ir.model.access.csv:10` gives `base.group_user` read; record rules cover HR groups only | Employee sees own days only; supervisor their teams |
| P21 | **Stale stored values after a manual state change.** `_compute_actual` does not depend on `manual_state` (`roster_line.py:831-834`) but skips punches on leave/sick/mission days (`:894`). A day that becomes "mission" keeps its old payable minutes and `missing_punch` | A10: 134 rows in one period (§7) | The engine recomputes the whole day from its inputs; no partial dependency lists |
| P22 | **Real personal data in source comments** besides the tests listed in CLAUDE.md | `period_balance_report.py:14,85,478,807`, `raw_attendance_log.py:279` | Synthetic examples only; include in the history rewrite |
| P23 | Device Sync sits under Configuration (HR Manager), so the Officer-level BioTime menus are unreachable for Officers | `views/biotime_sync_views.xml:281` | Place by group |
| P24 | 12 pure tests never run in Odoo's test runner (`unittest.TestCase`, not an Odoo test class) | `tests/test_rotation_math.py` | Engine tests runnable in both pytest and Odoo |
| P25 | Payroll Excel "Works" and "Coming Early / Tardiness" on mission days show the stale punches (follows from P21) | A10 Excel comparison (§7) | |

## 4. Payroll vs Period Balance: the exact differences (R11, P14)

Both reports read **approved** day rows and call the **same** engine,
`roster.line.compute_period_totals()` (`roster_line.py:1597-1759`), per
employee. The differences are in **which rows** go in and **which figures**
come out.

### 4.1 What the engine computes (shared)

Per employee and period: `total_short` = Σ shortage on normal days + the
remaining gap on paid mission/sick days; raw OT split into `raw_125` (rate <
weekend factor) and `raw_150`; shortage eats 1.25 first, then 1.5;
`weighted_ot = net_125 × 1.25 + net_150 × 1.5`; **`payable_ot` = weighted OT
only if net shortage is 0** (the gate); `salary_deduct` excludes mission/paid
sick gaps; the `subtract_neg_balance_from_ot` flag lets OT cover the deficit
and reports the rest as banked.

### 4.2 Differences

| # | Topic | Payroll Period Report | Period Balance Report |
|---|---|---|---|
| D1 | Rows: off days / holidays when the toggle is off | **Excluded entirely** (`payroll_report.py:195-198`) | Kept if they carry a non-zero Deduction (`period_balance_report.py:252-257`) |
| D2 | Optional roster filter | No | Yes, `roster_id` (`:239`) |
| D3 | Archived / departed employees | **All included** (final settlements) | Filtered by the Overview's `_employee_scope` (`:279-293`, `:369`) |
| D4 | Mid-period starters | All days counted | Days before `contract_date_start` dropped (`:295-313`, `:396-400`) |
| D5 | Money figure | "Deduction / Extra Pay" = **Σ daily `deduction_extra_pay`** per employee and grand total (`payroll_report.py:540,757-759`) | Over = Σ positive daily DEP, Shortage = Σ negative daily DEP (`roster_line.py:1779-1797`) |
| D6 | Shortage shown | "Net short" from the engine (Notes text) | **Gross**: Σ negative DEP **+ leave credit + sick credit** (`period_balance_report.py:498-502`) |
| D7 | Balance | = Σ DEP (net) | = Σ DEP **− (leave + sick credit)**. Equals the payroll figure only for employees without leave/sick credit. `net_balance` is carried but not printed |
| D8 | OT gate / cheapest-first netting | Shown only as text in **Notes** ("Payable OT", "Net short", banked OT) | Not used for any printed figure |
| D9 | OT column | Raw OT sum | Not printed (Over is weighted) |
| D10 | Rounding | Durations formatted by `_dur`; money 1 dp in cells | 2 dp; `half` unit rounds Shortage, Over, Balance **each** up to the half hour, so `Over − Shortage` may differ from Balance by 0.5 (module docstring, `period_balance_report.py:102-106`) |
| D11 | Timezone for times | Wizard field, default `Asia/Riyadh` | n/a |

**Consequence for the rebuild.** "OT is payable only if the period's required
time is met" (brief R11) is **not** what either report pays: the money
columns are the plain sum of daily Deduction/Extra Pay, which already
includes OT at 1.25/1.5 per day and the shortage per day. The gate and the
cheapest-first netting only produce the "Payable OT" text in the Payroll
notes. HR must confirm which figure payroll actually uses (Q16). The new
engine keeps both: `period.py` returns the daily-sum figure (default, same as
today) and the gated figure, and each report states which one it prints.

## 5. Approval security hole (found 2026-10-27)

- `roster.self.offday.request.action_approve` (`self_offday_request.py:108`)
  writes `approved` and calls `action_apply`, which changes roster lines
  with `sudo()` (`:149-183`). There is **no group check**. The only guard is
  the `groups="hr.group_hr_user"` on the button (`views/self_offday_views.xml:48`).
- `ir.model.access.csv:25` gives **every internal user** read, write and
  create on self off-day requests. So any internal user can approve and
  apply their own request through RPC.
- `roster.swap.request.action_approve` (`roster_swap_request.py:129`) also
  has no group check. Plain users are stopped only by the ACL (read only,
  `:22`), so the final `self.write` fails and the transaction rolls back.
  **HR Officers** have write access (`:23`), so they can approve swaps
  through RPC although the button is HR-Manager-only.
- Nobody is prevented from approving their **own** request.

Today the risk is limited (3 internal users), but it blocks giving employees
logins (Q12). New module: approval methods check the approver group on the
server, refuse self-approval, and the employee ACL allows create/read of own
requests only.

## 6. BioTime decision (P18)

**Decision: port the BioTime subsystem, but rebuild the pairing.** Staging,
identity, terminals, watermark, backfill, hold-on-doubt and the commute credit
are ported with their tests. The pairing step groups punches by **(employee,
planned shift window)** (brief §10.2) instead of by calendar day, and a lone
punch stays in staging as `missing_info` instead of creating an open
`hr.attendance`.

Classification of the 57 tests in `tests/test_biotime_sync.py`:

| Group | Tests | Assumption | Port plan |
|---|---|---|---|
| Calendar-day pairing | `test_11`, `test_12`, `test_13`, `test_13b`, `test_15`, `test_15b`, `test_16` (7) | One pair per calendar day; a single punch creates an open `hr.attendance` (`test_12`); "existing attendance" is looked up per calendar day, with an overlap workaround for nights (`test_15b`) | **Rewrite** on shift windows. `test_12` changes: the lone punch stays in staging, no open record. Add N8 and N11 |
| Day-level precedence | `test_50` … `test_55` (6) | "A day" = calendar date of the punches | **Re-key** to the shift date; same intent |
| Independent of pairing | `test_01`–`05`, `10`, `14`, `20`–`23`, `30`–`33` (+`32b`, `32c`), `40`–`43` (+`40b`), `60`–`64`, `70`–`76`, `80`–`83`, `90`–`95` (44) | Identity, watermark, timezone conversion, devices, backfill, commute credit | **Port** unchanged (new model names only) |

## 7. Legacy test suite (A8)

Run on a new empty database `legacy_test` (2026-10-27, Odoo image
`19.0-20261015`): `odoo -i roster_attendance --test-tags /roster_attendance`.
Log: `~/secure/syravia/logs/legacy_test_2026-10-27.log` (not in the repo).

| Measure | Count |
|---|---:|
| Test methods in the code | 331 |
| Run by Odoo's runner | 319 |
| … passed | 313 |
| … skipped | 6 |
| … failed / errors | **0 / 0** |
| Not run by Odoo (pure `unittest.TestCase`, `test_rotation_math.py`) | 12, run separately with `python3 test_rotation_math.py`: **12 passed** |

Skipped (all `tests/test_payroll_export.py`, they need approved real data, so
they skip on an empty DB): `test_autofilter_excludes_totals`,
`test_export_replaces_attachment`, `test_grand_total_matches_field_sum`,
`test_one_segment_leaves_second_pair_blank`,
`test_three_segments_collapse_to_outer_span`,
`test_two_segments_fill_all_four_cells`.

Warnings worth knowing (no failures): missing `license` key; 4 ×
`_sql_constraints` ignored by Odoo 19; 2 × invalid `placeholder` field
parameter; 5 × duplicate field labels (`roster.line` check-in/out display,
`roster.swap.request` line A/B, the two preview-line `ID` fields). These match
CLAUDE.md's known issues. The single ERROR line in the log is an expected
"BioTime sync failed" raised on purpose by a test.

**Conclusion:** on an empty database the old suite is green, so it can serve
as the specification. On real data it is not (CLAUDE.md: 294 tests, 1 failed,
6 errors, 2026-10-25) because tests hard-code badges and count records they
did not create. The ported tests must use unique values and scope their
assertions.

## 8. Recompute check (A10)

Period 2026-09-21 → 2026-10-20 (8,577 approved rows). The stored values were
exported from `syravia_ref` (the snapshot), then the old module's own
`roster.line.action_recompute_all` (`roster_line.py:2437`) ran on
`syravia_night_shift` (identical data, checksum verified first; 32 s), and
the result was exported again and compared with
`tools/golden_master/compare_snapshot.py`.

| Field | Rows differing | Σ (new − old) |
|---|---:|---:|
| `required_minutes`, `late_minutes`, `diff_minutes` | 0 | |
| `overtime_minutes`, `overtime_rate`, `overtime_weighted`, `shortage_minutes` | 0 | |
| **`final_minutes`, `deduction_extra_pay`, `balance_minutes`** | **0** | |
| `attendance_status`, `manual_state`, `state` | 0 | |
| `missing_punch` | 125 | |
| `payable_minutes` | 9 | −3,480 |

Explanation (P21):
- 124 rows `both_missing → none`: leave 46, sick 39, self_swap_off 22,
  off 15, mission 2. The current code does not flag "no punch" on days that
  need none, but these rows were stored by an earlier version or before the
  manual state was set. 1 row `none → both_missing` on an absent day.
- 9 rows (3 employees, all `mission`) lost 240–540 stored payable minutes:
  punches exist, but the current code ignores punches on mission days, and
  nothing recomputed the rows when the state changed. Final stays = required
  (660) in both, so no pay changes.
  Line IDs: 83269–83273, 83298, 83301, 83302, 86700.

Excel comparison for the same period:
- **Period Balance: identical** (0 cells differ).
- **Payroll:** 14 rows differ, only in display columns (Works 13, Extra /
  Short 9, Coming Early / Tardiness 13, Notes 3, 1 cell in the ID column);
  Final Works and Deduction/Extra Pay columns are identical.

**Conclusion:** the old module reproduces its own stored **money** figures
exactly. The golden master compares money fields against the stored
snapshot, and `payable_minutes` / `missing_punch` against the **recomputed**
values (the stored ones are stale for the reason above). HR's real numbers
(Final, Deduction, both reports' totals) are the stored ones and are
unchanged by a recompute.
