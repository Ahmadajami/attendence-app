# Employee import from HR's reconciled workbook into the local real-data DB

**Status:** in progress (approved 2026-11-08 with every default kept; **imported 2026-11-08**: 310 people, re-run = 0 changes; waiting for the user's manual check 3.5 and the Desktop clean-up 0.2)
**Date:** 2026-11-08
**Goal:** Load every employee in HR's reconciled workbook `ready_to_import.xlsx` (sheet
`Employees`, 310 rows) **correctly** into the real-data DB **`attendance_app` on the user's PC**,
with their departments, teams and job titles, in **one audited transaction** that can run again
without making duplicates. A dry run (all writes, then rollback) comes first. Only counts reach
the console, the plan and the chat.

**"Production" here (user, 2026-11-08):** the `attendance_app` DB in the local Docker container
on the user's PC (`127.0.0.1:5433`). It runs on no server and is reachable at no URL. Nothing in
this plan deploys, publishes or exposes anything. Everything already in that DB is **test
data**, and the employees from this workbook are the only real data. **No backup and no
rehearsal copy** (EI13).

**Lane:** the main agent on `app/main`: one migration, one pure helper with Vitest tests, one CLI
script, this plan and the decisions entries. The user runs every step that touches the real DB
(dry run, commit) and every browser check. Resume point = the first unticked box.

**Not in this plan** (each one gets its own plan later): managers and supervisors (Q-EI4),
patterns built from the `Shift` / `Weekly (H)` columns (§2), matching fingerprint-device IDs to
people (the punch import, S1.6), historical punches (S1.3).

## 0. What we start from (read-only profiling, 2026-11-08; counts only)

**The file.** `/home/xxskullxx/Desktop/Emp and Attendence Roasters/ready_to_import.xlsx`
(48.9 KB, mode 664, **outside `~/secure/syravia/`**, see task 0.2). It has two sheets:

| Sheet | Rows | What it is |
|---|---|---|
| `Employees` | 310 data rows + header (22 columns) | the list to import |
| `Changes` | 60 rows (`New ID` 55, `Removed` 4, `Merged` 1) | HR's log of the reconciliation. **Not imported.** Checked: the 55 `New ID` people and the 1 `Merged` person are already in `Employees` with their new ID; the 4 `Removed` people are not in it |

**`Employees` columns** (filled / 310, distinct values):

| # | Header | Filled | Notes |
|---|---|---|---|
| 0 | `#` | 310 | row counter |
| 1 | `ID (All Staff)` | 310, all distinct | HR's ID. Shape `NNNN-NNN` 254, `NNN-NNN` 55 (the `New ID` rows), `NNNN` 1. **Without the dash it is still unique** and equals the Odoo badge on 244 rows |
| 2 | `Odoo Badge ID` | 302, all distinct | digits only, 3–7 digits |
| 3 | `ID Mismatch` | 25 (`Yes`) | HR's flag where the ID and the badge differ |
| 4 | `Name (English)` | 310, all distinct | |
| 5 | `الاسم (Arabic)` | 278 | missing on the 32 `Odoo only` rows |
| 6 | `Odoo Name` | 280 | Odoo's spelling of the English name |
| 7 | `Location` | 278, 4 values | Dam Airport 151, ALP Airport 84, HQ 41, Travel 2 |
| 8 | `Team` | 257, 27 values | |
| 9 | `Department (Odoo)` | 254, 21 values | `Parent / Child` paths: 8 roots, 15 children, depth ≤ 2 |
| 10 | `Job (Odoo)` | 224, 23 values | Odoo job names with their code, e.g. `Porters (OP1111-1)` |
| 11 | `Manager (Odoo)` | 253, 15 people | 11 of the 15 are in the file; 6 departments have 2 managers, 1 has 3, 1 has 5 |
| 12 | `Joining` | 256 | Excel date serials (2000 → 2026-10) |
| 13 | `Weekly (H)` | 276, 8 values | 54 h 139, 55 h 84, 45 h 17, 60 h 13, 48 h 13, 0 h 8, 40 h 1, 24 h 1 |
| 14 | `Shift` | 276, 5 values | `(6*1)` 165, `(5*2)` 102, `(4*4)` 6, `(2*2)` 2, `(3*4)` 1 |
| 15 | `Email` | 180 | 179 distinct (two rows share one address) |
| 16 | `Work Email (Odoo)` | 123, all distinct | equal to `Email` on 105 rows |
| 17 | `Work Phone (Odoo)` | 12 | `+NNN NNN NNN NNN` |
| 18 | `Probation (days)` | 271 | 0 on 173 |
| 19 | `Probation Till` | 98 | Excel date serials |
| 20 | `Source` | 310 | `Both` 248, `Odoo only` 32, `All Staff only` 30 |
| 21 | `Match Method` | 310 | `ID` 221, `Name` 26, `Name (manual)` 1, `–` 62 |

The 32 `Odoo only` rows have no Arabic name, team, location, start date or weekly hours: most
likely people who left but are still in Odoo (Q-EI2). None of the 32 is on the fingerprint device export (by number or badge). 31 are in `Station Damascus / DAM Porters && Drivers` and 1 in `Station Aleppo`; their jobs are 20 cabin cleaners, 9 porters, 1 driver and 2 supervisors. So they could also be contract staff who are not enrolled on the device, which HR should confirm. Of the 30 `All Staff only` rows, 8 have no
badge and 22 have no start date. 35 rows have a team but no department and 32 have a department
but no team. 10 of the 27 teams have members in more than one department.

The 278 people who would be active have these gaps (counts, 2026-11-08). None of them blocks
the import, but they matter afterwards:
no team and no department 21; no department 56; no job title 86; no start date 22; no work
email 155 (98 with no email at all); no manager in the file 57; no badge 8; weekly hours 0 on 8;
not on the fingerprint device export by number or badge 81 (only 190 found by the new number).
Nobody has a pattern after the import (Shift/Weekly hours are not stored, EI6).

**The local `attendance_app` today** (migrations 0000–0020 applied; **all test data**, user
2026-11-08):

| Table | Rows | Notes |
|---|---|---|
| `staff` | 8 | test records typed by hand. **None** of their numbers is in the file, so no number collides. 2 match a file row by English name; they stay as separate test records (Q-EI3) |
| `department` | 2 | `Operation`, `Human Resources Management` (roots). The file has `Operations` and `Human Resources / HR & Admin`, which are different names, so new departments are created (Q-EI6) |
| `team` | 2 | `Operation`, `HR`. The file's team `HR` (4 rows) has the **same name**, and `team.name_en` is unique, so the test team `HR` is reused (it has no pattern assignment) |
| `job_title` | 3 | none in the file |
| `staff_function` | 4 | the file has no function column |
| `department_manager` | 1 | |
| `pattern_assignment` | 3 | team `Operation`, department `Operation`, 1 personal. With Q-EI6 = no, **no imported person lands in an assigned group** (EI10 checks this) |
| `attendance_event` | 0 | |

**What the schema imposes:**

- `staff.employee_no` is `NOT NULL UNIQUE` with the check `staff_employee_no_digits`
  (`^[0-9]+$`). Login IDs are digits only too (`scripts/lib.ts` `parseLoginId`). So a dashed
  ID cannot be stored as it is.
- `department.name_ar`, `team.name_ar` and `job_title.name_ar` are `NOT NULL`, and the file has no
  Arabic for any of them (Q-EI9).
- `team.name_en` and `job_title.name_en` are unique. A department name is unique among its siblings.
- `staff.personal_email` has a format check (`^[^@[:space:]]+@[^@[:space:]]+$`).
- `staff` has no column for the badge, location, probation, weekly hours or shift.
- `nextEmployeeNo` (`src/lib/workforce/employee-no.ts`) gives new hires *highest number + 1*,
  starting at 1000.

## 1. Decisions (proposed 2026-11-08, approved 2026-11-08)

| # | Decision | Why |
|---|---|---|
| EI1 | **A one-off CLI script**, `scripts/import-employees.ts` (tsx, like `seed-e2e-operation.ts`), built on a **pure, tested helper** `src/lib/workforce/employee-seed.ts`. The `/imports` page is not used | The import must create departments, teams and job titles, read this file's exact headers and write everything in one transaction. The `/imports` staff import does none of that (it requires a function, matches only existing teams and knows 6 fields). This is a one-time seed (D25), and the page stays the generic path for later |
| EI2 | **Dry run by default.** Without `--commit` the script performs **every write inside one transaction, then rolls back**. Constraint errors show up exactly as they would in a real run. `--commit` keeps the writes. Guards: the connected DB name must equal `--database <name>`; the file and the report must be **outside the repo**; the script refuses to run if the file's header row differs from the 22 expected headers | The script cannot hit the wrong DB or the wrong file by mistake, and a dry run costs nothing |
| EI3 | **Key = `employee_no`** (EI4). A second run **updates** changed rows and leaves equal rows alone. It never creates a duplicate. *Done* means a second dry run reports **0 created, 0 updated** | A re-run after a fix must be safe (same rule as main plan S1.2) |
| EI4 | **`employee_no` = `ID (All Staff)` with the dash removed** (Q-EI1). This keeps `staff_employee_no_digits` and digit-only login IDs, stays unique (checked: 310/310) and equals the Odoo badge on 244 rows | HR's reconciled ID is the master. The dash is formatting |
| EI5 | **Keep the Odoo badge** in a new nullable, unique, digits-only column **`staff.legacy_badge_no`** (migration 0021). It is filled on 302 rows and not shown in the UI yet | The 58 people whose badge differs from their ID still need the link for the historical punches (S1.3) and for matching the fingerprint device later (S1.6) |
| EI6 | **Field mapping as in §2.** Columns with no home in the schema (location, probation, weekly hours, shift, manager, Odoo name, mismatch/source/match flags) are **not stored**. The report (EI11) lists them for HR | No speculative columns. Shift and weekly hours belong to patterns, managers to the management screens (Q-EI4, Q-EI7) |
| EI7 | **Lookups: reuse by name, else create.** Names are matched after `normalizeText` (`src/lib/server/imports/columns.ts`) against English and Arabic names. Near-matches only through an **alias table the user approves** (Q-EI5/6). Departments become a two-level tree from `Parent / Child`. A **team's department** is the department most of its imported members have, or none on a tie or when no member has one. A person's **own department comes only from their row**: a blank stays blank and is not guessed from the team | Existing rows (`HR` team) are reused, so there are no duplicate lookups, and nothing is guessed silently |
| EI8 | **Memberships and audit like the app.** Each person with a team gets an open `staff_team_membership` from the import instant (team history before the import is unknown). Every insert or update writes an `audit_log` row: actions `staff.import`, `department.import`, `team.import`, `job_title.import`, actor = the local admin account, reason `Employee import 2026-11-08`, before/after as in `createStaff` / `updateStaff` | CLAUDE.md §3 (audit every mutation) and the one-person-one-team EXCLUDE constraint |
| EI9 | **Validation.** These **block the run** (nothing is written): a missing ID, an ID that is not digits after the dash is removed, a duplicate ID (in the file, or held by an existing test record), a missing English name, an unknown header. These are **warnings** (the row is imported, the bad field left empty): an email that fails the format check, a `Joining` value that is not a date or lies in the future, a badge that is not digits or is already held by another person | Bad data stops the run, and minor gaps don't hold up 300 good rows |
| EI10 | **Nothing is removed and nobody is moved silently.** People not in the file are left untouched (no deactivation). The dry run counts the imported people who land in a team or department **with a pattern assignment** (they join its roster from the import on) and lists them in the report | Deactivation and roster changes are HR decisions in the app |
| EI11 | **Real data stays in `~/secure/syravia/`.** The file moves to `~/secure/syravia/imports/2026-11-08/` (mode 600). The script writes a row-level report (row number, ID, issue, action) to `…/2026-11-08/report-<run>.csv` (mode 600). The **console prints counts only**, and so do this plan's notes and the chat | CLAUDE.md §1 |
| ~~EI12~~ | ~~Backup, rehearse on a restored copy, then commit~~ → **replaced by EI13** (user, 2026-11-08) | |
| EI13 | **No backup, no rehearsal copy: dry run, then commit, on the local `attendance_app`.** Nothing is served on a URL or deployed; the user checks the result on the usual loopback dev server (`http://127.0.0.1:5173`). If a committed run turns out wrong, the fix is a corrected file (or helper) and a re-run, which updates by employee number (EI3) | The user's instruction (2026-11-08): "production" is only this PC, and the rest of the DB is test data. The rolled-back dry run already shows every constraint error before anything is kept |
| EI14 | **Existing test rows are left alone and not borrowed**: no mapping of the 8 test people (Q-EI3), no aliases onto the test departments (Q-EI6). The only exception is a name the schema forces to be unique: the file's team `HR` reuses the test team `HR`, and the report names it | Real people must not inherit test patterns, test managers or test records; the import touches only what the workbook describes |

**Questions for the user** (the defaults are what the plan does if the answer is "keep"):

| # | Question | Default |
|---|---|---|
| Q-EI1 | Which number becomes the employee number: (A) `ID (All Staff)` without the dash, (B) the Odoo badge (missing on 8 rows), or (C) the ID **with** the dash (needs a schema and login change)? | **A** (EI4) |
| Q-EI2 | The 32 `Odoo only` rows (no team, start date or Arabic name): import as **inactive**, import as active, or skip? | **inactive** (kept for history and the badge link) |
| Q-EI3 | The 8 people already in `attendance_app` (2 match a file row by name): map them to their file ID? | **answered 2026-11-08: no.** They are test data and are left untouched (EI14); HR can deactivate them in the app |
| Q-EI4 | `Manager (Odoo)` (15 people): leave it to HR in the app, or set **department managers / team supervisors** from it? | **leave to HR** (several managers per department; the app allows one) |
| Q-EI5 | Team names that look like the same team: `Flay Doubi` / `Flydubai`; `Turkish & AJET` / `Turkish & AJET(A)` / `Turkish Airline`; `Qatar Airways` / `Qatar Airways (B)`. Merge any of them? | **import as written** (the `(A)` / `(B)` look like crews) |
| Q-EI6 | Reuse the existing department `Operation` for the file's `Operations`, and `Human Resources Management` for `Human Resources`? | **no** (changed 2026-11-08: those departments are test data, and `Operation` has a pattern, EI14) |
| Q-EI7 | Store `Location`, `Probation (days)` / `Probation Till`, `Weekly (H)`, `Shift`? | **no**. They go in the report; shift and weekly hours feed the later patterns plan |
| Q-EI8 | After the import the highest number has 7 digits, so the next new hire gets *that + 1* (Q-A12). Keep that, or a new rule (e.g. HR's `NNNN-NNN` group prefix)? | **keep for now**, revisit before the first new hire |
| Q-EI9 | Arabic names for the new departments (23), teams (26) and job titles (23): the agent proposes them in the alias/translation table, the user corrects them in the dry-run report. Or copy the English name for now? | **agent proposes, user corrects** |

## 2. Field mapping (`Employees` → `staff`)

| File column | Target | Rule |
|---|---|---|
| `ID (All Staff)` | `employee_no` | trim, Arabic-Indic → ASCII digits, remove `-`. Required, digits, unique |
| `Odoo Badge ID` | `legacy_badge_no` (new) | digits or empty. Unique |
| `Name (English)` | `full_name` | trim, collapse spaces. Required. Name parts stay empty (seeded rows keep their full name, `staff` schema comment) |
| `الاسم (Arabic)` | `full_name_ar` | trim, or null |
| `Department (Odoo)` | `department_id` | split on ` / ` → root (+ child); reuse or create (EI7); empty → null |
| `Team` | `team_id` + open membership | reuse or create (EI7); empty → no team |
| `Job (Odoo)` | `job_title_id` | the full Odoo name, code included (it is unique; HR can rename it in the app); reuse or create |
| `Joining` | `start_date` | Excel serial → `yyyy-mm-dd` (the serial counts days from 1899-12-30). If `read-excel-file` already returns a `Date` (a date-formatted cell), keep its UTC fields as `parse.ts` `dateCell` does. Empty → null |
| `Email` | `personal_email` | lowercase, trim; fails the check → empty + warning |
| `Work Email (Odoo)` | `work_email` | lowercase, trim |
| `Work Phone (Odoo)` | `phone` | as written |
| `Source` | `active` | `Odoo only` → per Q-EI2; others → true |
| `#`, `ID Mismatch`, `Odoo Name`, `Location`, `Manager (Odoo)`, `Weekly (H)`, `Shift`, `Probation (days)`, `Probation Till`, `Match Method` | — | report only (EI6) |
| (none) | `function_id`, `national_id_*`, `odoo_id`, `user_id` | left null |

On an **update** (a person the import created earlier, matched by number on a re-run), a blank
in the file **does not erase** a value already in the app. A non-blank value replaces it, and the change
is listed in the report.

## 3. Expected counts (for the "done when" checks; if Q-EI defaults hold)

| What | Expected |
|---|---|
| Rows read / blocked | 310 / 0 |
| Staff created / updated | **310 / 0** (staff total afterwards 318 = 8 test + 310) |
| Active / inactive among the 310 | 278 / 32 |
| Departments created | 23 (8 roots + 15 children) |
| Teams created | 26 (27 − `HR` reused) − merges (Q-EI5) |
| Job titles created | 23 |
| With team / department / job / start date / Arabic name / badge | 257 / 254 / 224 / 256 / 278 / 302 |
| Open memberships added | 257 |
| Imported people in a group with a pattern assignment | 0 |
| Audit rows | 310 + 23 + 26 + 23 = 382 (fewer if teams are merged) |
| Second dry run | **0 created, 0 updated** |

## 4. Tasks

### Phase 0: answers and preparation

- [x] 0.1 The user answers Q-EI1–Q-EI9 (or keeps the defaults); the decisions become `approved` in
      §1 and in `docs/decisions.html`.
      > note: 2026-11-08 the user approved the plan ("ok no problem, start implementing"): every
      > default kept (Q-EI1 A, Q-EI2 inactive, Q-EI4 leave to HR, Q-EI5 as written, Q-EI7 not
      > stored, Q-EI8 keep, Q-EI9 agent proposes); Q-EI3 and Q-EI6 = no (test data).
- [ ] 0.2 **The user** moves the file to `~/secure/syravia/imports/2026-11-08/ready_to_import.xlsx`
      and runs `chmod 600` on it. The other files in the same Desktop folder hold real data too (the
      Odoo employee export, the fingerprint export, `fingerprint_missing_report.html`, the two
      `oct-2026-*` folders) and belong there as well. The agent never deletes or moves anything in
      `~/secure/syravia/` or on the Desktop.
      **Done when** `ls -l` shows the file at the new path with `-rw-------`, and no copy is left
      on the Desktop.
      > note: 2026-11-08 the agent **copied** it (user's "import employee"): identical (`cmp`),
      > mode 600, folder 700. **Still open for the user:** delete the Desktop copy and move the
      > other exports from that folder.
- [x] 0.3 ~~Reconcile the 8 existing people~~: not needed.
      > note: 2026-11-08 the user said all existing data is test data (Q-EI3 = no, EI14).

### Phase 1: schema

- [x] 1.1 Add `legacy_badge_no text UNIQUE` + check `^[0-9]+$` to `staff`
      (`src/lib/server/db/schema/workforce.ts`). Run `pnpm db:generate` → `drizzle/0021_*.sql`,
      read the SQL and apply it to `attendance_app_e2e` and `attendance_app_test`.
      **Done when** both synthetic DBs have the column and `pnpm check` passes.
      > note: 2026-11-08 `drizzle/0021_staff_legacy_badge_no.sql` = add column + unique
      > `staff_legacy_badge_no_unique` + check `staff_legacy_badge_no_digits`, nothing else.
      > Applied on `_e2e` and `_test` (21 → 22 migrations each, column present). `pnpm`
      > itself fails here with `spawn ENOTCONN`, so the binaries ran directly
      > (`./node_modules/.bin/drizzle-kit`, `svelte-check`, `vitest`). svelte-check: 0 errors (1
      > old warning in generated `ui/stepper`).
- [x] 1.2 Apply 0021 to `attendance_app` after a row count (`staff` = 8) and **the user's OK**.
      **Done when** `\d staff` on `attendance_app` shows the column and the row count is unchanged.
      > note: 2026-11-08 row count before: `staff` 8, 21 migrations applied. **Waiting for the
      > user's OK.**
      > note: 2026-11-08 applied after the user's "import employee": 21 → 22 migrations; staff 8,
      > department 2, team 2, job_title 3, memberships 8, audit 85 unchanged; column, unique and
      > check present.

### Phase 2: code (no real data involved)

- [x] 2.1 `src/lib/workforce/employee-seed.ts` (pure, no DB, no SvelteKit): `EXPECTED_HEADERS`,
      `normaliseEmployeeNo`, `excelSerialToIsoDate`, `splitDepartmentPath`, `teamDepartment`
      (majority, tie → null), `parseEmployeeRows(table) → { rows, issues }`, and
      `planChanges(rows, existing, aliases) → { create, update, unchanged, lookups }` (the part the
      dry-run counts come from). Aliases and Arabic names live in a typed constant
      `EMPLOYEE_IMPORT_ALIASES` in the same folder (organisation names only, no people).
      > note: 2026-11-08 built as `parseEmployeeSheet(sheet, today)`, `planImport(rows, existing,
      > arabic, newId)`, `normaliseEmployeeNo`, `excelDate`, `splitDepartmentPath`,
      > `majorityDepartment`, `nameKey`. No alias table (Q-EI5/6 = none); the Arabic names
      > (23 + 27 + 23) are `EMPLOYEE_IMPORT_ARABIC` in `employee-seed-names.ts`. On update `active`
      > is never changed (HR's choice in the app wins); a reused team keeps its own department.
- [x] 2.2 `src/lib/workforce/employee-seed.test.ts` with **made-up rows only**. It covers: dash
      removal and Arabic-Indic digits; a duplicate ID after the dash is removed; serial → date
      (incl. empty, future, non-numeric); department path with 1 and 2 levels; team majority and
      tie; an alias and a case-only difference reuse the existing row; a blank field on update keeps
      the old value; a bad email → warning; a wrong header → error; `Odoo only` → inactive; a
      second `planChanges` over its own output → 0 create / 0 update.
      **Done when** `pnpm test` passes.
      > note: 2026-11-08 20 tests, all made-up; full suite 41 files / 422 tests pass.
- [x] 2.3 `scripts/import-employees.ts`:
      `pnpm exec tsx --env-file=<env> scripts/import-employees.ts --file <xlsx> --database <name>
      [--report <csv>] [--commit]`. It reads the sheet `Employees`
      with `read-excel-file/node` (`readSheet`, already a dependency) and connects through
      `scripts/lib.ts` `connect()`. It checks the guards (EI2), loads the existing staff and
      lookups, runs `planChanges`, and writes in **one** `db.transaction`: lookups first
      (departments parents before children), then staff, memberships, audit. It rolls back unless
      `--commit` is given. It prints counts per outcome and per warning code only, and writes the
      CSV report (600) if `--report` is given.
      **Done when** `pnpm check`, eslint and prettier on the new files are clean and
      `pnpm test` passes.
      > note: 2026-11-08 done; check 0 errors, eslint and prettier clean, tests pass. The report's
      > sections are `issue`, `lookup`, `staff` (row number, employee number, action). Guards
      > tried: wrong `--database` and a report path inside the repo are both refused.
- [x] 2.4 Wire `legacy_badge_no` into the staff types and `findStaff` (read only; no form, no UI).
      **Done when** `pnpm check` passes.
      > note: 2026-11-08 nothing to wire: `findStaff` selects every column, so
      > `legacyBadgeNo` comes with it; the DTOs in `#lib/types` stay unchanged until a screen shows it.
- [x] 2.5 Smoke test on **`attendance_app_e2e` with a made-up workbook** (5 made-up people with the
      22 headers, generated in the scratchpad by a throwaway script, never committed): dry run, then
      `--commit`, then a second dry run.
      **Done when** the second dry run reports 0 created / 0 updated; then the 5 made-up people are
      deactivated in e2e (or stay, if the user prefers).
      > note: 2026-11-08 dry run = commit = 2 departments, 1 team, 1 job title, 5 staff (4 active,
      > 1 inactive), 4 memberships, 9 audit rows, warnings `invalid_email` 1 and
      > `missing_arabic_name` 4 (made-up names). Second dry run: 0 created, 0 updated, 5 unchanged.
      > Checked in the DB: dash removed, badge stored, the blank badge/team/date left empty,
      > two-level tree, open memberships. The 5 `Smoke Tester` people stay in `_e2e`.
- [x] 2.6 Offline check of the real workbook (no DB; parse + plan against the test lookups'
      names; counts only).
      > note: 2026-11-08 310 rows, **0 parse issues, 0 plan warnings**, every Arabic name found;
      > 23 departments, 26 teams (`HR` reused), 23 job titles; 310 creates (278 active); with team
      > 257, department 254, job 224, start date 256 (2000 → 2026-10), badge 302, Arabic name 278,
      > personal email 180, work email 123. 6 new teams get no department (tie or no member with one).

### Phase 3: import into the local `attendance_app` (the user runs the commands; the agent reads the counts)

No backup and no rehearsal copy (EI13). Every command runs on the user's PC against the local
container. Nothing is deployed or exposed.

- [x] 3.1 Dry run (rolls back):
      `pnpm exec tsx --env-file=.env scripts/import-employees.ts --file ~/secure/syravia/imports/2026-11-08/ready_to_import.xlsx --database attendance_app --report ~/secure/syravia/imports/2026-11-08/report-dry-run.csv`.
      **Done when** it reports 0 blocking errors, the counts match §3, and 0 imported people land
      in a group with a pattern assignment. The user reads the report (warnings, the proposed
      Arabic names, the reused `HR` team) and the agent fixes the alias/translation table if
      asked.
      > note: 2026-11-08 run by the agent (`./node_modules/.bin/tsx`, since `pnpm` fails with
      > `spawn ENOTCONN` in its shell): 310 rows, 0 errors, **0 warnings**; 23 departments, 26
      > teams created + `HR` reused, 23 job titles; 310 staff (278 active, 32 inactive); 257
      > memberships; 382 audit rows; 0 people in a group with a pattern assignment.
- [x] 3.2 Commit: the same command with `--commit` (report `report-commit.csv`).
      **Done when** its counts equal 3.1's.
      > note: 2026-11-08 committed; same counts as 3.1.
- [x] 3.3 Second dry run: the 3.1 command again.
      **Done when** it reports **0 created, 0 updated**.
      > note: 2026-11-08 0 created, 0 updated, 310 unchanged; all lookups reused (report
      > `report-rerun.csv`).
- [x] 3.4 Count check (SQL, counts only): staff total (318), active, with team, with department,
      with badge; departments, teams, job titles; open memberships; `audit_log` rows with reason
      `Employee import 2026-11-08`. **Done when** they equal §3.
      > note: 2026-11-08 staff 318 (8 test + 310), active 286 (8 + 278), badge 302, with team 263
      > (6 + 257), with department 262 (8 + 254), with job 226 (2 test + 224), start
      > date 258 (2 + 256); department 25, team 28, job_title 26; open memberships 263; import
      > audit rows 382; employee numbers not all digits 0. Team `HR` 4 members (from the file),
      > test team `Operation` still 6.
- [ ] 3.5 The user runs the manual check (§5) on `pnpm dev` → `http://127.0.0.1:5173`
      (loopback only). **Done when** the user reports every line holds.

### Phase 4: close

- [x] 4.1 Decisions in `docs/decisions.html` → `approved` (or `replaced`) with the final answers.
      `node --check` on the extracted script.
      > note: 2026-11-08 EI1–EI11, EI13, EI14 approved; EI12 replaced by EI13; Q-EI defaults
      > marked kept (Q-EI3, Q-EI6 = no); `node --check` passes.
- [x] 4.2 Plan notes (counts only), `plans/README.md` index status, one commit (plan, migration,
      helper, test, script, decisions). The commit message has no names or IDs.
      > note: 2026-11-08 committed at the user's request ("commit this"), before the manual check
      > 3.5; `.gitignore` / `.graphifyignore` (the user's own edits) left out.
- [ ] 4.3 Follow-ups written down as new plans or as main-plan notes: managers/supervisors (Q-EI4),
      patterns from `Shift`/`Weekly (H)`, fingerprint-ID mapping for S1.6 (the fingerprint
      export has 273 IDs: 190 match an HR ID, 195 match a badge, 76 match neither), and
      historical punches (S1.3) matched through `legacy_badge_no`.

## 5. Manual check (the user, on `http://127.0.0.1:5173` after 3.2)

1. `/employees`: the list shows 318 people (8 test + 310). The status filter "inactive" shows
   the 32 `Odoo only` rows (Q-EI2).
2. Open three employees: one from `Both`, one from `All Staff only` without a badge, one
   `Odoo only`. Each shows its number without a dash, its names, department, team, job title
   and start date as in the file.
3. `/departments`: the tree shows `Station Damascus` and `Station Aleppo` with their children,
   plus `Operations` and `Human Resources` next to the test departments, and no duplicated roots.
4. `/teams`: 28 teams (2 test + 26 new, fewer after Q-EI5), `HR` not duplicated; a team's
   member count matches the file.
5. The test `Operation` team and department: same members as before, no imported person added.
6. `/ar/employees` and `/ar/departments`: right to left, Arabic names shown, no English-only
   lookup names where Q-EI9 gave a translation.
7. Create one new employee by hand: the generated number follows Q-EI8. Then deactivate
   that test person.
