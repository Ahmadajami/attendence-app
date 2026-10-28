# Old module inventory: `roster_attendance` 19.0.99.0.0

A plain-language map of everything the old module does, for an HR manager.
Paths are relative to `custom_addons/roster_attendance/`. Verified against the
code on 2026-10-27. Where the brief (§3, §4) was wrong or imprecise, the
correction is listed in section 9.

## 0. Size at a glance

| Item | Count | Source |
|---|---:|---|
| Python lines (models + wizards) | ~20,000 (37,000 with views, JS, tests) | `wc -l` |
| Models with their own `_name` | 58 (27 stored, 31 temporary screens/wizards) | `models/`, `wizard/` |
| Extensions of standard models | 9 | §8 below |
| Menus | 66 | `views/menu.xml` and 9 other view files |
| Actions | 66: 48 window, 13 server, 5 client (OWL) | views + wizard XML |
| Wizards a user opens | 24 (plus 3 helper line models and 4 server-API screens) | §5 |
| Scheduled jobs (crons) | 7 | `data/cron.xml` |
| Record rules | 8 | `security/record_rules.xml` |
| Access-right lines | 102 (9 for all internal users, 51 HR Officer, 42 HR Manager) | `security/ir.model.access.csv` |
| OWL screens | 6 client actions + 2 shared widgets | `static/src/components/` |
| HTTP routes | 1 (dashboard JSON) | `controllers/dashboard_controller.py:8` |
| Tests | 331 methods in 29 files | `tests/` |

**Access groups used.** The module has no groups of its own. It uses Odoo's
`hr.group_hr_user` ("HR Officer", called **Duty Manager** in the screens) and
`hr.group_hr_manager` ("HR Manager"). Below, `[Officer]` and `[Manager]`
mark a menu or button limited to that group. No tag means every internal user.

## 1. Menus (66), as HR sees them

Top menu **Roster** (`views/menu.xml:7`), visible to every internal user.

### 1.1 Overview `[Officer]`
- **Overview**: the operations hub (OWL `roster_operations_dashboard`): one card per workflow (Night/Cycle, Rotations, Fixed Attendance, Import, Review, Reports) with shortcut buttons to the matching screens (`views/menu.xml:13`, `views/dashboard_views.xml:24`, `static/src/components/operations_dashboard/operations_dashboard.js`).

### 1.2 Rosters
| Menu | What it does | Where |
|---|---|---|
| Active Rosters | Department rosters currently running, as cards | `views/menu.xml:20` → `views/roster_shift_views.xml:383` |
| All Rosters | Every department roster | `views/menu.xml:22` → `:369` |
| Roster Archive `[Officer]` | Rosters past their end date that HR archived | `views/menu.xml:25` → `:400` |
| Pending Approval `[Officer]` | Rosters submitted and waiting for a manager | `views/menu.xml:28` → `:375` |
| Quick Swap `[Officer]` | Swap two days' work/off for employees in one step (HR-driven, no request) | `views/menu.xml:31`, `models/roster_shift.py:876` |
| Quick Self Swap `[Officer]` | Create a self off-day change request for an employee quickly | `views/menu.xml:34`, `wizard/self_swap_wizard.py:20` |
| Bulk Day-Action `[Officer]` | Apply one action to many employees (or whole departments) and days at once: full-day mission / paid sick / unpaid sick / leave / excused / unpaid off, mission/leave/sick credit minutes (all days or work days only, fixed or "fill the shortage"), remove credits, reset to normal | `views/menu.xml:37`, `wizard/bulk_day_action_wizard.py:23` |

### 1.3 Scheduling
| Menu | What it does | Where |
|---|---|---|
| Shift Cycles → Shift Cycles `[Officer]` | Per-employee Day/Night/Off cycle (e.g. D,O,N,O blocks) with its own hours | `views/menu.xml:48`, `models/roster_cycle.py:68` |
| Shift Cycles → Bulk Generate Cycle `[Officer]` | Generate day rows from cycles for many employees and a date range | `views/menu.xml:51`, `models/roster_cycle.py:335` |
| Fixed Schedules → Generate Fixed Schedule `[Officer]` | Generate day rows for employees on a fixed Working Schedule (Odoo `resource.calendar`) | `views/menu.xml:56`, `wizard/fixed_schedule_wizard.py:13` |
| Rotation Groups `[Officer]` | Groups whose members move one slot per period (off-day pair or start hour) | `views/rotation_views.xml:169`, `models/roster_rotation.py:39` |

### 1.4 Attendance
| Menu | What it does | Where |
|---|---|---|
| Dashboard | Charts and KPIs over the day rows (OWL `attendance_dashboard`) | `views/menu.xml:147` |
| Daily Records | The day rows (`roster.line`): one per employee per day, with all buttons in §4.1 | `views/menu.xml:62` → `views/roster_line_views.xml:345` |
| Attendance Overview | Cards per roster / department / employee with Required, Worked, Over, Shortage, Balance for a period (OWL) | `views/attendance_overview_views.xml:21`, `models/attendance_overview.py:91` |
| Review Board `[Officer]` | Review a period employee by employee, mark reviewed / rejected, then export payroll | `wizard/attendance_review_wizard_views.xml:231` |
| Control Panel | Fast day editor for one employee and period (OWL) | `views/attendance_control_panel_views.xml:14`, `models/attendance_control_panel.py:68` |
| Import CSV `[Officer]` | Import punches from CSV/XLSX with preview, code mapping and new-hire handling | `views/menu.xml:65`, `wizard/import_attendance_wizard.py:103` |
| Export Report `[Officer]` | Generic Excel export of day rows | `views/menu.xml:68`, `wizard/export_wizard.py:12` |
| Export Attendance Entry Template `[Officer]` | Edit the order/sections of the blank reception entry sheet and export it | `views/menu.xml:75`, `models/export_layout.py:47` |
| Attendance Emails `[Officer]` | List of day rows with their email status, with a Send button | `views/menu.xml:84` |
| Send Attendance Email `[Officer]` | Send daily/weekly/monthly attendance emails to employees (skip or resend already-sent) | `views/menu.xml:78`, `wizard/attendance_email_wizard.py:22` |
| Sent Email Log `[Officer]` | Log of every attendance email sent | `views/menu.xml:81`, `models/attendance_email_log.py:62` |

The Control Panel, Dashboard, Daily Records and Overview menus have **no
group** on the menu. The screens check the group on the server
(`attendance_control_panel.py:74`, `attendance_dashboard.py:245`), but Daily
Records is a plain list: see §7 (security).

### 1.5 Training
| Menu | What it does | Where |
|---|---|---|
| Training Records `[Officer]` | Who attended which course, dates, score, expiry; credits the day rows (full day or partial minutes) | `views/training_views.xml:336`, `models/training_record.py:42` |
| Course Catalog `[Officer]` | Course list with default duration and validity | `views/training_views.xml:339`, `models/training_course.py:18` |

### 1.6 Approvals
| Menu | What it does | Where |
|---|---|---|
| Swap Requests (Other Emp) | Swap requests between two employees | `views/menu.xml:90`, `models/roster_swap_request.py:10` |
| Pending Swaps `[Officer]` | Swap requests waiting for approval | `views/menu.xml:93` |
| Self Off-Day Changes | Requests to move one's own off day(s) for a date range | `views/menu.xml:95`, `models/self_offday_request.py:20` |
| Pending Off-Day Changes `[Officer]` | Self off-day requests waiting for approval | `views/menu.xml:98` |
| Assign Holiday `[Officer]` | Give a holiday to many employees on chosen dates (bulk) | `views/menu.xml:101`, `wizard/holiday_assign_wizard.py:14` |
| Holiday Assignments `[Officer]` | List of every employee holiday assignment | `views/menu.xml:104`, `models/holiday_assignment.py:23` |

### 1.7 Reports `[Officer]`
| Menu | What it does | Where |
|---|---|---|
| Payroll Period Report | The 26-column payroll Excel, with an on-screen preview first | `views/menu.xml:110`, `models/payroll_report.py:36` |
| Period Balance Report | The 11-column Over/Shortage/Balance Excel (badge format) + optional per-employee email | `views/menu.xml:112`, `models/period_balance_report.py:124` |
| Attendance Patterns `[Manager]` | Read-only per-employee patterns (late, absent, **sick**). Health data, so managers only | `views/attendance_patterns_views.xml:19`, `models/attendance_pattern.py:60` |
| Attendance Analysis | Pivot / graph over day rows | `views/menu.xml:115` → `views/attendance_dashboard_views.xml:65` |
| HR Monthly Summary `[Manager]` | Stored monthly summary per employee, with Approve/Reset | `views/menu.xml:118`, `models/hr_summary.py:35` |
| Generate Summaries `[Manager]` | Build the monthly summaries for a month | `views/menu.xml:121`, `wizard/hr_summary_wizard.py:6` |
| Custom Period Report | Excel for a sub-roster and custom dates | `views/menu.xml:123`, `wizard/hr_summary_wizard.py:37` |
| Department Report | Department attendance Excel | `views/menu.xml:125`, `models/payroll_report.py:803` |
| Export to Excel | Same action as Attendance → Export Report | `views/menu.xml:127` |

### 1.8 Configuration `[Manager]`
| Menu | What it does | Where |
|---|---|---|
| Shift Patterns | Start/end hour, grace, night box, optional N-on/M-off cycle | `views/menu.xml:133`, `models/roster_shift.py:13` |
| Holidays | Holiday windows (from/to, days allowed, type) | `views/menu.xml:135`, `models/public_holiday.py:22` |
| Email Templates | Text and colours of the daily/weekly/monthly emails | `views/menu.xml:137`, `models/email_template.py:34` |
| Import Code Mappings | Device code → employee aliases for imports | `views/import_alias_views.xml:54`, `models/import_alias.py:14` |
| Overtime | The single company-wide OT configuration (factors, brackets, thresholds) | `views/menu.xml:140`, `models/overtime_config.py:60` |
| Device Sync (submenu) | BioTime: see below | `views/biotime_sync_views.xml:281` |

**Device Sync** (inside Configuration, so effectively HR Manager only, even
where an item says Officer):

| Menu | What it does | Where |
|---|---|---|
| BioTime Sync | Log of every sync run (fetched, staged, held, errors) | `views/biotime_sync_views.xml:283` |
| Sync Now | Pull punches from BioTime immediately | `:285` → server action `:273` |
| Staged Punches | Punches pulled from BioTime waiting in staging | `:287` |
| Held Punches `[Manager]` | Punches held because the identity is in doubt | `:293` |
| Approve Punches `[Officer]` | Approve staged punches into `hr.attendance` | `:290` |
| Identity Differences `[Officer]` | Device code / name mismatches between BioTime and Odoo | `views/biotime_identity_diff_views.xml:165` |
| Refresh Differences `[Officer]` | Recompute the identity differences | `:168` |
| Terminals `[Officer]` | BioTime terminals, their location and reconnect alerts | `views/biotime_device_views.xml:109` |
| Approve Period `[Officer]` | Approve a whole period: fill empty days only (default) or replace with BioTime | `wizard/biotime_period_approve_views.xml:58` |
| Backfill Punches `[Manager]` | Fetch an older date range the watermark has passed | `wizard/biotime_backfill_views.xml:58` |

BioTime settings (URL, user, password, timezone, duplicate-tap window,
enforce device) live in **Settings** (`models/res_config_settings.py`,
`views/res_config_settings_views.xml`).

## 2. Actions (66)

- **48 window actions**: one per list/form or wizard above.
- **5 client actions (OWL)**: Control Panel, Overview, Attendance Patterns,
  Dashboard, Operations Overview (`static/src/components/*`). A sixth OWL
  screen, the **Roster Builder** (`roster_builder.js:281`), is opened from a
  roster's "Open Roster Builder" button, not from a menu.
- **13 server actions**: Sync BioTime now; Refresh identity differences;
  Send attendance email (on day rows); Generate cycle lines (on cycles);
  Generate rotation lines (on rotation groups); Export attendance entry
  template (on employees); and 7 bulk actions on day rows from the Action
  menu: Mark as Leave / Sick / Mission / Excused, Review Approve / Reject,
  Reset to Normal (`wizard/attendance_review_wizard_views.xml:171-219`).
- 11 actions are bound to a model's Action menu (`binding_model_id`).
- **No QWeb/PDF report actions.** Every report is an Excel file built with
  `xlsxwriter` inside a wizard and saved as an attachment.
- **No action has a `path`**, so URLs are `/odoo/action-<id>`.

## 3. Scheduled jobs (7, `data/cron.xml`)

All are **active on install and on every upgrade** (the file is not
`noupdate`, see CLAUDE.md known issues). On the dev databases they are off.

| Job | Every | What it does | Code |
|---|---|---|---|
| Roster: Recompute Today's Attendance | 1 day | Recompute today's day rows | `data/cron.xml:4` → `roster_line.py:2323` |
| Roster: Send Daily Attendance Emails | 1 day | Email employees their day result | `:15` → `roster_line.py:2493` |
| Roster: Alert HR — Missing Punches | 1 day | Email HR the missing-punch list | `:26` → `roster_line.py:2509` |
| Roster: Update Roster Lifecycle | 1 day | Move rosters through upcoming → active → expiring → expired | `:36` → `roster_shift.py:467` |
| Roster: Extend Fixed Schedules | 1 week | Create day rows 40 days ahead for fixed-schedule employees | `:46` → `fixed_schedule.py:320` |
| Roster: Extend Rotations | 1 week | Create rotation day rows 40 days ahead | `:56` → `roster_rotation.py:317` |
| Roster: Sync BioTime Punches | 1 hour | Pull new punches from BioTime into staging | `:67` → `biotime_sync.py:229` |

Two `cron_*` methods exist without a job: `cron_sync_leaves`
(`roster_line.py:2533`) and `cron_flag_repeated_delay` (`:2538`). Weekly and
monthly emails are **not** scheduled: they are sent by hand from the Send
Attendance Email wizard.

## 4. Buttons on the main screens

### 4.1 Daily Records (`roster.line` form, `views/roster_line_views.xml:16-87`)
| Button | Group | Effect |
|---|---|---|
| Excuse (Paid) | Officer | Day counts as on time; Final = required |
| Leave / Sick / Mission | Officer | Full-day manual state; Final = required |
| Partial Leave | Officer | Leave credit in minutes (deprecated field, P16) |
| Set as OFF | Manager | Turn a work day into an off day |
| Void Day (Ignore) | Manager | HR-set off; worked time paid at the weekend factor |
| Unpaid OFF | Manager | Day paid 0 |
| Reset Override | Officer | Back to the computed state |
| Set as Required Day | Officer | Turn an off day into a work day |
| Cancel OT / Restore OT | Officer | Zero the day's OT (undoable) |
| Apply Time Correction | Manager | Manual check-in/out correction |
| Delete Attendance | Manager | Delete the day's `hr.attendance` records |
| ⇄ Request Self Swap | Officer | Open the self-swap wizard for this day |
| ✉ Send Attendance Email | Officer | Email this day's result |

### 4.2 Department roster (`roster.shift`, `views/roster_shift_views.xml`)
Submit → Approve / Reject `[Manager]` → Reset to Draft `[Manager]`; Archive /
Restore `[Manager]`; ⇄ Swap Off Days, Clear Mission Credit, Clear Full-Day
Mission `[Officer]`; per employee line: Add to Roster, **Rebuild Days**
(from today only), Remove; Duplicate as Next Period `[Manager]`; Open Roster
Builder; Export Roster Template / Import Filled Roster `[Officer]`
(`roster_builder_views.xml:17-30`). Re-approving an approved roster asks for
confirmation and **regenerates every day of the period**
(`wizard/reapprove_confirm_wizard.py:13`).

### 4.3 Requests
- Swap request: Submit to Duty Manager → **Approve and Apply** `[Manager]` /
  Refuse `[Manager]` → Reset `[Manager]` (`views/swap_request_views.xml:39-55`).
- Self off-day request: Submit to Duty Manager → **Approve** `[Officer]`
  (approves and applies in one step) / Apply to Roster / Refuse `[Officer]` →
  Reset `[Manager]` (`views/self_offday_views.xml:43-64`).
  The group is only on the **button**. The server does not check it (§7).

### 4.4 Other screens
Overtime config: "Apply to All Roster Lines" (recompute everything,
`overtime_config_views.xml:36`). Holiday: Assign to Employees, View
assignments; assignment: Resync to Roster Line. HR Monthly Summary: Compute
Now, Approve / Reset `[Manager]`. Staged punch: Approve `[Officer]`, Reject /
Release Hold `[Manager]`. Identity difference: Confirm enrolment, Confirm
current owner, Map code `[Manager]`. Terminal: Acknowledge reconnect
`[Manager]`. Training record: Re-apply & Recompute Days `[Officer]`.
Rotation group: Generate, Exchange Slots, Change Period.

## 5. Wizards (24 a user opens)

| Wizard | Purpose | Code |
|---|---|---|
| Import Attendance (CSV/XLSX) | Detect format, map codes, preview, import; new-hire flow | `wizard/import_attendance_wizard.py:103` (+ mapping lines `:2075`) |
| Bulk Day-Action | One action on many employee-days | `wizard/bulk_day_action_wizard.py:23` |
| Review Board | Period review per employee | `wizard/attendance_review_wizard.py:22` |
| Send Attendance Email | Daily/weekly/monthly emails | `wizard/attendance_email_wizard.py:22` |
| Export Report | Excel export of day rows | `wizard/export_wizard.py:12` |
| Generate HR Summaries | Monthly summaries | `wizard/hr_summary_wizard.py:6` |
| Custom Period Report | Sub-roster Excel | `wizard/hr_summary_wizard.py:37` |
| Payroll Period Report | 26-column Excel + preview lines | `models/payroll_report.py:36` (+ `:1046`) |
| Department Report | Department Excel | `models/payroll_report.py:803` |
| Period Balance Report | 11-column Excel + preview + emails | `models/period_balance_report.py:124` (+ `:1100`) |
| Assign Holiday | Bulk holiday assignment | `wizard/holiday_assign_wizard.py:14` (+ lines `:114`) |
| Quick Swap | HR swap of two days | `models/roster_shift.py:876` |
| Quick Self Swap | Create a self off-day request | `wizard/self_swap_wizard.py:20` |
| Generate Fixed Schedule | Day rows from Working Schedule | `wizard/fixed_schedule_wizard.py:13` |
| Generate Cycle Lines | One cycle, date range | `models/roster_cycle.py:288` |
| Bulk Generate Cycle | Many cycles | `models/roster_cycle.py:335` |
| Generate Rotation Lines | Rotation, date range | `wizard/rotation_generate_wizard.py:22` |
| Exchange Rotation Slots | Swap two members' slots | `wizard/rotation_generate_wizard.py:91` |
| Change Rotation Period | New period length from a date | `wizard/rotation_generate_wizard.py:134` |
| Import Filled Roster Template | Excel roster template → employee lines (max 2 off days) | `wizard/roster_template_wizard.py:283` |
| Roster Re-Approve Confirmation | Warn before regenerating lines | `wizard/reapprove_confirm_wizard.py:13` |
| BioTime Approve Period | Fill-empty / replace for a period | `wizard/biotime_period_approve.py:24` |
| BioTime Backfill | Fetch an older date range | `wizard/biotime_backfill.py:32` |
| BioTime Map Code | Map a device code to an employee and release held punches | `wizard/biotime_identity_resolve.py:14` |

Server-API screens (temporary models used by OWL, no form):
`roster.control.panel` (`models/attendance_control_panel.py:68`),
`roster.attendance.overview` (`models/attendance_overview.py:91`),
`roster.attendance.pattern` and `attendance.dashboard` (abstract,
`models/attendance_pattern.py:60`, `models/attendance_dashboard.py:9`).

## 6. Stored models (27)

| Model | Holds | Code |
|---|---|---|
| `roster.line` | The day row: schedule, punches, statuses, credits, OT, Final, Deduction | `models/roster_line.py:10` (2,555 lines) |
| `roster.shift` | Department roster (header, dates, states, lifecycle) | `models/roster_shift.py:84` |
| `roster.employee.line` | Employee on a roster: pattern, 2 off days, grace | `models/roster_shift.py:571` |
| `roster.shift.pattern` | Shift pattern | `models/roster_shift.py:13` |
| `roster.cycle` | Per-employee Day/Night cycle | `models/roster_cycle.py:68` |
| `roster.rotation.group` / `.slot` / `.member` | Rotation groups | `models/roster_rotation.py:39,375,413` |
| `roster.swap.request` | Employee↔employee swap | `models/roster_swap_request.py:10` |
| `roster.self.offday.request` | Self off-day change | `models/self_offday_request.py:20` |
| `roster.public.holiday` | Holiday window | `models/public_holiday.py:22` |
| `roster.holiday.assignment` | Employee holiday date | `models/holiday_assignment.py:23` |
| `roster.overtime.config` | Company OT configuration (singleton) | `models/overtime_config.py:60` |
| `roster.email.template` | Email texts and themes | `models/email_template.py:34` |
| `roster.attendance.email.log` | Sent emails | `models/attendance_email_log.py:62` |
| `roster.export.layout.line` | Entry-sheet export order | `models/export_layout.py:47` |
| `roster.import.alias` | Device code → employee | `models/import_alias.py:14` |
| `roster.training.course` / `.record` | Training | `models/training_course.py:18`, `training_record.py:42` |
| `hr.monthly.summary` | Monthly summary | `models/hr_summary.py:35` |
| `raw.attendance.log`, `import.batch` | BioTime staging | `models/raw_attendance_log.py:66,30` |
| `biotime.sync.run`, `biotime.device`, `biotime.identity.diff`, `biotime.identity.ack` | BioTime runs, terminals, identity | `models/biotime_*.py` |

## 7. Security as implemented

**Record rules** (`security/record_rules.xml`), for `roster.shift`,
`roster.line`, `roster.rotation.group`, `roster.employee.line` only:
- HR Officer sees rows of departments **they manage** or rows **they
  created** (`:23`, `:38`, `:53`, `:68`).
- HR Manager sees everything (`:86-107`).
- There is **no rule for plain internal users**. Combined with read access
  for `base.group_user` (`ir.model.access.csv:10`), any internal user can
  read **every** day row, including sick status. (Today only 3 internal
  users exist, so this is latent, but it blocks giving employees logins.)
- Requests (swap, self off-day) have no record rules at all.

**Server-side group checks** exist on the Roster Builder
(`roster_builder.py:46-50`), Control Panel (`attendance_control_panel.py:74`),
Attendance Patterns (`attendance_pattern.py:76`), Dashboard
(`attendance_dashboard.py:245`), several roster actions
(`roster_shift.py:788,824,860`) and day-row edits (`roster_line.py:595,670,772,1526,1554`).
They are **missing on request approvals**: see DIFF_OLD_VS_NEW.md §5.

`sudo()` is called 79 times.

## 8. Extensions of standard Odoo models

| Model | Adds | Code |
|---|---|---|
| `hr.employee` | `start_date`, `shift_pattern` text, `weekly_hours`, `name_ar`, `reception_seq`, `report_seq`, `attendance_mode`, `use_fixed_schedule`, `fixed_required_minutes`, `late_grace_minutes`, `subtract_neg_balance_from_ot` | `models/fixed_schedule.py:27` |
| `hr.employee` | `biotime_device_ids` | `models/hr_work_location_extend.py:27` |
| `hr.employee` | entry-template export server method | `models/attendance_entry_template.py:113` |
| `hr.department` | `late_grace_minutes`, `biotime_commute_credit` | `models/fixed_schedule.py:218,239` |
| `resource.calendar` | `late_grace_minutes` | `models/fixed_schedule.py:251` |
| `hr.work.location` | `biotime_device_ids` | `models/hr_work_location_extend.py:17` |
| `hr.attendance` | create/write/unlink recompute the day rows synchronously; `roster_source` | `models/hr_attendance_extend.py:44` |
| `hr.leave` | validate/refuse/draft sync day states | `models/hr_leave_extend.py:37` |
| `resource.calendar.leaves` | holiday sync (broken, P1) | `models/hr_leave_extend.py:109` |
| `res.config.settings` | BioTime settings | `models/res_config_settings.py:13` |

## 9. Corrections to the brief (§3, §4)

| Brief says | Code says |
|---|---|
| Daily email, missing-punch alert **and weekly/monthly email crons** (§0.2) | Only the daily email and the missing-punch alert are crons. Weekly/monthly emails are sent by hand (§3) |
| R6 `_compute_tardiness` at `roster_line.py:1086-1114` | Starts at `:1092` |
| R7 `_compute_status` at `:1116-1222` | Starts at `:1126` |
| R8 `_compute_diff` at `:1224-1444` | Starts at `:1232` |
| R9 `_compute_payroll_fields` at `:2187-2292` | Starts at `:2198` |
| R12 `action_swap_days` at `:1803` | `:1804` |
| R10 `deduction_extra_pay` at `:2144-2181` | Field at `:2131`, compute ends at `:2181` |
| R11 "OT is payable only if the period's required time is met" | True for the **Payable OT** figure in the Notes column. The money column of both reports is **Σ daily `deduction_extra_pay`**, which has no period gate and no cheapest-first netting. See DIFF §4 |
| Hard-coded timezone "39 places" | 39 occurrences in 7 files (`roster_line.py`, `import_attendance_wizard.py`, `raw_attendance_log.py`, `attendance_control_panel.py`, `res_config_settings.py`, `hr_attendance_extend.py`, `attendance_email_log.py`) ✅ |
| `hr@syravia.com` hard-coded | Default of the template's From field, `models/email_template.py:100` ✅ |
| Grace R4 step 3 "roster employee-line grace … or Working Schedule grace for fixed lines" | ✅ `roster_line.py:940-963`; cycle and rotation rows have no employee line, so they fall to the Working Schedule grace, then 15 |
| Menus 66, actions 53, wizards 16 (repo plan) | 66 menus ✅; **66 actions** (48 window + 13 server + 5 client); **24** user wizards |
| The old module has 6 OWL screens | 6 client screens (5 from menus + Roster Builder) + 2 widgets (`kpi_card`, `operation_card`) ✅ |
