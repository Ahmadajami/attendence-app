# Attendance Builder: Rebuild of `roster_attendance` (Odoo 19 Community)

> **How to use this file (for the human):**
> 1. Put this file in the root of your project as `CLAUDE.md`.
> 2. Put the old module in `legacy/roster_attendance/`, exactly as you received it.
> 3. Put the UI mockup `attendance-builder.html` in `docs/mockup/`.
> 4. You already have a **copy of the production container and its database**. Tell Claude where it is in §0.1 (container name, or the path to the dump). Claude will **neutralise** it first (§0.2), so it can never email employees or pull from the real BioTime server.
> 5. Open Claude Code in the project folder and say:
>    **"Read CLAUDE.md and start with Phase 0. Stop after Phase 0 and show me the reports."**

---

## 0. Fixed settings

| Setting | Value |
|---|---|
| Odoo version | **19.0**, from the old module's manifest (`19.0.99.0.0`) |
| Edition | **Community (no Enterprise, ever; see §0.3)** |
| Old module | `legacy/roster_attendance/`: about 37,000 lines, 58 models (incl. wizards), 29 test files (331 tests), 6 OWL screens |
| New module | `hr_attendance_builder` |
| Company timezone | `Asia/Damascus`. Read it from the employee, then the company. **Never hard-code it** (the old code does, in 39 places) |
| Payroll period | **21st → 20th** of the next month (the old module's convention, `models/attendance_overview.py:102-134`). Make it configurable |
| Sites | Damascus HQ, Damascus Airport, Aleppo Airport (BioTime terminals per location) |
| Headcount | about 260 staff on daily attendance |
| Payroll | **None inside Odoo.** Results leave Odoo as Excel files in the exact formats HR already uses |

### 0.1 The production copy (the human fills this in)

| Item | Value |
|---|---|
| Copied Odoo container name / image | `__` |
| Copied Postgres container name (or dump file path) | `__` |
| Database name inside the copy | `__` |
| Odoo admin login for the copy | `__` (change the password after neutralising) |
| Where the copied filestore lives | `__` (needed for attachments, e.g. exported Excel files) |

Treat this copy as the **reference system** (`prod_copy`): the old module, running on real data. Claude may read it freely and run the old module's code on it. It is the source for the data profile, the golden master and the migration test.

**Never modify `prod_copy` itself.** Clone it before anything that writes:
- `prod_ref`: an untouched clone, used only for reading the old stored numbers.
- `prod_work`: a disposable clone for installing the new module, migrations and the parallel run. Re-create it from `prod_ref` whenever needed.

### 0.2 Neutralise the copy BEFORE starting it (mandatory, first thing in Phase 0)

The copy contains the live configuration. Started as-is, it would:
- **email real employees** (the daily attendance email cron, missing-punch alerts, weekly/monthly emails)
- **log in to the real BioTime server** every hour and pull punches (this also writes login entries to BioTime's audit log)
- run the other crons

**Status:** the human has already neutralised the laptop copy (crons, emails and real-data sync are switched off). Claude's job is only to **verify** it, read-only, before doing anything else:
- `SELECT count(*) FROM ir_cron WHERE active` → expect 0
- `SELECT count(*) FROM ir_mail_server WHERE active` → expect 0
- no `smtp_*` options in the copy's `odoo.conf`
- the three BioTime connection keys are empty

Record the result in `docs/NEUTRALISE_LOG.md`. **If any check fails, stop and tell the human. Don't fix it silently.** The SQL below is for every **new** clone made from the copy.

Before the first start, run these on **every** clone (and confirm in `docs/NEUTRALISE_LOG.md`):

```sql
-- 1. stop every scheduled job
UPDATE ir_cron SET active = false;
-- 2. no outgoing mail: remove mail servers, cancel queued mail
UPDATE ir_mail_server SET active = false;
UPDATE mail_mail SET state = 'cancel' WHERE state IN ('outgoing','exception');
-- 3. cut the BioTime integration: blank ONLY the connection keys (keep a backup of the
--    values in a local file, never in git). Keep biotime_timezone / biotime_enforce_device /
--    biotime_watermark: they affect how stored punches are read
UPDATE ir_config_parameter SET value = ''
 WHERE key IN ('roster_attendance.biotime_url',
               'roster_attendance.biotime_user',
               'roster_attendance.biotime_password');
-- 4. mark the database as a copy
UPDATE ir_config_parameter SET value = 'prod-copy-' || now()::date WHERE key = 'database.uuid';
UPDATE ir_config_parameter SET value = 'http://localhost:8069' WHERE key = 'web.base.url';
```

- Also start Odoo with **`--no-database-list`** and **without** the `--smtp` options, and block outgoing network from the Odoo container where you can (e.g. a Docker network without internet).
- The keys above come from `models/biotime_sync.py:38-41`. If `SELECT key FROM ir_config_parameter WHERE key ILIKE '%biotime%'` shows other connection keys, blank them too.
- The copy holds **personal and health data** (sick days, names, badges). Keep it on this machine. Never commit it, upload it or paste raw rows into docs: use counts and anonymised examples (employee ID numbers, not names).

### 0.3 Community edition: hard constraints

These modules **do not exist** for us. Never depend on them, import them or reference them:
`planning`, `hr_payroll`, `hr_work_entry` payroll features, `web_studio` / `x_studio_*` fields, `web_enterprise`, `web_gantt`, `web_map`, `web_cohort`, `spreadsheet_edition`, `approvals`.

⚠️ The old module contains two files written by an earlier AI analysis: `TECHNICAL_DOCUMENT.md` §15 ("Enterprise Migration Opportunities") and `ROADMAP.md` ("Enterprise Migration", EM-1…EM-5). **Both recommend Enterprise modules (Planning, Payroll, Studio). Ignore those sections completely.** The rest of both documents is useful background, but they describe **version 48**. The code is **version 99**, so trust the code, not the documents.

**Allowed modules:** `base`, `web`, `mail`, `resource`, `hr`, `hr_attendance`, `hr_holidays`. Use `xlsxwriter` (ships with Odoo) for Excel files.

Good news: the old module already depends only on `hr`, `hr_attendance`, `hr_holidays` and `mail`, so it has **no Enterprise dependency** today. Keep it that way.

---

## 1. Mission and strategy

A former developer built `roster_attendance`. It runs the company's real attendance and pay adjustments, and many of its rules were confirmed with HR line by line. The code comments cite HR "truth tables" with dates and real cases.

**We are rebuilding it as a new, clean module**, with:

1. **The same results.** For the same punches and settings, the new module must produce **the same numbers** as the old one: required, worked, OT, shortage, Final Works and Deduction/Extra Pay. The only exceptions are cases where this brief explicitly changes a rule (§6), or where the old result is a confirmed bug (§5).
2. **One simple scheduling model** instead of the old four separate engines (§6).
3. **The new features HR asked for:**
   - overtime rules **per department**, with an **OT on/off checkbox per department and per employee**
   - **patterns assignable to an employee, a team or a department**
   - **teams with supervisors**
   - **shifts entered as "from hour to hour"**, including overnight shifts such as **16:00 → 04:00 next day**, with **night-shift customization**
   - **off-day swaps limited to week-only or month-only scope**
   - a **mobile-friendly Svelte builder** (see the mockup)

### Strategy: rebuild the core, port the edges

| Part | What we do | Why |
|---|---|---|
| Scheduling (rosters, patterns, cycles, rotations, fixed schedules), the daily calculation engine, swaps, holidays, leave sync, OT configuration, builder UI | **Rebuild** cleanly following this brief | This is where the complexity, bugs and duplication are, and where the new features go |
| BioTime sync + staging + identity reconciliation, CSV/XLSX import, reception entry template + export order, training catalog/records, attendance emails, Excel reports, Attendance Patterns, review board, bulk day actions | **Port** with minimal changes, re-pointed to the new daily model | Recent, well-tested code full of field-learned edge cases (device quirks, badge formats, midnight splits). Rewriting it would lose that knowledge |

Phase 0 must confirm this split with the human before any code is written.

---

## 2. Working rules for Claude

- **Phase 0 first.** No feature code until the Phase 0 reports are approved.
- **The old module's tests are the specification.** Every behavior covered by `legacy/roster_attendance/tests/` must either pass in the new module (ported test) or be listed in `docs/DIFF_OLD_VS_NEW.md` as an intentional change approved by the human.
- **Results must match.** Build a **golden-master comparison** (§14): same input, old engine vs new engine, per employee per day and per period. Any difference is a bug until it is explained.
- **Community only** (§0.3).
- **The engine is pure Python** (no ORM inside the math), so it is unit-testable like the old `models/rotation_math.py`.
- **No hard-coded company data**: no timezone, company name, email address or employee names in code.
- **Use `sudo()` only with a written reason** in a comment. The old code calls it 79 times.
- **Never delete or rewrite punches** (`hr.attendance`) as a side effect of planning changes.
- **Ask, don't guess.** Business questions go to `docs/OPEN_QUESTIONS.md`. Pick the old behavior as the default until HR answers.
- Commit after each phase. Keep `docs/DECISIONS.md` and `docs/CHANGELOG.md` up to date.

---

## 3. What the old module is (starting map; Phase 0 must verify and complete it)

### 3.1 Subsystems

| # | Subsystem | Old models / files | New plan |
|---|---|---|---|
| A | **Shift pattern** (one start/end time + optional N-on/M-off cycle) | `roster.shift.pattern` in `models/roster_shift.py:13-77` | Rebuild → `shift` + `pattern` (§9.1, §9.3) |
| B | **Department roster** (header with a date range, approval states, lifecycle upcoming/active/expiring/expired/archived; one line per employee with pattern + `day_off_1/day_off_2` + grace) | `roster.shift`, `roster.employee.line` (`models/roster_shift.py`), `models/roster_builder.py`, OWL `roster_builder` | Rebuild → `assignment` + approval (§9.4) |
| C | **Day/Night cycle per employee** (`D,O,N,O` blocks, block size, day/night hours) | `roster.cycle` (`models/roster_cycle.py`) | Rebuild → cycle pattern (§9.3) |
| D | **Rotation groups** (members advance one slot per period; the slots are off-day pairs or shift patterns) | `roster.rotation.group/slot/member`, `models/rotation_math.py`, wizards | Rebuild → `rotation` assigned to a team (§9.5) |
| E | **Fixed schedule** from the Odoo Working Schedule (`use_fixed_schedule`, `fixed_required_minutes`) | `models/fixed_schedule.py`, weekly cron | Rebuild → weekly pattern / calendar fallback (§9.4) |
| F | **Daily record**: one row per employee per day, more than 60 fields, the computed chain, statuses, credits, overrides, review, email flags | `roster.line` (`models/roster_line.py`, 2,555 lines) | Rebuild → `attendance.builder.day` (§9.8) |
| G | **OT configuration** (company-wide singleton: factors, tardiness brackets, lifecycle days, training days, pattern thresholds) | `roster.overtime.config` | Rebuild → company defaults + **per-department rules** (§9.7) |
| H | **Swaps**: employee↔employee swap request, self off-day change for a period, quick swap, unauthorized-swap flag | `roster.swap.request`, `roster.self.offday.request`, wizards, `action_swap_days` (`roster_line.py:1803`) | Rebuild → `change` (§9.6) |
| I | **Holidays**: a named window with days allowed; assigned per employee to a date; optional "overtime-eligible" | `roster.public.holiday`, `roster.holiday.assignment`, wizard | Rebuild (keep the concept) |
| J | **Leave sync**: validated `hr.leave` → day state (leave/sick/mission) by leave-type code | `models/hr_leave_extend.py` | Rebuild with a configurable mapping |
| K | **Credits and overrides**: mission/leave/sick/training credit minutes, top-up, unpaid sick, excused, ignore, unpaid off, set-required-day / set-off-day, cancel OT, tardiness bracket apply, manual check-in/out correction | `roster.line`, `wizard/bulk_day_action_wizard.py` | Rebuild (same rules, §4) |
| L | **BioTime (ZKBio Time 8.5) integration**: GET-only API sync, staging (`raw.attendance.log`, `import.batch`), hold-on-doubt, identity diff/ack, device registry, location → devices, period approve (fill-empty vs replace), backfill | `models/biotime_*.py`, `models/raw_attendance_log.py`, `models/hr_work_location_extend.py`, wizards | **Port** |
| M | **CSV/XLSX import**: format detection, badge aliases, new-hire flow, midnight-split merge, max shift hours, two-segment → break, Friday-prayer credit, auto-credit late | `wizard/import_attendance_wizard.py` (2,147 lines), `roster.import.alias` | **Port** |
| N | **Reception entry sheet** (blank template) + **export order layout** (sections/employees, first-claim, "Everyone else" catch-all) | `models/attendance_entry_template.py`, `models/export_layout.py` | **Port** |
| O | **Training**: course catalog, records, expiry, score; full-day or partial credit on the day | `models/training_*.py` | **Port** |
| P | **Emails**: daily line email, weekly/monthly summaries, templates, send log, missing-punch alert | `models/email_template.py`, `models/attendance_email_log.py`, crons | **Port**, but replace the hard-coded `hr@syravia.com` |
| Q | **Excel reports**: Payroll Period (26 columns), Department, Period Balance (11 columns, badge format), HR Monthly Summary, pivot | `models/payroll_report.py`, `models/period_balance_report.py`, `models/hr_summary.py` | **Port**, with formats kept **column-for-column** |
| R | **Screens**: Control Panel (quick day editor), Overview (cards), Attendance Patterns (**HR managers only: health data**), dashboards, Review Board | `models/attendance_control_panel.py`, `attendance_overview.py`, `attendance_pattern.py`, `attendance_dashboard.py`, OWL | Rebuild in Svelte (§12). Keep the access rules |

### 3.2 Records that extend core models

- `hr.employee` gets: `start_date`, `shift_pattern` (text such as "(5*2)"), `weekly_hours`, `name_ar`, `reception_seq`, `report_seq`, `attendance_mode` (automatic/manual), `use_fixed_schedule`, `fixed_required_minutes`, `late_grace_minutes`, `subtract_neg_balance_from_ot`, `biotime_device_ids`.
- `hr.department` gets: `late_grace_minutes`, `biotime_commute_credit`.
- `resource.calendar` gets: `late_grace_minutes`.
- `hr.work.location` gets: `biotime_device_ids`.
- `hr.attendance`: create/write/unlink recompute the matching days synchronously.
- `hr.leave`: validate/refuse/draft sync the day states.
- `resource.calendar.leaves`: holiday sync (**broken**, see §5).

---

## 4. Business rules to carry over (this is the calculation specification)

These come from `models/roster_line.py` and the tests. They are **the default behavior of the new engine.** Line numbers refer to the legacy file.

**R1. Required minutes.**
- A work day's required minutes = the **full shift span** (start → end). There is **no automatic break deduction** (`roster_shift.py:56-64`).
- Off days, holidays and voided days need 0 for display and totals (`effective_required_minutes`, `roster_line.py:1901`). The stored value is kept, so "Reset to normal" can restore it.

**R2. Worked (payable) minutes.**
- Worked = the sum of punch pairs inside the day window, minus `break_minutes`.
- `break_minutes` comes **only** from the import: in a two-segment day, the gap between `out_1` and `in_2` becomes the break (`roster_line.py:155-169`, `935-938`).

**R3. Day window for matching punches** (`_att_window_utc`, `roster_line.py:785-829`).
- A day shift uses the whole local calendar day.
- A night shift uses a local **noon → next-day noon** window.
- Always use the employee's timezone.

**R4. Grace, first match wins** (`_grace_minutes`, `roster_line.py:940-963`):
1. employee `late_grace_minutes` > 0
2. department `late_grace_minutes` > 0
3. roster employee-line grace (an explicit 0 there means zero), **or** the Working Schedule grace for fixed lines
4. 15

**R5. Arrival.**
- `coming_minutes` = scheduled start − check-in (signed: + means early).
- `late_minutes` = max(0, raw lateness − grace).
- Lateness inside grace is **forgiven**: those minutes count as paid time and reduce the shortage, but **never create OT** (`roster_line.py:1069-1084`).
- Early leave = scheduled end − check-out, minus grace.

**R6. Tardiness brackets** (`_compute_tardiness`, `roster_line.py:1086-1114`; configurable).
- Raw lateness beyond grace maps to a deduction: up to 30 → 60, up to 60 → 120, up to 120 → 240, more → 540.
- The bracket is **always shown** but only deducted when HR ticks `tardiness_applied` (off by default).

**R7. Status** (`_compute_status`, `roster_line.py:1116-1222`).
- Manual states win first: leave, sick, mission, training, ignore→off, unpaid_off, excused→ontime, swap_off, swap_on, self_swap_off/on.
- Then holiday (`holiday` / `holiday_worked`), then weekly off (`off`, or `overtime` if worked).
- Then: no punches → `absent`; one punch missing → `missing_info`; late beyond grace → `delay`; late within grace → `grace`; worked ≥ required → `ontime`; otherwise `shortage`. `ontime`/`grace` upgrade to `overtime` when worked > required.
- **Never invent a check-out** for a missing punch (BioTime test `test_12_single_punch_day_gets_no_invented_checkout`).

**R8. Daily OT and shortage** (`_compute_diff`, `roster_line.py:1224-1444`).
- **Full-day states** (leave, sick, mission, training, off without work, holiday, unpaid_off) → no OT and no shortage.
- **Weekly off or holiday that was worked** → **every** worked minute is OT at the **weekend factor** (1.5). There is no threshold.
- **Normal work day:** diff = worked − required.
  - If diff > 0 → OT at the **normal factor** (1.25). **Exception:** if the day has a tardiness bracket (late beyond grace), the surplus is **make-up time, not OT**. It is paid flat (1.0×) (`roster_line.py:1383-1400`, test `test_08_delay_with_surplus_pays_flat_no_ot`).
  - **Early arrival counts:** coming at 09:00 on a 10:00 shift adds to OT (test `test_05`).
- **Credits** (mission, leave, sick, training minutes) and forgiven grace minutes **reduce shortage but never create OT.**
- **`suppress_ot`** (Cancel OT) zeroes OT only, and can be undone.

**R9. Final Works** (`_compute_payroll_fields`, `roster_line.py:2187-2292`).
- **Excused / leave / sick / mission / training:** Final = required.
- **Unpaid off:** Final = 0.
- **Ignore (HR set off):** Final = worked × weekend factor.
- **Overtime-eligible holiday:** if not worked, Final = required. If worked, Final = max(required, min(worked, required) + beyond × weekend factor).
- **Weekly off (not swapped on):** Final = (worked + credits) × weekend factor.
- **Plain holiday:** Final = required if required > 0; otherwise worked × weekend factor. In practice a holiday assignment sets required to 0, so a worked plain holiday also pays 1.5× here, while `_compute_diff` shows OT 0 for it. **Confirm this inconsistency with HR.**
- **Normal day:** Final = worked + credits + OT × (normal factor − 1) + forgiven grace − (bracket if applied). Never below 0.

**R10. Deduction/Extra Pay** = Final − required. It is 0 on ignore and unpaid-off days (`roster_line.py:2144-2181`). **Every report sums this one field**, so the Period Balance, the Payroll grand total and the emails always agree.

**R11. Period netting** (`compute_period_totals`, `roster_line.py:1597-1759`; used by the Payroll report and the emails).
- Shortage eats the **cheaper 1.25 OT first**, then the 1.5 OT.
- Mission and paid-sick gaps count toward the shortage that blocks OT, but are **not** deducted from salary.
- **OT is payable only if the period's required time is met** (the "OT gate": "overtime is not counted until total shortage is compensated").
- Employee flag `subtract_neg_balance_from_ot`: OT absorbs a negative balance before any salary deduction. The leftover is reported as "banked" (it is not stored anywhere).
- ⚠️ `period_balance_report.py` deliberately uses **slightly different rules** (TECHNICAL_DOCUMENT P-06). Phase 0 must write down **exactly** how the two differ, and HR must confirm which numbers they expect in each report.

**R12. Swaps** (`action_swap_days`, `roster_line.py:1803-1891`).
- An employee↔employee swap turns the OFF line into a work line (`swap_on`, normal required) and the work line into an OFF line (`swap_off`, required 0).
- A swap only **moves** the off day; it does not change how either day is paid.
- Working a `swap_off` day pays like a weekly off (1.5×).
- Working one's own off day without a request → `is_unauth_swap` flag (shown, not penalised automatically).

**R13. Holidays.**
- A holiday is a named window with a number of days allowed.
- HR assigns each employee a specific date inside the window. The assignment sets that day's **required to 0** (`models/holiday_assignment.py`, `_apply_to_line`), so the day is a paid day off (paid through the base salary).
- If the assignment is overtime-eligible, every worked minute pays at the weekend factor (R8, R9).

**R14. Leave sync.** Validated leave maps by type code: AL→leave, SL→sick, ML→mission, EL→leave, UL→leave (see §5 P6). If there's no code, it falls back to the type name ("sick"/"medical", "mission"/"business"/"travel"). On refuse or reset, only automatically synced days are reverted.

**R15. Import day rules** (`tests/test_import_day_rules.py`, `test_night_shift_import.py`).
- A Friday with two segments gets a 60-minute "Friday Prayer" mission credit plus the break.
- Re-importing never stacks credits, and HR-set credits are never overwritten.
- An artificial midnight split is merged within a tolerance; spans over `max_shift_hours` (16h) are rejected, not created.

**R16. BioTime rules** (`tests/test_biotime_sync.py`, 57 tests).
- GET only.
- A punch whose identity is in doubt is **held** and can never be auto-approved.
- The watermark advances only after a successful commit.
- Period approval defaults to **fill empty days only**.
- A punch only counts at the employee's location devices.
- The department commute credit (up to 60 min) applies **only** to days whose attendance came from BioTime.

**R17. Regeneration keeps manual work** (`tests/test_regen_preserves_overrides.py`). Rebuilding a schedule must keep manual states, credits, cancelled OT and swaps.

**R18. Attendance Patterns are HR-manager-only** because they show sick days (health information). The screen is read-only, and an indicator means "worth a look", never a finding.

### 4.1 Golden numbers (copy these into the new engine's tests)

Setup for G1–G6: shift 10:00–19:00, required 540, department grace 12, normal factor 1.25 (from `tests/test_tardiness_payroll.py`).

| # | Punches | Expected |
|---|---|---|
| G1 | 10:21 → 19:15 | coming −21, late 9, status delay, bracket 60, Final 534, Ded −6. With `tardiness_applied`: Final 474, Ded −66 |
| G2 | G1 + leave credit 21 | status delay, Final 555, Ded +15, shortage 0 |
| G3 | 12:00 → 18:30, mission credit 120 | bracket 240, Final 510, Ded −30, shortage 30 |
| G4 | 10:01 → 18:31 | status grace, late 0, Final 511, Ded −29, shortage 29, OT 0 |
| G5 | 09:00 → 19:48 | coming +60, status overtime, OT 108, Final 675, Ded +135 |
| G6 | no punches, leave credit 100 | Final 100, Ded −440 |
| G7 | 10:21 → 20:00 (579 worked) | bracket 60, diff +39, **OT 0** (make-up), Final 579, Ded +39. With credit 21 of any type: Final 600, Ded +60 |
| G8 | Period: day A OT 60 at 1.25, day B worked off day 120 at 1.5, day C shortage 90 | 1.25 OT fully eaten, 1.5 OT left 90 → weighted 135; gate met → payable 135 |

Phase 0 must add more golden rows taken **from production data** (§14).

---

## 5. Known problems in the old module (fix them in the new one)

| # | Problem | Evidence | New behavior |
|---|---|---|---|
| P1 | **Holiday sync from the Odoo calendar is broken in v99.** It searches and creates `roster.public.holiday` with a field `date` that does not exist (the model has `date_from/date_to`). Creating a company-wide public holiday in Odoo will error or do nothing | `models/hr_leave_extend.py:122-137` vs `models/public_holiday.py:37-40` | Correct sync (ask HR whether calendar holidays should auto-create holiday windows) |
| P2 | **An overnight shift without the "night" box ticked gets required = 0.** `16:00 → 04:00` computes `4 − 16 = −12h`, which is clamped to 0, so every worked minute becomes OT | `models/roster_shift.py:56-64` | `end ≤ start` **always** means "ends next day". The night flag is computed, not manual (§9.2) |
| P3 | **Midnight-start night shifts are probably mis-measured.** A 00:00–08:00 shift is not "end < start", so it uses the calendar-day window. A 23:50 check-in the evening before falls on the wrong day, and lateness compares clock-face minutes | `roster_line.py:819-825`, `1047-1054` | Match by the shift's own time window (§10.2). **Write a test first to confirm the old behavior** |
| P4 | **Holiday OT factor (2.0) and Night OT factor (1.5) are configured but never used.** Worked holidays pay the weekend factor | `roster_line.py:1239` (read, unused), `1294-1316`; `overtime_config.py:80-89` (holiday + night factors; night help text: "Reserved for future use") | Keep the old behavior by default. Holiday and night rates become real per-department options (HR decides) |
| P5 | **One company-wide OT configuration.** No per-department rules, no OT on/off per department or employee | `models/overtime_config.py` | Per-department rules + `ot_enabled` + employee `ot_eligible` (§9.7) |
| P6 | **"UL" (Unpaid Leave) maps to paid `leave`** | `models/hr_leave_extend.py:19` | Configurable mapping on `hr.leave.type`. **Ask HR** whether UL should be unpaid off |
| P7 | **No unique (employee, date) rule.** Duplicate day rows exist; code writes to "all duplicates" to cope | comments in `roster_line.py:1876-1891`, `training_record.py` | Unique constraint. The migration de-duplicates and reports conflicts |
| P8 | **Four scheduling engines** (roster, cycle, rotation, fixed), each with its own generator, source flag and hours lookup | `line_source` selection, `_schedule_window` (`roster_line.py:965-1013`) | One resolver over shifts/patterns/assignments (§9) |
| P9 | **Off days limited to two per week** (`day_off_1/day_off_2`); the template import rejects 3+ | `roster_shift.py:587-591`, `wizard/roster_template_wizard.py` | Patterns allow any number of off days |
| P10 | **Synchronous full recompute on every punch** (slow bulk imports) | `models/hr_attendance_extend.py` | Queue the affected (employee, date) pairs and recompute in batches |
| P11 | **Timezone hard-coded** 39× (`'Asia/Damascus'` fallback); email sender hard-coded `hr@syravia.com` | grep | Employee → company timezone; sender from the company |
| P12 | **79 `sudo()` calls**; department managers rely on `create_uid` rules | grep; `security/record_rules.xml` | Scoped elevation with reasons; team/department rules (§13) |
| P13 | **Swap/approval notifications missing** (no activities for approvers) | TECHNICAL_DOCUMENT MF-02 | `mail.activity` for the approver on submit |
| P14 | **Two period-netting implementations** that must be kept in sync by hand | TECHNICAL_DOCUMENT P-06 | One engine with named, explicit report "modes" if HR really needs two |
| P15 | **Incomplete punch pairs never reach the day records** in production (only `none` / `both_missing` seen); some future-dated punches from a day/month swap | `ROADMAP.md` "Version Queue 19.0.86" | Investigate in Phase 0 on the DB copy. The new import must keep single punches (→ missing_info) and reject future dates |
| P16 | Deprecated `partial_leave_minutes` still written in parallel with `leave_credit_minutes` | `roster_line.py:2085-2088`, `2294-2318` | Drop it; migrate it into leave credit |
| P17 | **"Night" is a manual tick box that changes the maths.** It sits on the pattern (`night_shift`) or on cycle lines (`is_night_shift`), and HR must remember it. It drives required minutes (P2), the noon-to-noon punch window, night allowance and early-out logic. Departments and sub-departments (used as teams) have **no** night setting | `roster_shift.py:29,55-64`; `roster_line.py:50,613,815,976-998` | No night box. "Overnight" is **computed from the shift times** (end ≤ start), per day, so a team that rotates Day/Night needs nothing set |
| P18 | **BioTime pairs punches by calendar day.** For a 19:00 → 07:00 worker, day D gets a lone 19:00 (open record, missing check-out), and day D+1 pairs 07:00 → 19:00 as a fake 12h "shift". That pair overlaps D's open record, so it is skipped as "comparison only" or rejected by Odoo ("already checked in"). The night tick box does not help, because the pairing never reads it | `raw_attendance_log.py:514` (`punch_date` = calendar date), `_group_by_employee_day` `:639`, `_pair_punches` `:574`, `_existing_attendance` comment `:601-613` | Pair BioTime punches **by planned shift window** (§10.2), not by calendar day. A lone punch stays in staging as `missing_info` and never creates an open `hr.attendance` that blocks the next one |

---

## 6. Old vs new: what changes for HR

| Area | Old (`roster_attendance`) | New (`hr_attendance_builder`) |
|---|---|---|
| Shift definition | Pattern = name, start/end hour, grace, manual "night" box, optional N-on/M-off cycle. Code is only morning/evening/night/flexible | **Shift** = letter code (M, E, N…), color, start → end hour. **"Ends next day" is automatic** when end ≤ start. Optional break, check-in/out windows, night settings |
| Weekly / rotating schedule | 4 engines: department roster with 2 off days, per-employee D/N/O cycle, rotation groups, fixed Working Schedule | **Pattern** = a weekly layout (7 slots) or a cycle (1–28 slots) of shifts and OFF. **Rotation** = a pattern sequence for a team, where members start at different slots |
| Who follows what | A roster per department(s) with a line per employee; a cycle per employee; rotation members; a fixed flag | **Assignment** of a pattern (or rotation) to an **employee, a team or a department**, with a date range. Employee beats team beats department (§9.4) |
| Approval of schedules | Roster states draft → submitted → approved; re-approval rebuilds the lines | Assignment states draft → active; changes regenerate **future** days only and keep manual edits (R17) |
| Teams & supervisors | None. Department manager + HR groups ("Duty Manager" = HR user) | **Teams** with a **supervisor** who approves the team's swaps and sees its results |
| OT rules | One company config: 1.25 / 1.5 (holiday 2.0 and night 1.5 unused) + tardiness brackets | Company defaults (same values) **+ per-department overrides**, **OT enabled per department**, **OT eligible per employee**, optional real holiday and night rates |
| Night shifts | Night box; noon-to-noon window; "night allowance eligible" flag only | **Night rule**: night window (e.g. 22–06), optional night premium and night-OT rate, minimum rest after a night, attribution to the start date, holiday split |
| Swaps | Employee↔employee swap request; self off-day change for a date range; quick HR swap | Same three, plus **scope = week only / month only** (validated), "pay as OT" option, supervisor approval with notifications |
| Daily record | `roster.line`, duplicates possible | `attendance.builder.day`, **one row per employee per date**, the same fields and statuses, plus a stored explanation |
| Reports & emails | Excel via xlsxwriter, fixed formats | **Same formats**, ported. Company name and sender no longer hard-coded |
| UI | OWL screens + many list/form views | **Svelte** app inside Odoo (mobile-friendly builder, roster grid, control panel, overview) + standard Odoo views for configuration |

---

## 7. Phase 0: verify the map, measure, and report

Produce these files and **stop**:

1. **`docs/OLD_MODULE_INVENTORY.md`**: a plain-language description of every menu, screen, button, wizard, report, cron and rule, written for an HR manager. Start from §3 and §4 and correct anything that is wrong. Cite file:line for each rule.
2. **`docs/DIFF_OLD_VS_NEW.md`**:
   - A feature-parity checklist: every old feature → Rebuild / Port / Replace / Drop (drop needs approval).
   - The area table from §6, completed.
   - The P1–P16 confirmations, with anything new you find.
   - The exact differences between the Payroll netting and the Period Balance netting (R11).
3. **`docs/OPEN_QUESTIONS.md`**: at least these questions for HR:
   - Q1: Should a worked holiday use the holiday factor (2.0) or keep 1.5 (P4)?
   - Q2: Should unpaid leave ("UL") be paid leave or unpaid off (P6)?
   - Q3: Should the night OT rate and night premium be used, and for which departments?
   - Q4: Should company public holidays from the Odoo calendar create holiday windows automatically (P1)?
   - Q5: Do teams already exist informally (shift crews, station teams)? Who are the supervisors?
   - Q6: Should swaps between two employees also be limited to week/month scope?
   - Q7: Should "banked OT" (from the subtract-negative-balance flag) become a stored balance?
   - Q8: For a department or employee with OT switched off, should extra time be unpaid, or paid flat at 1.0×?
   - Q9: A worked **plain** (not overtime-eligible) holiday currently shows OT 0 but pays Final = worked × 1.5 (R9). Is that intended?
4. **`docs/DATA_PROFILE.md`** (from `prod_ref`):
   - Record counts per model.
   - Duplicate (employee, date) rows.
   - Lines per `line_source`.
   - Patterns with end < start and the night box unticked (P2 victims).
   - Midnight-start shifts (P3).
   - Missing-punch distribution (P15).
   - Future-dated punches.
   - Holiday assignments.
   - Credit usage.
5. **Run the old test suite** on Odoo 19 in Docker and record the result. Failing old tests must be understood before we treat them as the specification.
6. **Snapshot the old numbers.** From `prod_ref`, export the stored day results to `backups/golden/` (gitignored, one CSV per payroll period) for the last three closed periods: every `roster.line` with required, payable, status, OT, shortage, Final and Deduction, plus the old Payroll / Period Balance Excel files generated from the copy. These are the reference for the golden master (§14).
7. **Recompute check on the copy.** On `prod_work`, run the old module's own "force recompute" for one closed period. Compare the result with the snapshot. If the old module doesn't reproduce its own stored numbers (stale stored values, code changed since), **report it**: the golden master must then compare against the recomputed values, and HR must be told which numbers are real.

Run the old test suite in a separate empty database `legacy_test`. **Never connect anything to the live production server.** Only the neutralised clones are used.

---

## 8. Environment: Odoo 19 Community in Docker

```
.
├── CLAUDE.md
├── docker-compose.yml
├── config/odoo.conf
├── addons/hr_attendance_builder/
├── legacy/roster_attendance/          ← old module (read-only reference)
├── frontend/                          ← Svelte + Vite
├── backups/                           ← DB copy (gitignored)
├── tools/golden_master/               ← old-vs-new comparison scripts
├── docs/ (mockup/, OLD_MODULE_INVENTORY.md, DIFF_OLD_VS_NEW.md, OPEN_QUESTIONS.md, DATA_PROFILE.md, DECISIONS.md, CHANGELOG.md)
└── Makefile
```

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16
    environment: { POSTGRES_USER: odoo, POSTGRES_PASSWORD: odoo, POSTGRES_DB: postgres }
    volumes: [pgdata:/var/lib/postgresql/data, ./backups:/backups]
  odoo:
    image: odoo:19.0                      # official image = Community
    depends_on: [db]
    ports: ["8069:8069"]
    environment: { HOST: db, USER: odoo, PASSWORD: odoo, TZ: Asia/Damascus }
    volumes:
      - ./addons:/mnt/extra-addons
      - ./legacy:/mnt/legacy-addons
      - ./config:/etc/odoo
      - odoo-data:/var/lib/odoo
    command: ["odoo", "--dev=reload,qweb,xml"]
volumes: { pgdata: {}, odoo-data: {} }
```

```ini
# config/odoo.conf
[options]
admin_passwd = change-me
db_host = db
db_user = odoo
db_password = odoo
addons_path = /mnt/extra-addons,/mnt/legacy-addons,/usr/lib/python3/dist-packages/odoo/addons
```

**Using your copied containers.** Prefer running the copy with the compose file above:
1. Dump the copied database (`pg_dump -Fc`) to `backups/prod.dump`.
2. Restore it as `prod_copy`, then clone it into `prod_ref` and `prod_work` (`createdb -T prod_copy …`).
3. Copy the filestore into the `odoo-data` volume under `filestore/<dbname>`.

If you'd rather keep running the copied containers as they are, that's fine too. Just make sure that:
- the new `addons/` and `legacy/` folders are mounted into them,
- §0.2 has been applied,
- and the copied container's own restart policy and ports don't clash with this compose file.

Write down which option was used in `docs/DECISIONS.md`.

The old and new modules may be installed in the **same** database (`prod_work`) for the parallel run (§14). They use different model names, so they won't collide.

```makefile
DB ?= builder_dev
up:          ; docker compose up -d
logs:        ; docker compose logs -f odoo
install:     ; docker compose exec odoo odoo -d $(DB) -i hr_attendance_builder --stop-after-init
update:      ; docker compose exec odoo odoo -d $(DB) -u hr_attendance_builder --stop-after-init
test:        ; docker compose exec odoo odoo -d $(DB)_test -i hr_attendance_builder --test-enable --test-tags /hr_attendance_builder --stop-after-init
test-legacy: ; docker compose exec odoo odoo -d legacy_test -i roster_attendance --test-enable --test-tags /roster_attendance --stop-after-init
restore:     ; docker compose exec db bash -c "createdb -U odoo prod_copy && pg_restore -U odoo -d prod_copy --no-owner /backups/prod.dump"
neutralise:  ; docker compose exec db psql -U odoo -d $(DB) -f /backups/neutralise.sql
clone-ref:   ; docker compose exec db createdb -U odoo -T prod_copy prod_ref
clone-work:  ; docker compose exec db bash -c "dropdb -U odoo --if-exists prod_work && createdb -U odoo -T prod_ref prod_work"
engine-test: ; docker compose exec odoo python3 -m pytest /mnt/extra-addons/hr_attendance_builder/engine/tests -q
```

BioTime credentials stay in `ir.config_parameter` (as in the old `res_config_settings.py`). **Never put them in code or git.** On the copies they are blanked (§0.2).
- To test the BioTime port, use the ported tests (they mock the API), or a recorded JSON fixture.
- A live, **read-only** BioTime call is allowed only if the human explicitly asks for it. It must use a **separate** watermark, so the real server's sync state is never moved.

Save the SQL from §0.2 as `backups/neutralise.sql` and run `make neutralise DB=<clone>` on every new clone **before starting Odoo on it**.

---

## 9. Target data model

Prefix: `attendance.builder.*`.

### 9.1 `attendance.builder.shift` (normal shifts and overnight shifts)

| Field | Notes |
|---|---|
| `name`, `code` (1–3 chars, unique per company, `OFF` reserved), `color`, `active`, `company_id` | The code is the letter on the tiles |
| `start_time`, `end_time` | Float hours 0–24, entered as **"from hour to hour"** |
| `crosses_midnight` | Computed: `end_time <= start_time` → **ends the next day** (16 → 4 = 16:00 today to 04:00 tomorrow) |
| `span_minutes` | Computed, overnight-safe (16 → 4 = 720) |
| `break_minutes` | **Default 0** (old behavior: required = full span) |
| `required_minutes` | `span − break` (overridable, e.g. a 12h shift that HR counts as 11h) |
| `grace_minutes` | Optional, the shift-level step in the grace chain (R4 step 3) |
| `checkin_window_before`, `checkout_window_after` | Minutes. They define the matching window (§10.2). Defaults: 180 / 360 |
| `is_night` | Computed: crosses midnight **or** ≥ 50% inside the night window. Overridable |
| `night_rule_id` | Optional override (§9.2) |

The UI must show "**ends next day**" as soon as end ≤ start. Store the times as floats like the old code did, but **never** as values above 24.

### 9.2 `attendance.builder.night.rule` (night-shift customization)

| Field | Default | Meaning |
|---|---|---|
| `window_start` / `window_end` | 22.0 / 6.0 | Which hours count as night hours |
| `premium_enabled`, `premium_rate` | False, 0.25 | Extra pay on night minutes. This is **not OT** (a new feature; off = old behavior) |
| `night_ot_rate` | empty | If set, OT minutes inside the night window use this rate instead of the normal rate (resolves P4 when HR enables it) |
| `allowance_flag` | True | Keeps the old `night_allowance_eligible` flag for reports |
| `attribution` | `start_date` | An overnight shift belongs to the date it starts |
| `min_rest_minutes` | 660 | Warn when the next shift starts sooner than this after a night shift |
| `holiday_split` | False | Minutes after midnight on a holiday use the holiday rules |

Resolution: shift → department → company default.

### 9.3 `attendance.builder.pattern` (+ `.line`)

- `type`:
  - `weekly`: 7 slots, Sun → Sat, **any number of OFF days**.
  - `cycle`: 1–28 slots, with an `anchor_date`. This covers the old N-on/M-off patterns and D/N/O cycles.
- Each slot holds a `shift_id`; empty means OFF.
- Computed `avg_weekly_minutes`.
- Helper: `shift_for(date, anchor_override=None)`. Use correct modulo arithmetic for dates before the anchor; the old `rotation_math.py` tests show the expected behavior.

### 9.4 `attendance.builder.assignment` (assign to employee, team or department)

| Field | Notes |
|---|---|
| `pattern_id` **or** `rotation_id` | Exactly one |
| `target_type` | `employee` / `team` / `department` |
| `employee_id` / `team_id` / `department_id` | Matching the target type |
| `include_sub_departments` | For department targets |
| `date_from`, `date_to` (optional) | Effective range |
| `anchor_override` | Staggered start for a group's cycle |
| `grace_minutes` | Optional. Replaces the old roster-line grace (R4 step 3) |
| `state` | `draft` / `active` / `ended`, with chatter |

**Resolution for (employee, date), first match wins:**
1. day override
2. approved swap / self off-day change
3. temporary pattern change
4. employee assignment
5. team assignment (primary team)
6. department assignment (nearest department first)
7. **fixed fallback** from the employee's `resource.calendar`. This replaces the old `use_fixed_schedule` engine: required = `fixed_required_minutes` for compatibility.
8. otherwise OFF

Two active assignments on the same target must not overlap.

**"Change from date" (a mid-period switch, a real case from HR).** A department's schedule is approved for the 1st–30th and punches are already imported. From the 15th, the department moves to night shifts.

In the old module (verified in `models/roster_shift.py`):
- Re-approving the roster regenerates **every** day of the period from the current pattern (`_regenerate_lines`). Only HR marks are kept (`_REGEN_KEEP`), so the 1st–14th would become night days too.
- The per-employee "Rebuild Days" only starts **today** (`_generation_start`), works **one employee at a time**, and is limited to HR managers.
- So HR ends up resetting to draft, then rebuilding, then creating a second roster for the rest of the month.

The new module must make it one action:
- On a department, team or employee, choose **"Change pattern from [date]"** → pick the pattern → see a preview → confirm.
- This **ends the current assignment on date − 1** and **creates a new one from that date**. Past assignments are never edited, so history is visible ("Day shift 1–14, Night from 15").
- Days before the date are not touched. Days from the date are regenerated. Manual edits (leave, credits, swaps, holidays, cancelled OT) and employees' own off days are kept.
- **Punches are never deleted and never need re-importing.** Affected days are recomputed from the existing `hr.attendance`, and the overnight matching (§10.2) re-assigns a 07:00 check-out to the right night.
- The date may be in the past, but only inside an **open** payroll period. It may also be in the future.
- **Preview:** "14 employees, days 15–30. 9 days already have punches and will be recomputed. 3 manual edits kept. 2 employees have their own pattern and are not affected."
- The same action exists for a single employee and for "until [date]" (a temporary block), which is §9.6 `temp_pattern` without the week/month limit, for HR use.

**Employee off-day override (lighter than a full employee pattern).** Most staff follow their department's shifts but have **their own weekly off days** (the old `day_off_1/day_off_2` per employee line).

Model: `attendance.builder.offday.override`
- fields: `employee_id`, `off_weekdays` (any set of Sun..Sat), `date_from`, `date_to` (optional), `reason`
- **Days come from the employee, shifts come from the department pattern.**

Applied **after** steps 4–6 have chosen the pattern:
- If the employee's weekday is in `off_weekdays` → OFF.
- If the pattern had OFF on a weekday that is **not** in `off_weekdays` → a work day with the pattern's `default_work_shift_id`. This is a new field on `pattern`, defaulting to its most-used shift.
- Weekly patterns only. For cycle patterns, use `anchor_override` on an employee assignment to shift the employee's position in the cycle instead.
- Steps 1–3 (day override, swaps, temporary changes) still win over it.

The builder shows each employee row as "follows department: Morning Sun–Thu" with their own off-day chips that can be toggled. Overridden days are marked, and a "reset to department" action is available.

Migration: each old `roster.employee.line` whose off days differ from the department's most common pair becomes an off-day override.

**The assignment screen must preview the effect:** "Applies to 14 employees. 3 have their own employee pattern, which still wins. 2 have manual edits in this range, which will be kept."

### 9.5 `attendance.builder.rotation` (replaces rotation groups)

- An ordered list of slots. Each slot is a pattern, or an off-day set.
- A period length: N days, or a calendar month.
- Members with their start slot. Each period, every member moves one slot forward.
- It is assigned to a **team**.
- Port the old `rotation_math.py` (it is pure and tested) and its tests.

### 9.6 `attendance.builder.change` (swaps and temporary changes)

| `type` | Meaning | Rules |
|---|---|---|
| `emp_swap` | Employee A's work day ↔ employee B's off day (old `roster.swap.request`) | Same date, A works and B is off. After the swap: A is `swap_off`, B is `swap_on` (R12) |
| `self_offday` | Move my off day to another day (old self off-day request) | **scope = week** (both days in the same ISO week) or **month** (same calendar month). Optional repeat for a date range, as in the old request |
| `temp_pattern` | Use another pattern for one full week or one full month | Period auto-set |
| `day_override` | Set one date's shift manually (roster drag & drop) | — |

Common fields: `employee_id`, `other_employee_id`, dates, `scope`, `paid_as_ot`, `reason` (required), `state` (draft → submitted → approved → applied / refused), `approver_id`, chatter, `mail.activity` for the approver.

Working one's own off day with no approved change sets `is_unauth_swap` (R12).

### 9.7 Rules: `attendance.builder.rule` (company default + one per department)

An empty field on a department rule falls back to the company default. The company defaults equal the old `roster.overtime.config` values.

| Field | Company default (= old) |
|---|---|
| `ot_enabled` | True |
| `normal_ot_factor` | 1.25 |
| `offday_ot_factor` (old "weekend") | 1.50 |
| `holiday_ot_factor` | 1.50 (**old behavior**. 2.0 only if HR answers Q1) |
| `offday_work_paid_when_no_ot` | False (only used when OT is off; see Q8) |
| `late_grace_minutes` | taken from the department's current value |
| `tardiness_brackets` | 30→60, 60→120, 120→240, more→540 |
| `delay_surplus_is_ot` | False (R8: make-up time) |
| `early_arrival_counts_as_ot` | True (R8) |
| `ot_gate_period` | True (R11) |
| `shortage_eats_cheapest_first` | True (R11) |
| `commute_credit_biotime` | department value (R16) |
| `friday_prayer_credit_minutes` | 60 (R15) |
| `night_rule_id` | company night rule |
| `payroll_period_start_day` | 21 |

On `hr.employee`, keep the old fields (§3.2) and add:
- `ot_eligible` (default True). When False (or when the department has `ot_enabled` = False), the extra minutes are computed and shown as `unpaid_extra_minutes`, but they add **nothing** to Final/Deduction:
  - On a work day, Final is capped at required + credits.
  - On an off day, worked minutes are not paid unless the rule `offday_work_paid_when_no_ot` = True (then they're paid 1.0×).
  - **Ask HR (Q8)** whether "no OT" should mean "extra time unpaid" (the default above) or "extra time paid flat 1.0×".
- `primary_team_id`.

### 9.8 `attendance.builder.day` (the daily record; replaces `roster.line`)

- **Unique (employee_id, date).**
- Field groups mirror `roster.line`: identity, plan source, schedule, swap tracking, punches, break, payable, arrival, tardiness, status, diff/OT, OT cancel, display, manual state, credits, top-up, unpaid sick, approval, manual correction, unauth swap, payroll warning, email tracking, review verdict, payroll bridge, pivot flags.
- Keep the **same selection values** for `attendance_status` and `manual_state`, so the ported reports and emails keep working.
- New fields: `plan_source` (override / swap / temp / employee / team / department / rotation / calendar), `shift_id`, `night_minutes`, `night_premium_minutes`, `ot_night_minutes`, `unpaid_extra_minutes`, `explanation` (JSON with every step, rate and rule used), `needs_recompute`.

### 9.9 Holidays, leave mapping, training, BioTime, imports

- **Holidays:** keep `holiday` (window, days allowed) + `holiday.assignment` (employee, date, `is_overtime`) with the same validation. Fix P1.
- **Leave mapping:** add `attendance_state` on `hr.leave.type` (leave / sick / mission / unpaid_off / ignore). The migration seeds it from the old code map; HR edits it in the UI.
- **Ported subsystems** (L–Q in §3.1): keep their models, renamed to the new prefix, and point them at `attendance.builder.day`.

---

## 10. The engine (pure Python)

### 10.1 Layout

`engine/` contains no Odoo imports:
- `types.py`: dataclasses `ShiftSpec`, `Plan`, `Punch`, `RuleSpec`, `NightRule`, `DayInput`, `DayResult`, `PeriodResult`
- `resolve.py`: plan resolution (§9.4)
- `match.py`: assigning punches to shift dates (§10.2)
- `day.py`: R1–R10
- `period.py`: R11, with explicit "payroll" and "period balance" modes if Phase 0 confirms they differ
- `night.py`: night minutes, premium, night OT split
- `tests/`

`services/` is the ORM adapter: it loads the inputs, calls the engine, writes `attendance.builder.day`, and queues recomputes.

### 10.2 Matching punches to a shift date (overnight-safe)

- **Timezone:** employee `tz` → company `tz`. Convert the UTC punches to local time first.
- **Planned shift window** for date D: `[D + start − checkin_window_before, D + start + span + checkout_window_after]`. The end may fall on D+1.
- A punch belongs to the planned shift whose window contains its **check-in**. If two windows overlap, choose the shift whose start is nearest. For an **off day**, use the old local-day window (or noon → noon if the previous day was a night shift).
- One `hr.attendance` record is never split across two dates.
- **BioTime / staging pairing uses the same windows.** Group the raw punches by (employee, planned shift), then pair them in time order inside each window. Punches outside every window go to HR review. On a planned off day, fall back to calendar-day pairing (the old behavior).
- **Never leave an open `hr.attendance` that blocks later imports.** Odoo refuses a new check-in while an earlier record has no check-out ("already checked in"). A lone punch is kept on the day as `missing_info` (staging row + day explanation). An `hr.attendance` without a check-out is created only if it is the employee's latest punch.
- A missing check-out → `missing_info`. **Never invent a check-out.**
- **Compatibility:**
  - For day shifts, the result must equal the old calendar-day window.
  - For overnight shifts that start in the evening, it must equal the old noon-to-noon window.
  - Differences are expected only for midnight-start shifts (P3). Document them with a test.

### 10.3 Lateness on overnight shifts

Compare **full datetimes**, not clock-face minutes. Lateness = check-in − (D + start), so a 23:50 check-in for a shift starting at 00:00 on D is 10 minutes early, not 23 hours late.

### 10.4 OT eligibility and night extras (new; old behavior when off)

```
if not rule.ot_enabled or not employee.ot_eligible:
    unpaid_extra_minutes = the OT minutes the old rules would give
    overtime_minutes = 0
    work day: Final = min(Final, required + credits)
    off day:  Final = worked × 1.0 if rule.offday_work_paid_when_no_ot else 0   (see Q8)
night_minutes = worked minutes inside the night window (stored always)
if night_rule.premium_enabled: night_premium_minutes = night_minutes × premium_rate (separate column, not OT, not in Final)
if night_rule.night_ot_rate: the OT minutes inside the night window use night_ot_rate instead of normal_ot_factor
```

"OT minutes" on a work day are the minutes before the planned start (if early arrival counts) and after the planned end.

### 10.5 Recompute

- Each `hr.attendance` create/write/unlink **marks** the affected (employee, date) days `needs_recompute`.
- A short cron (every minute) recomputes them in batches. HR screens also have a "Recompute now" button.
- A full recompute is available per period and department.
- Changes to rules, assignments or shifts mark the affected future days, and past days only in open periods.

---

## 11. Test plan

1. **Port the old tests.** Translate every relevant test file in `legacy/roster_attendance/tests/` to the new models. They must pass. Any test that can't be ported needs a line in DIFF_OLD_VS_NEW.md.
2. **Engine unit tests:** G1–G8 (§4.1) as pure tests.
3. **New-feature tests** (defaults: grace 12, factors 1.25/1.5, night window 22–06):

| # | Case | Expected |
|---|---|---|
| N1 | Shift **16:00 → 04:00** (crosses midnight, required 720), punches D 15:55 → D+1 05:10 | One day on D. Worked 795, OT 75 (early arrival counts), Final 813.75, Ded +93.75, night_minutes 430 |
| N2 | N1 with `night_ot_rate` 1.5 | The 70 OT minutes after 04:00 are night OT at 1.5 and the 5 before 16:00 are normal at 1.25. Weighted 111.25 |
| N3 | Shift 16:00 → 04:00, no punches | absent on **D**, nothing on D+1 |
| N4 | Shift 16:00 → 04:00, D 16:02 in, no out | missing_info on D. No invented check-out, OT 0 |
| N5 | Shift **00:00 → 08:00** on D, punches D−1 23:50 → D 08:05 | Belongs to D, coming +10, not late (P3 fix) |
| N6 | Shift 16 → 4 created with night "unticked" | Still required 720 (P2 fix) |
| N7 | Night shift ends 04:00, next planned shift starts 10:00 the same day | Rest warning (6h < 11h) |
| N8 | Back-to-back 12h nights 19:00→07:00 on Mon and Tue; punches Mon 18:50→Tue 07:05, Tue 18:55→Wed 07:10 | Two separate days (Mon, Tue), each worked 735/735. The Tue 07:05 check-out belongs to Mon, the Tue 18:55 check-in belongs to Tue |
| N9 | Night 19:00→07:00 starting on the 20th (the last day of a payroll period) | The whole shift counts in the period that ends on the 20th, even though it ends on the 21st |
| N10 | Cycle `D,D,N,N,O,O,O,O` (D 07–19, N 19–07, 12h each) | Weekly required varies (36h / 48h…) with the real schedule; no false shortage or OT from a fixed weekly target. Moving from D to N leaves ≥ 24h rest, so no warning |
| N11 | BioTime punches for a 19:00→07:00 worker: Mon 18:58, Tue 07:04, Tue 18:55, Wed 07:10 | Two records: Mon 18:58→Tue 07:04 and Tue 18:55→Wed 07:10. No fake Tue 07:04→18:55 pair, no "already checked in" error, nothing left as "comparison only" |
| N12 | The same team works Day one week and Night the next (no setting changed by anyone) | Night days are detected from the shift times alone. Required 720 on both, correct matching on both |
| A1 | Department pattern A, team pattern B, employee pattern C | Resolves C; remove C → B; remove B → A |
| A2 | Department assignment with `include_sub_departments` | Child-department employees follow it unless they have their own |
| A4 | Department pattern Morning Sun–Thu, Fri+Sat off; employee off-day override Sat+Sun | Employee: Sun OFF, Mon–Fri Morning, Sat OFF. A colleague without an override keeps Fri+Sat off. Changing the department shift to 07:00 changes both employees' work days |
| A5 | Department on Day pattern 1st–30th, punches imported up to the 20th; "Change from the 15th" to Night pattern | Days 1–14 unchanged (same numbers as before). Days 15–30 are night days, recomputed from the existing punches (no re-import, no punch deleted). Manual edits on days 15–30 kept. Two assignments visible (until 14th / from 15th). Changing from a date inside a **closed** period is refused |
| A3 | A changed assignment while days have manual states/credits | The manual edits survive (R17) |
| S1 | `self_offday` week scope with dates in different ISO weeks | Validation error |
| S2 | `emp_swap` A↔B approved | A `swap_off` required 0, B `swap_on` required = B's shift. If A works it: ×1.5 |
| S3 | Swap with `paid_as_ot` | The moved work day: required 0, all worked minutes at the off-day factor |
| O1 | Department `ot_enabled` = False, G5 punches | OT 0, unpaid_extra 108, Final 540, Ded 0 (default "unpaid"). With Q8 = "flat": Final 648, Ded +108 |
| O2 | Employee `ot_eligible` = False | Same as O1 for that employee only |
| H1 | Overtime-eligible holiday assignment (required becomes 0), worked 600 | OT 600 at the holiday factor (1.5 by default, = old) → Final 900, Ded +900. Not worked → Final 0, Ded 0 |
| T1 | Two employees with a duplicate day in old data | The migration keeps one and reports the other |

4. **Golden master** (§14) on real data.

---

## 12. Svelte UI inside Odoo

### 12.1 Architecture

- Svelte 5 + Vite in `frontend/`. The build goes to `static/dist/` (committed).
- A small OWL wrapper mounts it as a client action (`web.assets_backend`).
- JSON controllers in `controllers/api.py` (`type='json'`, `auth='user'`). Access is enforced by the ORM; never `sudo()` the reads.
- Endpoints: `roster`, `preview_pattern`, `assign` (with `dry_run` preview), `change`, `day_detail` (returns the explanation), `day_edit` (the Control Panel actions), `overview`, `report_preview`.
- Dev: the Vite dev server proxies to `http://localhost:8069`.

### 12.2 Screens

| Screen | Replaces (old) | Must have |
|---|---|---|
| **Pattern Builder** | Roster Builder (OWL), roster form, cycle form, rotation form | 3 steps (see mockup): name + type → fill days (tap-to-paint, drag & drop, presets, shift legend, "＋ New" shift with **"ends next day"** hint) → **assign to employee / team / department** with date range + effect preview |
| **Shift form** | Pattern form | "From hour → to hour", automatic overnight label, break, required override, windows, night section |
| **Roster grid** | Daily Records list, Quick Swap | Employee × day grid with letters + status dots. Drag a shift onto a day (override). Drag work ↔ off in a row (self swap) or across two rows on the same date (employee swap). Long-press on touch. Tap for the day explanation |
| **Control Panel** | Attendance Control Panel | Fast per-employee day editor: manual state, credits, cancel/restore OT, set required/off day, manual times, tardiness apply |
| **Overview** | Attendance Overview | Cards per roster/team/department/employee, using the **same** period figures as the reports (R10) |
| **Approvals** | Swap / self off-day lists | Supervisor inbox, approve/refuse, week/month scope shown |
| **Department rules** | Overtime Config | Company defaults + department overrides, **OT enabled switch**, night rule |
| **Teams** | — | Supervisor, members, primary team, rotation assignment |
| **Attendance Patterns** | Same | HR-manager only, read-only (R18) |

Keep the standard Odoo list/form views for configuration, imports, BioTime, training, holidays and reports, so admins have a fallback for everything.

Mobile: works at 360px, touch targets ≥ 44px, sticky save bar, no page-level horizontal scroll, readable header controls.

---

## 13. Security

| Group | Can |
|---|---|
| `Attendance / Employee` (`base.group_user`) | Read their own days and requests; create self off-day and swap requests |
| `Attendance / Supervisor` (**new**) | Their teams: read days, approve/refuse changes, view team OT |
| `Attendance / HR Officer` (= old `hr.group_hr_user`) | Department scope as today, the Control Panel, imports, reports |
| `Attendance / HR Manager` (= old `hr.group_hr_manager`) | Everything: rules, shifts, patterns, assignments, Attendance Patterns, period close |

- Record rules are based on team membership and department, **not** on `create_uid` (P12).
- Payroll-affecting fields can be written only by HR Officer and above. Review fields can be written by reviewers (port `tests/test_employee_review.py`).

---

## 14. Migration, parallel run and cut-over

1. **Migration script** (`tools/migrate_from_roster_attendance.py`, run with `odoo shell`). Mapping:
   - patterns → shifts (+ cycle patterns for `use_cycle`)
   - cycles → cycle patterns + employee assignments
   - rotation groups → rotations + team assignments (each group becomes a team)
   - roster employee lines → employee assignments (with date range and grace)
   - fixed-schedule employees → calendar fallback
   - `roster.line` → `attendance.builder.day`, **with every manual field**
   - swap/self-offday requests, holidays + assignments, overtime config → company rule + department rules, aliases, BioTime data, training, email logs, export layout
2. **Golden master:** for the last **three closed payroll periods** (21st → 20th), recompute with the new engine and compare against the old stored values, per employee per day: required, payable, status, OT, shortage, Final, Deduction. Then compare per period: the Payroll grand total, the Period Balance per employee, and the email cube. Output `docs/GOLDEN_MASTER_REPORT.md` listing each difference and its reason (old bug / intended change / new bug).
3. **Migration rehearsal** on `prod_work` (re-cloned from `prod_ref` each time): install the new module, run the migration, run the golden master, and record the duration and any errors. Repeat until it runs clean twice in a row. That proves the real cut-over will work.
4. **Parallel run:** with both modules on `prod_work`, import the same punch files for one full period into both. HR compares the reports side by side.
5. **Cut-over at a period boundary (the 21st).** Take a fresh backup of the live system first, and run the same migration that was rehearsed. Freeze the old module (menus hidden, crons off), switch the BioTime cron and imports to the new module, and keep the old data read-only. Uninstall the old module only after HR signs off on a closed period.

---

## 15. Module structure

```
addons/hr_attendance_builder/
├── __manifest__.py          # 19.0.1.0.0; depends: base, mail, resource, hr, hr_attendance, hr_holidays
├── engine/                  # pure python + tests (golden numbers, night, resolution, netting, rotation math)
├── models/                  # shift, night_rule, pattern, rotation, assignment, team, change, rule, day,
│                            # holiday, hr_employee, hr_department, hr_leave_type, hr_attendance, hr_leave
│                            # + ported: biotime_*, raw_attendance_log, import_alias, work_location,
│                            #   training_*, email_*, export_layout, entry_template
├── services/                # recompute queue, generation, ORM↔engine adapter
├── wizard/                  # ported import / bulk day action / review / reports / BioTime wizards
├── reports/                 # ported xlsx builders (payroll, department, period balance, monthly summary)
├── controllers/api.py
├── security/
├── views/  data/
├── static/dist/  static/src/owl/mount.js
├── migrations/
└── tests/                   # ported legacy tests + new feature tests + security + API
```

---

## 16. Phases and acceptance criteria

| Phase | Deliverable | Done when |
|---|---|---|
| **0** | Inventory, diff, open questions, data profile, legacy test run | The human approves; every old feature has a decision |
| **1** | Docker env, empty module, shifts + night rules + patterns + rules (backend views) | 16 → 4 shows "ends next day", required 720 (N6) |
| **2** | Engine (pure) + G1–G8 + N1–N7 + O1–O2 | All engine tests pass |
| **3** | Assignments (employee/team/department), teams, rotations, day generation, recompute queue | A1–A3 pass; ported rotation tests pass |
| **4** | Changes (swaps, self off-day week/month, temp pattern, override), holidays, leave sync, credits/overrides, Control Panel actions | S1–S3, H1 pass; ported swap/holiday/training/override tests pass |
| **5** | Port BioTime, import, entry template, export layout, training, emails | Their ported tests pass (incl. all 57 BioTime tests) |
| **6** | Port the Excel reports + period netting | Reports match old formats column-for-column; netting tests pass |
| **7** | Svelte UI (§12) + security (§13) | All screens work on desktop and at 360px; security tests pass |
| **8** | Migration + golden master + parallel run | GOLDEN_MASTER_REPORT has every difference explained and approved |
| **9** | Cut-over | One closed period signed off by HR in the new module |

**Global definition of done:**
- `make test` is green.
- No Enterprise reference (`grep -rnE "'planning'|planning\.slot|hr_payroll|web_studio|web_enterprise|x_studio" addons/` returns nothing).
- No hard-coded timezone, company name or email address.
- Every number on screen can be explained from the day explanation.
- The docs are updated.

---

## 17. Glossary

- **Shift date:** the date a shift starts on. Overnight shifts belong to it.
- **Required:** the planned minutes for the day (the full span by default; 0 on off days and holidays).
- **Payable / worked:** punched minutes minus the import-detected break.
- **Coming:** scheduled start − check-in (+ means early, − means late).
- **Grace / forgiven minutes:** lateness inside grace. It is paid, but never counts as OT.
- **Bracket:** the tardiness deduction for lateness beyond grace. It applies only when HR ticks the box.
- **Credit:** paid minutes (mission/leave/sick/training) that reduce shortage and never create OT.
- **Final Works:** the paid minutes for the day after all rules.
- **Deduction/Extra Pay:** Final − required. Every report sums this field.
- **OT gate:** period OT is paid only when the period's required time is met.
- **Make-up time:** surplus on a late-beyond-grace day. It is paid flat, not as OT.
- **Swap on / swap off:** a day that became work / off through a swap.
- **Self off-day change:** moving your own off day, within one week or one month.
