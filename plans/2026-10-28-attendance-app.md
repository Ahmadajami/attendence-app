# Attendance App: monthly rosters, attendance and payroll exports

**Status:** in progress (approved 2026-10-28; ready for implementing agents)
**Date:** 2026-10-28
**Goal:** A local SvelteKit app, started from a copy of the Airport-Staff
project, that manages **departments, teams and employees**, plans **monthly
rosters** (days off that change and move every month), imports **punches
from files**, calculates every day with the **Odoo payroll rules**, and
exports the **Payroll Period** and **Period Balance** Excel files exactly as
Odoo does today. Odoo only sends the attendance emails, through a tiny
connector.

Overview with diagrams (EN/AR): `docs/architecture-guide.html`.
UI/feature reference: `docs/mockup/attendance-builder.html` (demo data).
History: replaces `Roster/plans/2026-10-28-sveltekit-attendance-app.md`
(same decisions, plus D23–D27).

---

## 0. Read this first (implementing agents)

1. Read `CLAUDE.md` (real-data rules are mandatory), this plan, then
   `docs/reference/BRIEF.md` §4, §10–§11 and `docs/reference/DIFF_OLD_VS_NEW.md` §4, §8.
2. Pick **one lane** (§11), use its branch, do its tasks in order, respect
   "Needs".
3. **Tick a box as soon as its "Done when" is true**; add `> note:` lines
   (counts and IDs only); commit the plan change with the work.
4. **Stop and ask the user** before: dropping/overwriting a database;
   deleting in `~/secure/syravia/`; any network exposure; changing the
   pre-commit hook beyond what a task says; anything an open question (§13)
   decides; touching the Roster repo outside Lane B.
5. Svelte: Svelte MCP `svelte-autofixer` on every touched `.svelte` /
   `.svelte.ts`; `get-documentation` for SvelteKit 3 / Svelte 5 APIs.

## 1. Decisions (with the user, 2026-10-28)

| ID | Decision |
|---|---|
| D14 | The UI and logic live in this standalone SvelteKit app, not in Odoo |
| D16 | Started from a copy of `/home/xxskullxx/Documents/Syravia-projects/Airport-Staff`, branch `roster`, commit `a99e348`, code only. Airport-Staff is never modified; never push to its remote |
| D17 | **No sign-in for now** (single user): `AUTH_MODE=local_single_user` serves loopback requests only and refuses to start unless bound to 127.0.0.1. The template's code login stays and is switched on before the facility server |
| D18 | Local Docker `postgres:16` on `127.0.0.1:5433`. No Neon, no Vercel, no cloud |
| D19 | **Odoo payroll rules win** (BRIEF §4) over the template's and the mockup's simplified rules, so both Excel files match Odoo |
| D20 | Facility: a separate server next to Odoo, internal network only |
| D22 | Teams are app-owned: one department each, a supervisor, dated members. Approver = supervisor, else the department manager, else HR |
| **D23** | **Separate repo** (this one), sibling of Roster. The Roster repo keeps the old module, the Phase 0 reports and the Odoo-side work |
| **D24** | **Punches come in by file** (CSV/XLSX import with preview), not by a live Odoo link. Re-importing is safe (no duplicates) |
| **D25** | **Employees and departments are extracted from Odoo once, then managed in the app** (the app becomes their master). Each keeps its Odoo id and badge so punch files and emails still match. Replaces the earlier D15/D21 split |
| **D26** | **Emails are still sent by Odoo** via the tiny `attendance_app_connector` module (one method, API key). The app calls it with the figures |
| **D27** | The Odoo-side pieces (connector, extraction tool) are built in the Roster repo, Lane B, under that repo's rules |

Still valid from Phase 0/1 (`docs/reference/DECISIONS_PHASE0_1.md`): D5 (four
HR levels, for when login returns), D7 (golden master: money/status vs
stored values, payable/missing_punch vs recomputed), D9 (department rules
override by section), D10 (sub-departments inherit), D11 (overrides via tick
boxes), D12 (shift grace 0 = not set).

## 2. What does what

| Concern | Odoo | Attendance App |
|---|---|---|
| BioTime punches arrive | ✅ (as today) | gets them by **file** |
| Employees, departments | source of the **one-time extraction** | **Master after import** (create, edit, move, deactivate) |
| Teams, supervisors, department settings | — | Owner |
| Shifts, patterns, monthly roster, days off, swaps | — | Owner |
| Holidays, manual states, credits, corrections | old data extracted once | Owner |
| Day results, period close | old `roster.line` = golden reference | Owner (TypeScript engine) |
| Payroll Period + Period Balance Excel | old files = golden reference | Owner, same columns and numbers |
| Attendance emails | **Sends** (connector, MailHog in dev) | builds the figures, calls Odoo |

## 3. Environment

```
 Odoo 19 (laptop: odoo-app 127.0.0.1:8069, DB syravia_night_shift)
   ├─ Roster/tools/attendance_app/extract.py ──▶ CSV files ──▶ ~/secure/syravia/imports/
   └─ attendance_app_connector  ◀── POST /json/2/attendance.app.mail/send_batch ──┐
        └─ mail → MailHog 127.0.0.1:8025                                          │
 Attendance App (this repo; pnpm dev 127.0.0.1:5173) ── import files ── engine ──┘
   PostgreSQL attendance-app-db 127.0.0.1:5433: attendance_app (real) · attendance_app_test (synthetic)
```

- Secrets: `~/secure/syravia/attendance_app.env` (`DATABASE_URL` password,
  `ODOO_URL`, `ODOO_DB`, `ODOO_API_KEY`). `.env` here is gitignored.
- Golden snapshot: `~/secure/syravia/golden/roster_lines_<from>_<to>.csv`
  (2026-07-21→08-20, 08-21→09-20, 09-21→10-20), `payroll_*.xlsx`,
  `period_balance_*.xlsx`, `recompute/`. Column list: `LINE_FIELDS` in
  `Roster/tools/golden_master/export_snapshot.py`.

## 4. The template: keep / change / remove

Template = Airport-Staff (`docs/template/CLAUDE.md` and
`docs/template/plans/` after S0.2): SvelteKit 3, Svelte 5 runes, pnpm,
`#lib`, Drizzle 0.45, Tailwind 4 + shadcn-svelte `lyra`, phosphor, superforms
+ zod 4, Paraglide en+ar (RTL done), service layer, insert-only `audit_log`,
RBAC, code login, teams + dated membership + supervisors, 1–28-day cycles
with versions by effective date, overrides/swaps, absences, append-only
attendance events, `src/lib/roster/` engine (63 tests), staff import with
preview (`import_batch`/`import_row`), employee/team pages with a 4-week
preview. No real data in its tracked files (scanned 2026-10-28).

| Keep | Change | Remove |
|---|---|---|
| stack, conventions, shell + RTL sidebar, i18n, error handling, service layer, audit, RBAC, code login (off, D17), teams/membership/supervisors, cycle versions, overrides/swaps, import preview machinery, employee/team pages | `neon-http` → `postgres.js` (31 `db.batch` → `db.transaction`); Vercel → `adapter-node`; env vars; `shift_kind` → **`shift` table** (D, N seeded); staff import → Odoo extraction format; attendance events → **corrections only**, punches in `punch`; template attendance/overtime rules → payroll engine; "team moves never backdated" → allowed **inside an open period** with reason + audit; hard-coded `Asia/Damascus` → timezone setting | flights, handling windows, staffing requirements, assignments, flight import/board/sheet, coverage, `overtime_approval`, Vercel/Neon files, template plans (kept only under `docs/template/`) |

## 5. Tech stack

SvelteKit 3 + Svelte 5 (runes), TypeScript, pnpm 11, Node 24 (`.nvmrc`),
`adapter-node`; PostgreSQL 16 + Drizzle 0.45 + `postgres.js`; superforms v3
+ zod 4; Tailwind 4, shadcn-svelte `lyra`, phosphor icons, svelte-sonner;
**ExcelJS** for the two payroll workbooks, `read-excel-file` for imports;
Paraglide en + ar; Vitest (pure, Node env) and Playwright (flows, synthetic DB).

## 6. File formats (the contract between Lane B and the app)

All CSV: UTF-8, comma, header row, ISO dates; instants in **UTC with `Z`**.
Produced by `Roster/tools/attendance_app/extract.py` (odoo shell, read-only,
rolls back) into `~/secure/syravia/imports/<YYYY-MM-DD>/`.

| File | Columns |
|---|---|
| `departments.csv` | `odoo_id, name, parent_odoo_id, manager_employee_odoo_id, active` |
| `employees.csv` | `odoo_id, badge, name, name_ar, department_odoo_id, tz, active, start_date, late_grace_minutes, subtract_neg_balance_from_ot, use_fixed_schedule, fixed_required_minutes, report_seq, reception_seq` |
| `punches_<from>_<to>.csv` | `odoo_id, employee_odoo_id, badge, check_in_utc, check_out_utc` (empty = missing check-out) |
| `shifts_old.csv`, `employee_lines_old.csv`, `cycles_old.csv` | old `roster.shift.pattern` / `roster.employee.line` (+ roster dates, off days, grace) / `roster.cycle` fields needed by S2.5 |
| `holidays_old.csv`, `holiday_assignments_old.csv` | windows (from, to, days allowed, type) / employee, date, is_overtime |
| `day_inputs_<from>_<to>.csv` | per approved `roster.line`: id, employee_odoo_id, date, planned start/end, required, is_weekly_off, is_public_holiday, holiday overtime flag, manual_state, credits (mission/leave/sick/training), topup, sick_unpaid, suppress_ot, tardiness_applied, break_minutes, swap state — the golden master inputs |

The punch importer also accepts (S1.4): the **Odoo standard Attendances
export (xlsx)** with a timezone picker, and later **BioTime raw transactions**
(single punches, paired by planned shift window, P18).

Import rules (BRIEF R15–R16): key = Odoo id when present, else (badge,
check_in) → re-import updates, never duplicates; unknown badge → held in
preview; never invent a check-out; merge an artificial midnight split;
reject spans > 16 h and **future-dated** punches (26 exist today); show
counts per outcome before commit; `import_row.raw` purged after 30 days.

## 7. Data model (app database)

Template tables kept: `user`, `session`, `login_attempt`, `role`,
`permission`, `role_permission`, `audit_log`, `team`, `staff_team_membership`,
`team_supervisor`, `app_setting`, `import_batch`, `import_row`, `absence`
(types: leave, sick, mission, training, excused, unpaid_off, ignore,
no_show), `attendance_event` (manual corrections only, reason required),
`shift_pattern`, `roster_override`.

| Table | Purpose |
|---|---|
| `department` | **app master**: name en/ar, parent, manager (staff), active, `odoo_id` (nullable, unique) |
| `staff` | **app master**: badge (`employee_no`), names en/ar, department, tz, active, start date, report/reception order, old flags (grace, subtract-negative-balance, fixed schedule), `odoo_id` (needed for emails) |
| `punch` | check_in/out UTC, staff, `odoo_id` or (badge, check_in) unique, source file batch |
| `shift` | code 1–3 (unique, `OFF` reserved), name en/ar, colour, start/end, **ends next day computed**, break (0), required (span − break, overridable), windows 180/360, night computed, grace (0 = not set). Seeds D 07–19, N 19–07 |
| `shift_pattern` | `shift_id[]` (null = off); weekly 7 slots Sun→Sat or cycle 1–28 + anchor; owner staff / team / department; versions by effective date |
| `roster_override` | one day: shift or off; `swap_group_id` |
| `department_setting` | OT enabled, approver fallback, weekly target (info); default pattern = a department-owned `shift_pattern` |
| `staff_schedule` | dated: follow (team → department) or own pattern, own off days (weekdays), crew start slot, `ot_eligible` |
| `period` | payroll period, start day 21 (setting), `open / closed / locked` |
| `offday_plan` | a month's off days for a team/department + employee exceptions; copy last month + rotate |
| `change` | `offday_swap`, `emp_swap`, `temp_pattern`, `day_shift`; scope week/month/day; `paid_as_ot`; reason; draft → pending → approved/rejected; approver (D22) |
| `day_manual` | credits, top-up, unpaid sick, cancel OT, tardiness applied, set required/off |
| `holiday`, `holiday_assignment` | window + days allowed; employee + date + overtime-eligible |
| `rule`, `night_rule` | company default + department sections (D9/D10): OT on/off, 1.25/1.5/1.5, grace 15, brackets 30→60/60→120/120→240/→540, delay surplus not OT, early arrival counts, OT gate, cheapest first, commute credit, Friday prayer 60; night 22→6, premium 0.25 off, night OT rate unused, min rest 660; mockup options OT basis daily (default) / weekly, minimum OT 0 |
| `day_result` | (staff, date) unique; all old `roster.line` figures + night minutes, premium minutes, OT night minutes, unpaid extra, `plan_source`, `explanation` JSON, `inputs_hash`, `needs_recompute`; frozen when the period is locked |
| `export_run`, `mail_batch` | exports and email batches: period, kind, hash, counts, Odoo result |

**Roster resolution (employee, date), first match wins:** absence/manual
state → `day_shift` → approved swap → temporary pattern → own pattern → team
pattern → department pattern (nearest first) → off. Then own off days
(weekly patterns, not for temporary ones) and crew start (cycles). Roster
computed; results stored.

## 8. Security

- `AUTH_MODE=local_single_user`: loopback requests signed in as the local
  admin; other addresses → 403; refuse to start unless bound to 127.0.0.1.
- Before S8: `AUTH_MODE=login`, HTTPS, template admin code `1234/123456`
  replaced, D5 roles.
- Logs: IDs and counts. Exports stream to the browser. DB in a Docker named
  volume. Import files read from `~/secure/syravia/imports/`, never copied
  into the repo.

## 9. Screens

| Route | Screen | Key interactions |
|---|---|---|
| `/` | Home | current period, last imports, to-do (missing punches, unpublished months, pending changes) |
| `/imports` | Imports | upload or pick a file, preview (new / updated / unchanged / held / rejected with reason), commit, history |
| `/dashboard` | 📊 Dashboard | KPIs, by department, top overtime |
| `/roster/[period]` | 📅 Roster (**core**) | employee rows × days 21→20 (+ week view); paint; drag work day → off day in a row = swap request; tap → day popup; status dots, 🌙, ⚠ short rest, swap/manual markers, today, source line; copy last month + rotate; publish; virtualised ~312 × 31; mobile one team |
| `/roster/[period]/plan` | Off-day planner | team/department off days, rotation preview, staffing per day |
| `/patterns` | 🧩 Pattern builder | 3 steps, presets, palette, paint/drag, cycle ≤ 28, 14-day preview, assign to employees/teams/departments with impact preview, saved cards |
| `/shifts` | ⏰ Shifts | table + create with live "ends next day" hint |
| `/departments`, `/departments/[id]` | 🏢 Departments (**managed here**) + 👤 schedules | tree: create, rename, move, manager, deactivate; settings; members' schedules (follow/own pattern, own off-day chips, crew start, reset) |
| `/teams`, `/teams/[id]` | 👥 Teams & supervisors | supervisor, dated members, weighted OT, pending approvals |
| `/employees`, `/employees/[id]` | Employees (**managed here**) | create/edit/move/deactivate; month calendar plan vs punches vs result; day drawer; manual states, credits, corrections; balance |
| `/changes` | 🔄 Swaps | requests, week/month scope, pay as OT, approve/reject |
| `/reports/overtime` | 💰 Overtime report | per-employee OT box, columns, CSV |
| `/periods/[period]` | Period close | recompute, lock, **Payroll xlsx**, **Period Balance xlsx** |
| `/emails/[period]` | Emails | preview, send through Odoo, result per employee |
| `/settings` | Settings | company rules, night rule, holidays, period start day, timezone, Odoo connection test |

### 9a. Mockup features → tasks

| # | Feature | Task |
|---|---|---|
| F1 | Header filters (period, department) | S0.5, S3.2 |
| F2 | Pattern builder steps 1–2, presets, paint/drag, 14-day preview | S2.4 |
| F3 | "＋ New shift" dialog with live hint | S2.2, S2.4 |
| F4 | Assign to employees/teams/departments + impact preview; saved cards | S2.4 |
| F5 | Employee schedules: follow/own, own off days, crew start, reset | S3.6 |
| F6 | Roster markers | S3.2, S4.4 |
| F7 | Drag-to-swap | S3.5 |
| F8 | Day popup | S3.6, S4.4 |
| F9 | Swap requests | S3.5 |
| F10 | Overtime report + CSV | S5.4 |
| F11 | Department rules | S2.3 |
| F12 | Shifts table + create | S2.2 |
| F13 | Teams & supervisors | S2.4 |
| F14 | Dashboard | S4.4 |

### 9b. Mockup maths vs Odoo rules (D19: Odoo wins)

| Topic | Mockup | App default |
|---|---|---|
| Required | shift − break | full span (R1); break only if the shift defines one; imported old shifts break 0 |
| Late | > start + dept grace | grace chain employee → department → shift/team → 15; forgiven minutes paid; brackets when ticked (R4–R6) |
| OT basis | daily/weekly + minimum | daily, minimum 0 (R8); others = options, off |
| Rates | work / off / night | 1.25 / 1.5; night OT unused (P4) until HR enables |
| Weekly target | per department | information only |
| Credits, states, holidays, OT gate | — | kept (R7–R13) |
| Swap pay as OT | off-day rate | same |

## 10. Calculation engine (TypeScript, pure)

- Planning: template `src/lib/roster/`, generalised from kinds to shifts.
- New `src/lib/payroll/` (no DB/SvelteKit imports): `types.ts`;
  `schedule.ts` = 1:1 port of `docs/reference/schedule_spec/schedule.py` +
  its 11 tests; `match.ts` (punch ↔ planned shift window, overnight-safe,
  never invent a check-out); `day.ts` (R1–R10); `night.ts`; `period.ts`
  (R11, modes `daily_sum` default and `gated`, DIFF §4).
- Old code (logic only, see CLAUDE.md warning):
  `Roster/custom_addons/roster_attendance/models/roster_line.py` :785-829
  window, :835-932 actual, :940-963 grace, :1024-1090 lateness, :1092
  brackets, :1126 status, :1232 OT/shortage, :2131-2181 Deduction, :2198
  Final, :1597-1798 period netting.
- Tests: G1–G8, N1–N12, A1–A5, S1–S3, O1–O2, H1 + expectations of old
  tests `test_tardiness_payroll`, `test_off_day_required`,
  `test_suppress_ot`, `test_grace_hierarchy`,
  `test_period_balance_day_hours` (re-expressed with made-up people).
- Golden master (D7): 3 periods from `day_inputs_*.csv` + punches; report
  `docs/GOLDEN_MASTER_REPORT.md` (counts, line IDs); target 0 unexplained
  Final/Deduction differences.

## 11. Lanes

| Lane | Repo · branch | Tasks | Needs |
|---|---|---|---|
| **A · App** | this repo · `app/main` | S0, S1.2–S1.5, S2, S3, S4.2–S4.4, S5, S6.2, S7 | — |
| **B · Odoo side** | **Roster repo** · `odoo/attendance-app` (plan `Roster/plans/2026-10-28-attendance-app-odoo-side.md`) | extraction tool (→ S1.1 here), connector (→ S6.1 here) | — |
| **C · Payroll engine** | this repo · `app/payroll-engine` | S4.1 | S0.2 merged |

Merge order: S0 → C any time → S1.2+ needs B's extraction files → S4.2 needs
S4.1 → S5 needs S4.3 → S6.2 needs B's connector.

## 12. Tasks

### S0 · From template to a running app (Lane A)
- [x] S0.1 Repo created with `CLAUDE.md`, this plan, `docs/` (guide,
      mockup, reference), `.gitignore`, versioned hook `tools/hooks/pre-commit`
      > note: done 2026-10-28 in the planning session (`git config
      > core.hooksPath tools/hooks` already set on this clone).
- [ ] S0.2 Copy the template into this repo without overwriting our files:
      ```bash
      git -C ../Airport-Staff archive a99e348 | tar -x -C . \
        --exclude=CLAUDE.md --exclude=README.md --exclude=.gitignore \
        --exclude='plans' --exclude='plans/*' --exclude=SYSTEM_OVERVIEW.html
      mkdir -p docs/template && git -C ../Airport-Staff archive a99e348 \
        CLAUDE.md plans SYSTEM_OVERVIEW.html | tar -x -C docs/template
      pnpm install
      ```
      Write `docs/template/SOURCE.md` (path, commit, date).
      **Done when** the template tree is here, our CLAUDE.md/plan/.gitignore
      are unchanged, `pnpm install` succeeds
- [ ] S0.3 Local DB: `docker-compose.dev.yml` (`attendance-app-db`,
      `postgres:16`, `127.0.0.1:5433:5432`, named volume, healthcheck,
      project `attendance-app`); DBs `attendance_app`, `attendance_app_test`;
      `.env` from `~/secure/syravia/attendance_app.env`.
      **Done when** `ss -ltnp` shows 5433 on 127.0.0.1 only
- [ ] S0.4 Driver + adapter: `postgres.js` (`src/lib/server/db/index.ts`,
      `scripts/lib.ts`, `src/env.ts`, `.env.example`), 31 `db.batch` →
      `db.transaction` (audit in the same transaction), `adapter-node`,
      remove Neon/Vercel packages and files.
      **Done when** `pnpm check` passes
- [ ] S0.5 Remove the flight domain and `overtime_approval` (routes,
      services, imports, schema, messages, tests); **new migration baseline**
      + the template's custom SQL (btree_gist EXCLUDE, RBAC seed) as custom
      migrations; header period/department filters (F1) as placeholders.
      **Done when** `pnpm db:migrate` works on an empty `attendance_app`;
      `pnpm check`, `pnpm lint` (touched), `pnpm test` green
- [ ] S0.6 `AUTH_MODE=local_single_user` (§8) + Vitest for the guard; merge
      the template conventions into `CLAUDE.md` §3 (drop flight/Neon/Vercel
      parts).
      **Done when** non-loopback → 403, `0.0.0.0` refused, app opens at
      `http://127.0.0.1:5173` in en and ar
- [ ] S0.7 Commit on `app/main`

### S1 · Imports (Lane A; files from Lane B)
- [ ] S1.1 (Lane B, Roster) extraction tool produces the §6 files.
      > Tracked in the Roster plan; tick here when the files exist.
- [ ] S1.2 Seed import: `departments.csv` → `department` (tree), then
      `employees.csv` → `staff`, with preview and re-run safety (update by
      `odoo_id`).
      **Done when** 30 departments and 312 active employees (347 total)
      imported; a second run changes 0 rows
- [ ] S1.3 Punch import (§6 rules) for `punches_*.csv`, `/imports` screen.
      **Done when** 23,625 punches imported (minus rejected future-dated,
      reported), a second run adds 0
- [ ] S1.4 Odoo standard Attendances xlsx format with timezone picker
      (preview shows converted examples)
- [ ] S1.5 Departments and employees **managed in the app**: create, edit,
      move, deactivate (audit); `/departments` tree, `/employees`

### S2 · Shifts, departments, teams, patterns (Lane A)
- [ ] S2.1 `shift` table; generalise `shift_pattern`/`roster_override` and
      `src/lib/roster/` to shifts; department as pattern owner.
      **Done when** updated template roster tests pass
- [ ] S2.2 `/shifts` (F12) + 24 h editor with live hint (F3).
      **Done when** 16:00→04:00 shows "ends next day", 720; `OFF`/duplicate
      codes refused
- [ ] S2.3 Department settings and rules (F11), sub-departments inherit (D10).
      **Done when** a parent override shows as inherited on its child
- [ ] S2.4 `/teams` (F13) and `/patterns` (F2–F4).
      **Done when** a D-D-N-N-O-O-O-O cycle assigned to a team is right
      before and after its anchor
- [ ] S2.5 Import old setup (`shifts_old`, `employee_lines_old`,
      `cycles_old`, `holidays_old`, `holiday_assignments_old`).
      **Done when** counts equal `docs/reference/DATA_PROFILE.md`
      (28 patterns, 1,337 employee lines, 6 cycles, 4 holidays, 586
      assignments)

### S3 · Monthly roster, schedules, changes (Lane A)
- [ ] S3.1 `period` + `offday_plan`; resolution of §7 with Vitest for every
      precedence step
- [ ] S3.2 `/roster/[period]` (F1, F6): grid, paint, copy last month +
      rotate, publish, week view. **Done when** first paint < 1.5 s for
      312 × 31
- [ ] S3.3 Off-day planner with staffing counts
- [ ] S3.4 `/employees/[id]` plan vs punches vs result
- [ ] S3.5 `/changes` (F9) + drag-to-swap (F7), scope checks, pay as OT,
      approver (D22), backdating only inside an open period with reason
- [ ] S3.6 Employee schedules (F5) + day popup planned part (F8)

### S4 · Payroll engine and results
- [ ] S4.1 (Lane C) `src/lib/payroll/` + Vitest of §10. **Done when** all
      listed cases pass; no DB/SvelteKit import in `src/lib/payroll/`
- [ ] S4.2 (Lane A) recompute changed employee-days (`inputs_hash`) after
      imports/edits; store `day_result`; explanation drawer
- [ ] S4.3 (Lane A) golden master with `day_inputs_*.csv` + punches for the
      3 periods. **Done when** `docs/GOLDEN_MASTER_REPORT.md` shows 0
      unexplained Final/Deduction differences
- [ ] S4.4 (Lane A) day popup actuals, roster status dots, `/dashboard`
      (F6, F8, F14)

### S5 · Period close and exports (Lane A)
- [ ] S5.1 Payroll Period xlsx (26 columns, preview, subtotals, grand total,
      notes) — logic of `payroll_report.py`
- [ ] S5.2 Period Balance xlsx (11 columns, badge format, units, gross
      shortage D6/D7, mid-period starters, archived scope) — logic of
      `period_balance_report.py`
- [ ] S5.3 Cell-by-cell comparison with the golden workbooks; period lock.
      **Done when** 0 differing cells for 3 periods (or approved fixes)
- [ ] S5.4 `/reports/overtime` (F10) + CSV

### S6 · Emails through Odoo
- [ ] S6.1 (Lane B, Roster) connector with `send_batch`.
      > Tracked in the Roster plan; tick here when installed on
      > `syravia_night_shift`.
- [ ] S6.2 (Lane A) `/emails/[period]`: preview, send via JSON-2, result.
      **Done when** mails arrive in MailHog only; employees without
      `odoo_id` are listed as "cannot send"

### S7 · Parallel run (user + HR)
- [ ] S7.1 One full period in both systems; HR compares both pairs of Excel
      files; every difference explained

### S8 · Facility (with facility IT; ask first)
- [ ] S8.1 `AUTH_MODE=login`, HTTPS, rotated admin code, D5 roles, backups,
      network path to Odoo only; how the facility produces the import files
      (extraction tool run or Odoo export); `docs/DEPLOY.md`
- [ ] S8.2 Delivery: Node build or Docker image + migrations; connector ZIP

## 13. Open questions (defaults used until answered)

| # | Question | Default |
|---|---|---|
| Q-A1 | Roster month = payroll period 21→20 or calendar month? | 21→20 |
| Q-A2 | How do days off move each month? | copy last month + manual moves |
| Q-A3 | Teams from today's sub-departments or new crews? | seed from sub-departments |
| Q-A4 | Show old history days? | 3 golden periods, read-only |
| Q-A5 | Later login: template code login or other? | template code login |
| Q-A7 | Keep any flight features? | no |
| Q-A8 | "Week only" swaps: Sun–Sat or Mon–Sun? | Sun–Sat |
| Q-A9 | Weekly OT or minimum OT for any department? | no |
| Q-A10 | No supervisor: department manager or HR approves? | department manager, else HR |
| Q-A11 | At the facility, who produces the punch file each period (run the extraction tool, or Odoo's Attendances export)? | decide in S8; the app accepts both |
| Q-A12 | New hires: created only in the app, or also in Odoo (needed for emails and BioTime badges)? | create in Odoo first, then add/import in the app with its `odoo_id` |

Rule questions Q1–Q18: `docs/reference/OPEN_QUESTIONS.md` (defaults = old
behaviour).

## 14. Verification (before ticking)

- `pnpm check`, `pnpm lint` (touched), `pnpm test` green; Playwright on
  `attendance_app_test` (made-up people).
- `ss -ltnp`: 5173 and 5433 on 127.0.0.1 only; non-loopback → 403.
- `git status`: no `.env`, data CSV/XLSX, dumps, logs; no names in new
  docs, fixtures or commits.
