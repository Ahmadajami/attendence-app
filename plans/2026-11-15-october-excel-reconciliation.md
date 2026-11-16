# October Excel files: discover, team, compare with the roster, then import

**Status:** to do
**Date:** 2026-11-15
**Goal:** the workbooks in the October folder (21–31 October daily files, two correction files, and one 21 Sep–20 Oct range file) are read, their people are found and grouped by team, each person's times are compared with the roster in the app, and only when every difference is explained is the data imported. The agent writes the scripts and reports counts only. The user runs them on real data (SP15, CLAUDE.md §1).

**OpenCode:** its usage limit has reset (2026-11-15). It can take the tasks in this plan one at a time, in the order below, each with its own brief.

Real data: CLAUDE.md §1. Counts, dates and record IDs only in notes. Names stay in `~/secure/syravia/`.

## 0. Data safety (first, before any script runs)

The folder `21-to-31-Oct/` is inside the repo. Git does not track it (checked 2026-11-15: 0 tracked files, 0 commits in history) and `.gitignore` ignores `*.xlsx`, but CLAUDE.md §1 says data files never live in the repo.

| Task | What | Who | Done when |
|---|---|---|---|
| S0.1 | Move the folder to `~/secure/syravia/imports/october-2026/` (folder 700, files 600). Confirm with the user before moving. | user | the folder is outside the repo and the 14 files are there |
| S0.2 | Check that no copy of the folder exists in the repo or in `~/Pictures`. | user | counts only |

Note: one file name contains personal names. Its name is not repeated in plans, code or chat.

> note: 2026-11-15: S0.1 done by the user. The folder was moved to the secure folder: 14 files there (counted by the user); the repo folder no longer exists. S0.2 (no copies elsewhere) is still open.

## 1. Files in scope

| Kind | Files | Count | Notes |
|---|---|---|---|
| Daily attendance | `Attendance DD-10-2026.xlsx`, 21–31 October | 11 | the main source |
| Corrections | `Correction-Attendance 28-10-2026.xlsx`, `Correction-Attendance 30-10-2026.xlsx` | 2 | apply after the daily files (S5) |
| Range | `Attendance_<3 names>_21-09_to_20-10-2026.xlsx` | 1 | covers September, which SP10 excludes; only the 1–20 October part may be used (Q-OE1) |

Earlier data already in the app: 1–20 October punches from Odoo (imported before 2026-11-12). Re-importing a line that is already saved must skip it (the same rule as L3).

## 2. Sub-issues

Each sub-issue has a script (or a query) that prints counts only, and a "done when" that the user checks.

### S1 Discover the employees (no comparison yet)

- [ ] S1.1 **Headers and shape:** for each of the 14 files, print the sheet names, the column headers and the row count. No cell values. **Done when** the user reports the headers, so the reader can be written.
- [ ] S1.2 **Employees found:** one row per distinct employee ID across the 11 daily files and the 2 correction files; the count per file; the IDs that appear in more than one file; the IDs that appear in the range file only. The printed output is counts and ID-count tables; the full list goes to `~/secure/syravia/reports/` (mode 600). **Done when** the total number of distinct IDs is known and the user has the list.
- [ ] S1.3 **Match to the app:** each ID is matched to `staff` (by badge `legacy_badge_no` first, then `employee_no`). Output: matched, not in app, in app but not in the files. **Done when** every ID is in one of the three groups and the "not in app" group is explained (for example the 22 Odoo-only people, or unknown badges).

### S2 Team them

- [ ] S2.1 **Team per person from the app:** the team on each date (`staff_team_membership` and `pattern_assignment`), not from the Excel file. Output per team: people, daily-file rows. **Done when** every matched person has a team for every date, or a list of dates with no team.
- [ ] S2.2 **Team from the file (if the file has one):** compare the team column in the workbook with the app's team. Output: the people whose team differs, by team and date (counts). **Done when** each difference is explained or sent to the user (Q-OE2).

### S3 Detect the differences from the roster

- [ ] S3.1 **Punch times vs the planned shift:** for each matched person and date, the first check-in and last check-out from the Excel file vs the shift the roster plans (`day_result.shift_id`, required minutes). Output per team and date: rows where the worked hours do not fit the planned shift, with counts, the same way as L5. **Done when** every row in the output is either fine (within the grace rule of plan T3) or on the list for the user to decide.
- [ ] S3.2 **Against existing punches:** for dates 1–20 October, compare the Excel punches with the punches already in the app. Output: same, different, only in the file, only in the app (counts per date). **Done when** the user has the counts.
- [ ] S3.3 **Corrections:** the two correction files against the daily files: which days they change, and whether the change is already in the app. **Done when** the list of changed days is known.

**Gate:** S4 (import) starts only when S3.1 shows no unexplained difference, S3.2 has no "different" rows without a decision, and S3.3 is complete.

### S4 Import (only after the gate)

- [ ] S4.1 **Dry run:** the import through the existing punch-import service (the same path as `scripts/import-october-punches.ts`), rolled back, printing counts per file and team. **Done when** the user reports the counts and gives the OK.
- [ ] S4.2 **Commit:** the same import with `--commit` on `attendance_app`, after the user's OK and the row count (CLAUDE.md §4). **Done when** the count of saved punches equals the dry run.
- [ ] S4.3 **Recompute** the imported days (the same as L4). **Done when** the user reports the counts.

### S5 Corrections and the range file

- [ ] S5.1 Apply the two correction files on top of the daily files (S3.3 decides the order). **Done when** the counts match S3.3.
- [ ] S5.2 The range file's 1–20 October part only, if Q-OE1 says yes. **Done when** the counts match S3.2.

## 3. Questions (the default is used until answered)

| ID | Question | Default |
|---|---|---|
| Q-OE1 | The range file covers 21 Sep–20 Oct, but SP10 excludes September. Use only its 1–20 October part? | yes, only 1–20 October |
| Q-OE2 | A person's team in the file differs from the app: which one counts? | the app's team (it is the source of truth) |
| Q-OE3 | The grace rule for "fine" in S3.1: the plan's grace (T3) is not built yet. Until it is, what counts as a difference? | any difference in minutes is listed; the user decides |

## 4. Rules for every sub-task

- No cell value, name, badge or ID is printed to the console or written to the plan. Counts, dates and record IDs only.
- The full lists go to `~/secure/syravia/reports/` (folder 700, files 600).
- A script never writes to `attendance_app` without `--commit`, and refuses any database name that is not given with `--database`.
- The agent does not read the workbooks itself; the user runs the scripts and sends the counts.

> note: 2026-11-15: plan written. OpenCode's usage limit has reset; it can start at S1.1 once S0.1 is done.

## 5. Index entry

Listed in `plans/README.md`.

## 6. Who does what: OpenCode writes, the user runs (SP15)

OpenCode may read this repo and write scripts and tests with made-up data. It may not open `~/secure/syravia/` or `.env`, and it never runs a script on real data. The user runs each script and sends back the printed counts (and the headers in O1). Each step waits for the user's report before the next starts.

The folder path is an argument: `--folder ~/secure/syravia/imports/october-2026`. Every script refuses to write to `attendance_app` without `--commit` and checks `--database`.

| Brief | Covers | Model (setup page) | Gate before it starts |
|---|---|---|---|
| O1 | S1.1 headers, sheet names, row counts (no cell values) | GLM-5.2 or Qwen3.7 Plus | S0.1 done (it is) |
| O2 | S1.2–S1.3 employee list and matching to `staff` | DeepSeek V4 Pro (off-peak), effort high | the user sends O1's headers |
| O3 | S2.1–S2.2 team per person per date; team column compare | DeepSeek V4 Pro (off-peak), effort high | O2 counts reported |
| O4 | S3.1–S3.3 roster and punch comparison, existing punches, corrections | DeepSeek V4 Pro (off-peak), effort high | O3 counts reported |
| O5 | S4 import through the existing punch-import service: dry run, then commit | DeepSeek V4 Pro (off-peak), effort high | the S3 gate passed and the user's OK |
| O6 | S5 corrections and the range file's 1–20 October part | GLM-5.2 or Qwen3.7 Plus | O5 committed |

**Common rules to paste with every brief:**

```text
Follow CLAUDE.md in full, especially §1 and §4. Plan: plans/2026-11-15-october-excel-reconciliation.md, section for this brief.
You may read this repo and write scripts and tests. Do not open ~/secure/syravia/ or .env. Do not run any script against real data; the user runs it.
Scripts take --folder <path> and --database <name>, and write only with --commit. They refuse a database whose name differs from --database.
Print counts, dates and record counts only. Never print a name, badge, employee ID or cell value. Full lists go to ~/secure/syravia/reports/ (folder 700, files 600), path given as an argument.
Tests use made-up people and made-up punches.
Checks: pnpm check && pnpm test; eslint and prettier on touched files.
Commit on app/main, only your files, and add a "> note:" under the sub-task in the plan. Do not push.
Stop and report if a sheet's headers do not match what the plan expects, if a match is ambiguous, or if a rule is not in the plan.
```

> note: 2026-11-15: section 6 added. The first brief is O1; the user runs its script and sends the headers and counts.

> note: 2026-11-16 (brief "roster changes late in October", rule implemented): script
> `scripts/october-roster-changes.ts` (analysis in `src/lib/server/imports/october-reconcile.ts`,
> tests with made-up workbooks in `october-reconcile.test.ts`). "Changed" means the team's set of
> people (the employee-ID column, or the row contents when a file has no ID column) differs from
> the previous day present in the files; per team it reports the first such date with added/removed
> counts and whether it changed again later, else "no change". Duplicates: every pair of daily
> files compared by row contents (columns whose header is a date are excluded, so a repeated day is
> still recognised); identical pairs and the count of rows shared by the non-identical pairs are
> reported, plus how much of each correction file matches a daily file (corrections are separate
> inputs, not merged). The `_to_` range file is only counted ("RANGE_FILE skipped"), `.~lock` files
> are skipped, and a file without a findable team column is reported with its header names and
> skipped — nothing is guessed. Console and report print counts, dates, team names and header
> names only; never a name, badge, ID or cell value.

> note: 2026-11-16 (brief "sort the October files into READY and PENDING"): this **replaces the
> team-change scan for now**. New script `scripts/october-file-sort.ts` (analysis in
> `src/lib/server/imports/october-sort.ts`, tests in `october-sort.test.ts`, made-up workbooks
> only). Per daily/correction file, seven checks in order, first failure wins:
> OPEN_FAILED, HEADER_NOT_FOUND (no row with ≥3 non-empty cells), REQUIRED_COLUMN_MISSING
> (no ID/badge column or no date column by header name), DATE_MISMATCH (a daily file's date column
> holds values that are not the file's own day; a correction file holding other days is allowed and
> only counted), EMPTY (no data rows), DUPLICATE_OF_OTHER_FILE (row contents are an exact copy of
> another file — hash over sorted rows, date cells included; every member of a copy group is
> flagged; shared rows between different days are never flagged), DUPLICATE_ROWS_IN_FILE (the same
> ID twice on the same date). Rows with a blank ID or blank date are counted, not failed. Range
> files are PENDING with RANGE_NOT_IN_SCOPE; `.~lock` files are SKIPPED (names printed; other xlsx
> files only counted, names not shown — one name has personal names). Nothing is inserted; no team
> membership is checked. Console and report print counts, dates and reason codes only.
