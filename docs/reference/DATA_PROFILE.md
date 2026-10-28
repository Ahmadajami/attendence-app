# Data profile (brief §7.4)

Source: `syravia_ref` (read-only duplicate of `syravia_night_shift`, the most
recent real data), measured on 2026-10-27 with aggregate SQL only (`count`,
`sum`, `group by`). No rows, names, badges or reasons are reproduced here.
"Future" means after 2026-10-27, the day the snapshot was taken.

## 1. Record counts

| Model | Records | Note |
|---|---:|---|
| `hr.employee` (active / all) | 312 / 347 | all 312 active on timezone `Asia/Damascus` |
| `res.users` (internal, active) | 3 | employees have **no** Odoo logins |
| `hr.department` | 30 | |
| `hr.attendance` | 23,625 | `roster_source` is empty on every record |
| `hr.leave` | 1 | Odoo leave is practically unused. HR uses `manual_state` on days |
| `roster.line` | 36,799 | dates 2026-05-20 → 2026-12-31 |
| `roster.shift` (department rosters) | 75 | 66 approved, 7 draft, 1 submitted, 1 rejected |
| `roster.employee.line` | 1,337 | every one has **two** off days (none with 0 or 1) |
| `roster.shift.pattern` | 28 | |
| `roster.cycle` | 6 | |
| `roster.rotation.group` / member / slot | 0 / 0 / 0 | **rotation groups are not used** |
| `roster.swap.request` | 24 | all `applied` |
| `roster.self.offday.request` | 226 | 222 applied, 3 draft, 1 submitted |
| `roster.public.holiday` | 4 | 3 public (8 days allowed in total), 1 religious (2 days) |
| `roster.holiday.assignment` | 586 | 231 overtime-eligible (125 employees), 355 plain (193 employees) |
| `roster.overtime.config` | 1 | normal 1.25, weekend 1.50, holiday 2.00 (unused, P4), night 1.50 (unused) |
| `roster.import.alias` | 15 | |
| `roster.training.course` / record | 38 / 1 | catalogue loaded, training barely recorded |
| `roster.email.template` | 4 | |
| `roster.attendance.email.log` | 1,361 | |
| `roster.export.layout.line` | 60 | |
| `hr.monthly.summary` | 39 | |
| `raw.attendance.log` / `import.batch` | 0 / 0 | **BioTime staging is empty** |
| `biotime.sync.run` | 167 | sync runs logged, but nothing staged |
| `biotime.device` / identity diff / ack | 0 / 0 / 0 | |

Leftover tables from older versions (no model in v99): `roster_net_balance_report` (0 rows),
`roster_net_balance_wizard` (0), `roster_shift_cycle_wizard` (1), `roster_assign_holiday_wizard` (0).
Ignored by the migration.

## 2. Duplicate (employee, date) day rows (P7)

| Measure | Value |
|---|---:|
| (employee, date) pairs with more than one row | 11 |
| Extra rows | 11 (max 2 per pair) |
| Source combination | all `roster` + `roster` |
| State combination | all `draft` + `rejected` |

**No approved duplicates.** All 11 come from a draft roster overlapping a
rejected one, so they never reach a report (reports read `state = approved`).
The migration can drop the non-approved row of each pair.

## 3. Lines per `line_source` and state

| line_source | approved | draft | rejected |
|---|---:|---:|---:|
| roster | 30,073 | 11 | 121 |
| fixed | 5,608 | | |
| cycle | 986 | | |
| rotation | 0 | | |

Night lines (`is_night_shift`): 172 of 36,799.

## 4. P2: overnight patterns with the night box unticked

| Measure | Value |
|---|---:|
| Patterns with end < start | 4 |
| … of which night box **unticked** | **0** |
| Employee lines on such patterns | 0 |
| Day rows with planned end < start (any) | 0 |

**P2 has no victims in today's data.** The bug is real in code
(`roster_shift.py:43-64`), but HR has ticked the box on every overnight
pattern. The new module still removes the box (P17).

## 5. P3: midnight-start shifts

0 patterns start at 00:00, 0 start between 00:00 and 04:00, 0 cycles start
at 00:00, 0 day rows start at 00:00. **P3 has no victims in today's data.**
The new matching (§10.2) is still required for N5.

## 6. Punches

| Measure | Value |
|---|---:|
| `hr.attendance` records | 23,625 |
| … crossing local midnight | 163 |
| … 16 h or longer | 115 |
| Open records (no check-out), P18 | **2** (2 employees) |
| Future-dated records (check-in after 2026-10-28) | **26** (26 employees), latest 2026-11-08 |
| Day rows after 2026-10-27 that already carry a check-in | 26 |

The 26 future records match the brief's P15 note (a day/month swap at
import). They already feed 26 future day rows.

### Missing-punch distribution (P15), `roster.line.missing_punch`

| Scope | none | both_missing | missing_in | missing_out |
|---|---:|---:|---:|---:|
| All rows | 30,817 | 5,981 | 0 | 1 |
| Normal work days (not off/holiday, `manual_state` normal) | 21,090 | 5,488 | 0 | 1 |
| … dated up to 2026-10-20 (closed periods) | 21,065 | 1,542 | 0 | 0 |

**P15 confirmed:** single-punch days practically never reach the day rows
(1 `missing_out` in 36,799 rows, and `missing_info` status appears once).
1,542 past work days have no punch at all (`absent`).

## 7. Statuses and manual states

`attendance_status`: overtime 13,991 · off 5,816 · absent 5,491 · shortage
5,108 · ontime 2,879 · delay 703 · leave 699 · sick 424 · holiday 299 ·
swap_off 256 · swap_on 241 · mission 228 · holiday_worked 206 ·
self_swap_on 186 · self_swap_off 176 · grace 90 · unpaid_off 5 · missing_info 1.

`manual_state`: normal 34,505 · leave 699 · sick 424 · swap_off 230 ·
swap_on 229 · mission 228 · self_swap_on 186 · self_swap_off 176 · ignore 70 ·
empty 41 · excused 6 · unpaid_off 5.

## 8. Holidays

- 4 holiday windows, 586 employee assignments, 511 day rows flagged
  `is_public_holiday`.
- 231 assignments (39 %) are overtime-eligible.

## 9. Credit and override usage (day rows)

| Field | Rows > 0 / true | Total minutes |
|---|---:|---:|
| `mission_credit_minutes` | 1,120 | 68,520 |
| `leave_credit_minutes` | 356 | 32,348 |
| `sick_credit_minutes` | 1 | 510 |
| `training_credit_minutes` | 1 | 250 |
| `topup_minutes` | 19 | 12,540 |
| `partial_leave_minutes` (deprecated, P16) | 0 | 0 |
| `break_minutes` (from import) | 210 | 19,876 |
| `tardiness_applied` | 347 | |
| `suppress_ot` (Cancel OT) | 0 | |
| `sick_unpaid` | 0 | |
| `is_unauth_swap` | 0 | |

P16: `partial_leave_minutes` is empty in real data, so dropping it loses nothing.

## 10. Employee and department settings

- Active employees with `use_fixed_schedule`: 27; with
  `subtract_neg_balance_from_ot`: 19; with their own `late_grace_minutes`: 18;
  with `attendance_mode = manual`: 9.
- Departments with their own `late_grace_minutes`: 8; with
  `biotime_commute_credit`: 0.

## 11. Golden-master periods (approved day rows)

| Period | Approved rows | Employees |
|---|---:|---:|
| 2026-07-21 → 2026-08-20 | 7,841 | 267 |
| 2026-08-21 → 2026-09-20 | 8,085 | 268 |
| 2026-09-21 → 2026-10-20 | 8,577 | 314 |

(No draft or rejected rows fall inside these periods.)
