# Operations team follows the October and November 2026 rosters

**Status:** in progress (approved 2026-11-09 with every default: Q-RO4, Q-RO8, Q-RO9, Q-RO10)
**Date:** 2026-11-09
**Goal:** the 6 members of team Operations (`31da93d7-07cf-4ee6-bf02-606158f67fa2`)
are planned in the app exactly as HR's two workbooks say, every day from
2026-10-01 to 2026-11-30, with **one pattern per month**: a new October pattern
from 2026-10-01 and the existing November pattern
`f89ce44b-9f2d-4f9e-9ef6-bb990ab7c538` from 2026-11-01. Each person has one
crew start, and the Oct 1–4 exception is recorded as **two employee swaps**
(HR and Operations rule: days against the pattern are a swap). Each employee's
Schedule tab gets a **history list**: which pattern and which crew start applied,
for which dates. Each pattern page gets a **month filter**: who followed the
pattern that month and what happened (grid, counts, swaps).

Real data: §1 of CLAUDE.md applies. This plan and every note use workbook row
numbers, staff record IDs and counts only. No employee numbers, no names.

## 0. What the workbooks say

Two files, both with the employee number in column A (added by the user
2026-11-09), the name in column B and one column per day:

| File | Sheet | Person rows | Days | Codes |
|---|---|---|---|---|
| `11 Roster NOV 2026.xlsx` | `NOV - 2026` | 7, 8, 9, 11, 12, 13 | 30 (C–AF = Nov 1–30) | D / N / O |
| `Oct roster 2026 .xlsx` | `NOV - 2026` (copied header) | 5, 6, 7, 8, 11, 12, 13 | 31 (C–AG = Oct 1–31) | D / N / O |

- **One 24-day cycle covers both months**: 4 N, 4 off, 4 D, 4 off, 4 D, 4 off.
  Two crews take turns working 4-day blocks; in each block one crew member is on
  nights and two on days. Every day has **2 D + 1 N**.
- Checked by script against every cell: with anchor 2026-10-31 each person keeps
  **the same crew start in October and November**. **November fits 180/180.**
  **October fits 186/186** once the Oct 1–4 swap of rows 8 and 13 is in (§0.1).

| Nov row | Oct row | Staff record | Crew | Crew start | UI choice | Off days in Oct | Off days in Nov |
|---|---|---|---|---|---|---|---|
| 7 | 5 | `412d2b7e-e778-405a-b04b-0f165f2efa1c` | 1 | 0 | Crew start: day 1 | 3–6, 11–14, 19–22, 27–30 | 4–7, 12–15, 20–23, 28–30 |
| 8 | 6 | `1c5c2c19-10a8-41c2-b879-bd068686ae8a` | 1 | 16 | Crew start: day 17 | 3–6, 11–14, 19–22, 27–30 | 4–7, 12–15, 20–23, 28–30 |
| 9 | 8 | `b2339c1f-a5f7-4821-bfb7-d8772e4f05f1` | 1 | 8 | Crew start: day 9 | 1–2*, 5–6, 11–14, 19–22, 27–30 | 4–7, 12–15, 20–23, 28–30 |
| 11 | 11 | `8b8d9748-9f19-4c3e-9a14-d23f38abffe4` | 2 | 4 | Crew start: day 5 | 1–2, 7–10, 15–18, 23–26, 31 | 1–3, 8–11, 16–19, 24–27 |
| 12 | 12 | `ec994043-3806-4bf7-9c06-42cdd38c62b8` | 2 | 20 | Crew start: day 21 | 1–2, 7–10, 15–18, 23–26, 31 | 1–3, 8–11, 16–19, 24–27 |
| 13 | 13 | `4e26598d-7a9d-4921-a5cd-6aacfbe9f1a6` | 2 | 12 | Crew start: day 13 | 3–4*, 7–10, 15–18, 23–26, 31 | 1–3, 8–11, 16–19, 24–27 |

`*` with the Oct 1–4 swap (§0.1).

### 0.1 What the October file has beyond the cycle (checked 2026-11-09)

- **Oct 1–4: rows 8 and 13 swapped days** (the user, 2026-11-09: by the
  Operations and HR rules this is a **swap**, because it goes against the pattern;
  it was done to manage a sub-team change). The cycle says row 8 works N on
  Oct 1–2 and is off Oct 3–4, and row 13 is off Oct 1–2 and works D on Oct 3–4.
  The file has exactly the opposite. With their November crew starts (8 and 12)
  for all of October, only these 8 cells differ, and two employee swaps give
  exactly the file (RO8).
- **Row 7 repeats row 13**: same employee number and the same codes on Oct 1–6,
  then empty. It is treated as a leftover copy and ignored. The user confirms (Q-RO4).
- ~~Row 11's employee number was missing one digit~~ in both files; **fixed by
  the user 2026-11-09**. Re-check: every employee number in both files matches
  an active Operations member (Nov 6/6, Oct 7 rows → 6 people).
- **The October header was copied from November**: sheet name, month cell
  (`Nov'2026`) and weekdays (start SUN; Oct 1, 2026 is a Thursday); the last date
  says 30 instead of 31. The day columns are read by position (C = day 1), so this
  changes nothing. The user may fix it for their own records.

## 1. What the database holds today (read-only check, 2026-11-09)

- **Pattern `f89ce44b…` (`Operation-1/Nov/2026`) is already right for November**:
  cycle, 24 slots = 4×`N8`, 4 off, 4×`D8`, 4 off, 4×`D8`, 4 off. No pay rule or
  holiday uses it. It is the only pattern used so far.
- **Assignment `cae8156d-da77-45c6-8e1b-25d1b2507ae2`** (team Operations, from
  2026-11-01) has **anchor 2026-11-09**. With that anchor and no crew starts, all
  6 people would work the same days. It is the only assignment in the DB.
- **No own rules**: `staff_schedule` is empty. No swaps, no day edits.
- **Memberships start too late**: all 257 imported memberships opened at the
  import, 2026-11-09 09:54 Damascus. A team plan reaches a person only on dates
  the membership covers at 00:00 (`teamOnDate`), so **nothing before Nov 10 is
  planned**.
- 54 stored days (the 6 people, Nov 1–9) were worked out without the right plan.
  The recompute in 4.2 replaces them.
- **The Schedule tab shows only today** (who plans the person, the own rules in
  force) and a 28-day preview window. It has no history of patterns or crew
  starts, so a past month can't be explained from it.

## 2. Decisions

| # | Decision | Why / alternatives not chosen |
|---|---|---|
| RO1 | **Keep pattern `f89ce44b…` as the November pattern** (`Operation-1/Nov/2026`): no delete | It already matches November. Rejected: delete and re-create (identical result; a delete is a hard delete) |
| RO11 | **One pattern per month, named by month** (user, 2026-11-09, option A): `Operation-1/Oct/2026` for October (made with **Copy** of the November pattern, then renamed; same 24 slots), `Operation-1/Nov/2026` for November. A later month: **Copy** the previous month's pattern (it carries the pay rule and upcoming holidays, PR14), rename it, change the days only if the roster changes, assign it from the 1st | HR works in monthly rosters, so the pattern name says which month's roster a day follows. Rejected: one pattern for every month (fewer patterns, but the name says nothing about the month); one pattern per person per month (6 × 12 = 72 a year) |
| RO2 | **Two team assignments, oldest first, both with anchor 2026-10-31** ("Cycle day 1 is on"): the October pattern from 2026-10-01, then the November pattern from 2026-11-01. The first replaces `cae8156d…` (its full row stays in the audit, B7b); the second closes the first at Nov 1 | The cycle runs on across the month line, so the anchor stays the same. Order matters: an assignment from an earlier date removes later ones. Rejected: keep anchor 2026-11-09 and add 9 to every crew start (works, but the numbers no longer match the workbook) |
| RO3 | **Day offs through one crew start per person** (B4), **from 2026-10-01**; table §0. They carry over the month line because both months use the same cycle. Row 7/5's person gets an explicit crew start 0 so all 6 are visible and audited | Who is on which day inside the crew is the crew start; patterns don't replace it. Rejected: 6 patterns; personal assignments |
| RO4 | **All 257 imported memberships start at 00:00 Damascus on 2026-10-01** (user, 2026-11-09: no join dates needed, only a date on or before the first month entered). One script, dry-run first, an audit row per membership | Without it nothing before Nov 10 is planned, for every team. An older month later can move the date back again with the same script. Rejected: each person's start date (no join dates, and they don't matter here); only the 6 Operations memberships (other teams would hit the same wall) |
| RO5 | **Workbook `D` = `D8` (08:00–20:00), `N` = `N8` (20:00–08:00), `O` = off** (user, 2026-11-09) | 2 × 12 h covers 24 h. Rejected: `D` (09:00–18:00) leaves 18:00–20:00 and 08:00–09:00 uncovered |
| RO6 | **The November assignment stays open**. When the December workbook arrives: run the check script against the November pattern; then Copy → `Operation-1/Dec/2026` → assign from 2026-12-01 (RO11), changing days or crew starts only where the check shows differences (user, 2026-11-09) | Rejected: end it on 2026-12-01 with nothing after (no plan in December) |
| RO7 | **Entry through the app's own forms by the user, checked by a read-only script** | The forms run permission, audit and recompute logic. Rejected: a script writing directly (duplicates the BL outside SvelteKit) |
| RO8 | **Oct 1–4 of rows 8 and 13 = two employee swaps** (user, 2026-11-09: Operations and HR rule, days against the pattern are a swap), with a return date, scope month: A = `b2339c1f…` (row 8), B = `4e26598d…` (row 13); swap 1: Oct 1, return Oct 3; swap 2: Oct 2, return Oct 4. Reason "Sub-team change, roster OCT 2026". Both approved | The swap is what happened, and the pattern stays clean for the rest of both months; the days show "Swap: works / Swap: off". Rejected: a crew change on Oct 5 (RO9: the same October days, but it hides a swap the rules require to be recorded); 8 one-off day edits (lose the link between the two people). If the swap form refuses a date, stop and ask |
| RO9 | ~~Rows 8 and 13 change crew on 2026-10-05~~ **Replaced by RO8** (2026-11-09): the user confirmed the Oct 1–4 days are a swap under the Operations and HR rules | — |
| RO10 | ~~The Schedule tab shows one calendar month at a time~~ **Replaced by RO12** (2026-11-09): with one pattern per month (RO11) a history list is enough | — |
| RO12 | **The Schedule tab gets a "Schedule history" list**: one line per period in which nothing changes, newest first, e.g. "1–31 Oct 2026 · Team Operations · `Operation-1/Oct/2026` (link) · Crew start: day 9 · 2 swaps". Built from the dated rows (memberships, team/department/personal assignments, own-rule versions) with the reason of each own rule, plus the approved swaps inside each period. Read-only; the 28-day preview stays and can be moved to any month | With one pattern per month the pattern name already says which month's roster applies; the list shows every past month. Rejected: the full month view (RO10: more work, the pattern name now carries the month); no change to the tab (it shows only today, so October can't be checked from December) |
| RO13 | **The pattern page gets a month filter** (user, 2026-11-09: "view what happens each month and who followed our patterns"): a **Month** tab (`?tab=month&month=2026-10`, default the current month, ‹ › to move) with (1) **who followed it that month**: the teams, departments and people it was assigned to, with the dates inside the month, and every person whose days it actually planned (same test as the engine, `rosterDay().patternId`), with their day count, crew start and a link to the person; (2) **what happened**: the month grid for those people (all days, shift chips, swap and day-edit markers), per-day counts (D8 / N8 / off) and the list of swaps and day edits in the month. Read-only, computed from the dated rows; the header's "followed by" badges (today) stay | With one pattern per month (RO11) the pattern page is where HR checks a month: who was on the roster and what changed against it. Rejected: filtering the whole page by month (the Days, Pay and Dates tabs don't depend on the month; one more control on every tab); only the employee history (RO12) (one person at a time, no view of the crew); the team roster screen S3.2 (later, and by team, not by pattern) |

**Questions:**

- Q-RO1 (answered 2026-11-09): memberships from **2026-10-01** for everyone (RO4).
- Q-RO2 (answered 2026-11-09): `D` = **D8** (RO5).
- Q-RO3 (answered 2026-11-09): keep it open; December gets its own pattern (RO6, RO11).
- Q-RO4 (answered 2026-11-09: default kept): October row 7 is a leftover copy of row 13 and can be ignored? Default: **yes**.
- Q-RO5 (answered 2026-11-09): row 11's employee number fixed in both files.
- Q-RO6 (obsolete 2026-11-09): with the swap (RO8) there is no crew change, so
  no "before Oct 5" crew start.
- Q-RO8 (answered 2026-11-09: default kept): the Arabic name of the monthly patterns? Default: the same text as the
  English name (`Operation-1/Oct/2026`), as the November pattern has.
- Q-RO9 (answered 2026-11-09: default kept): the month view on the pattern page as its own tab ("Month"), or a month
  filter above all tabs? Default: **its own tab**; the header keeps showing who
  follows the pattern today.
- Q-RO10 (answered 2026-11-09: default kept): calendar month (1st to last day, like HR's workbooks) or payroll period
  (21st to 20th) for these month views? Default: **calendar month**.

## 3. Tasks

### Phase 0: Prepare

- [x] 0.1 Move both workbooks out of the repo (CLAUDE.md §1) to
      `~/secure/syravia/imports/rosters/2026-10/` and `…/2026-11/`, mode 600.
      Done when: no `.xlsx` in the repo root; files 600 in 700 folders.
      > note: 2026-11-09: both moved; no `.xlsx` left in the repo root; `rosters/`,
      > `2026-10/`, `2026-11/` are 700, both files 600.
- [x] 0.2 Decisions RO1–RO13 and Q-RO1–Q-RO10 in `docs/decisions.html`; RO1–RO4,
      RO7, RO11, RO12, RO13 move from proposed to approved on the user's OK (RO9, RO10
      replaced; RO5, RO6, RO8 approved by the user). Done when: `node --check` on the script passes.
      > note: 2026-11-09: user approved the plan with every default; RO1–RO4, RO7,
      > RO11–RO13 now `approved` (11 roster entries approved, 2 replaced);
      > Q-RO4, Q-RO8, Q-RO9, Q-RO10 marked "answered: default kept"; `node --check` OK.

### Phase 1: Memberships from 2026-10-01 (RO4)

- [x] 1.1 `scripts/backdate-import-memberships.ts --from 2026-10-01 [--apply]`
      (dry-run by default). It takes the open memberships opened by the import
      (`valid_from` = the import instant) whose person has **no other**
      membership row, and refuses the run if any person has one. A later run with
      an older date moves the same rows again. `--apply`: one transaction that
      updates `valid_from` to 00:00 Damascus on the date and writes an audit row
      `staff_team_membership.backdate` per row (before, after, reason
      "Import memberships from 2026-10-01 (RO4)"). Prints counts only. Pure date
      helper with Vitest (made-up dates). Done when: eslint, prettier,
      `pnpm check` and `pnpm test` are clean.
      > note: 2026-11-09: pure helper `src/lib/roster/membership-backdate.ts`
      > (`startOfDayIn`, `planMembershipBackdate`) with 7 Vitest cases. "Opened by the
      > import" = people with a `staff.import` audit row; refused also: a closed row, or
      > a `--from` later than the current start. Added `--database <name>` (must equal the
      > connected DB, as in `import-employees.ts`). The dry run runs every write and rolls
      > back. eslint, prettier, `pnpm check` (0 errors) and `pnpm test` (433) clean.
- [x] 1.2 Dry-run on `attendance_app`. Done when: it reports 257 memberships and
      0 refused; the user gives their OK.
      > note: 2026-11-09 dry run: 310 imported people, 257 membership rows (0 of people
      > not imported), to move 257, already at the date 0, refused 0, 1 distinct current
      > start; 257 updated + 257 audit rows, rolled back (DB re-checked: still 257 at the
      > import instant, 0 backdate audit rows). User's OK 2026-11-09.
- [x] 1.3 `--apply` on `attendance_app`. Done when: 257 updated, 257 audit rows;
      a query shows every imported membership opening 2026-10-01 00:00 Damascus.
      > note: 2026-11-09 applied: 257 updated, 257 `staff_team_membership.backdate`
      > audit rows; query: 257 of 257 memberships open at 2026-10-01 00:00 Damascus.
      > Stored days not touched (recompute in 4.2).

### Phase 2: The check script (read-only)

- [x] 2.1 Pure module `#lib/roster/fit-roster.ts`: for a cycle's slots (as shift
      codes) and an anchor, list the crew starts that reproduce a row of codes,
      with the dates that don't fit, and pairs of rows whose odd days are each
      other's planned days (a swap between two people). Vitest with made-up rows:
      a perfect fit, a two-person swap, a row that fits nothing, a short row. Done when: `pnpm test` passes.
      > note: 2026-11-09: `fitRow`, `findSwaps`, plus the workbook reader
      > (`readWorkbookRows`, `dropDuplicateRows`); 7 Vitest cases (the four above, an
      > unexplained odd day, the reader, a duplicate row). `AIRPORT_TIME_ZONE` moved to
      > `#lib/utils/timezone.ts` (re-exported by `datetime.ts`) so `#lib/roster` no longer
      > loads the paraglide runtime in scripts. `pnpm test` 440 passed.
- [x] 2.2 `scripts/check-team-roster.ts --file <xlsx> --month 2026-10 --team <id>
      --pattern <id> --anchor 2026-10-31 --code D=D8 --code N=N8`. It reads column A
      as the employee number (refuses unknown, inactive or non-member numbers;
      reports a duplicate row), column C as day 1. Two modes:
      - `plan`: per row the staff record ID, crew start, UI choice, employee page
        path, any day that doesn't fit, and the swaps that explain those days. No
        names, no employee numbers.
      - `verify`: reads assignments, anchors, memberships, own rules, swaps and day
        edits from the DB, computes every member's planned shift for every day
        with the roster engine (`rosterDay`), checks that each day follows the
        month's pattern (`--pattern`), and compares the shifts with the file:
        match count plus each mismatch as row/date/expected/got.
      Done when: `plan` prints the table of §0, the Oct 1–4 swap of rows 8 and 13,
      and no unexplained day in either month.
      > note: 2026-11-09 `plan` with the November pattern, anchor 2026-10-31: October
      > 7 rows → 6 people (row 7 duplicate of row 13, 6 filled days, ignored); crew
      > starts rows 5/6/8/11/12/13 = 0/16/8/4/20/12; 2 swaps A = row 8, B = row 13: Oct 1
      > return Oct 3, Oct 2 return Oct 4; 178/186 on the cycle + 8 by swaps, 0
      > unexplained. November rows 7/8/9/11/12/13 = 0/16/8/4/20/12, 180/180, no swaps.
      > `verify` smoke run (before Phase 3, November): 70/180, as expected with the old
      > anchor and no crew starts. Read-only; a workbook inside the repo is refused.

### Phase 3: Entry in the app (the user, 11 forms)

The order matters: patterns, then the assignments oldest first, then the crew
starts, then the swaps (a swap is checked against the planned days).

- [x] 3.1 Patterns → `Operation-1/Nov/2026` → **Copy**; open the copy, rename it
      `Operation-1/Oct/2026` (both languages), leave the days as they are, save
      (RO11). Done when: the library shows both patterns, same 24 days.
      > note: 2026-11-09 by the user: copy `528461f1…` (`Operation-1/Oct/2026`), active, same 24 days as `f89ce44b…` (slots identical; audit `pattern.copy` ×1).
- [x] 3.2 Team Operations → "Assign a pattern": `Operation-1/Oct/2026`, from
      **2026-10-01**, "Cycle day 1 is on" **2026-10-31**, reason "Roster OCT 2026
      workbook". Done when: the audit has `pattern_assignment.set` with
      `cae8156d…` under `before.removed`.
      > note: 2026-11-09 by the user: `528461f1…` from 2026-10-01, anchor 2026-10-31; an audit `pattern_assignment.set` holds `cae8156d…` under `before`.
- [x] 3.3 Team Operations → "Assign a pattern": `Operation-1/Nov/2026`, from
      **2026-11-01**, "Cycle day 1 is on" **2026-10-31**, reason "Roster NOV 2026
      workbook". Done when: 2 assignments for the team: October pattern
      2026-10-01 → 2026-11-01, November pattern from 2026-11-01, open.
      > note: 2026-11-09: first check: not entered yet (the open October assignment also planned November; shifts right, 0 assignments on `f89ce44b…`).
      > note: 2026-11-09 by the user: 2 assignments: `528461f1…` 2026-10-01 → 2026-11-01, `f89ce44b…` from 2026-11-01, open, both anchor 2026-10-31.
- [x] 3.4 For each of the 6 employee pages (paths from 2.2 `plan`): Own rules →
      "Crew start" = the UI choice in §0, from **2026-10-01**, reason "Roster
      OCT–NOV 2026 workbooks". Done when: 6 `staff_schedule` rows from
      2026-10-01, crew starts {0, 16, 8, 4, 20, 12}.
      > note: 2026-11-09 by the user, after a first save from 2026-11-09 (the form default) was re-entered from 2026-10-01: 6 rows from 2026-10-01, crew starts {0, 4, 8, 12, 16, 20}, none later.
- [x] 3.5 Swaps → new **employee swap** ×2 (RO8), reason "Sub-team change, roster
      OCT 2026": A = row 8 (`b2339c1f…`), B = row 13 (`4e26598d…`), scope month;
      swap 1: date Oct 1, return Oct 3; swap 2: date Oct 2, return Oct 4. Approve
      both. Done when: 2 approved swaps; the daily page shows "Swap: works /
      Swap: off" on Oct 1–4 for these two people and for nobody else.
      > note: 2026-11-09 by the user: 2 approved swaps; 8 active overrides, all on Oct 1–4 for `b2339c1f…` and `4e26598d…` only (off/works as planned).

### Phase 4: Verify

- [x] 4.1 `check-team-roster.ts verify` on both files (October with the October
      pattern, November with the November pattern). Done when: **October
      186/186** (the row 7 copy ignored) and **November 180/180**, 0 mismatches.
      > note: 2026-11-09: October vs `528461f1…` **186/186**, 0 mismatches (row 7 ignored; 8 swap days, 6 own-rule versions). November vs `528461f1…` 180/180; vs `f89ce44b…` 0/180, every day "planned by another pattern" (3.3 missing). Rerun November after 3.3.
      > note: 2026-11-09 after 3.3: October vs `528461f1…` **186/186**, November vs `f89ce44b…` **180/180**, 0 mismatches.
- [x] 4.2 Recompute the stored days: daily page → "Recompute from a date"
      2026-10-01. Done when: the toast reports the days; no day of the 6 shows
      "no pattern" between Oct 1 and today.
      > note: 2026-11-09: stored days already recomputed by the saves: 240 for the team (Oct 93 work + 93 off, Nov 1–9 27 + 27), all on `528461f1…`, none without a pattern. After 3.3 Nov 1–9 must move to `f89ce44b…`.
      > note: 2026-11-09 after 3.3: the assignment save recomputed Nov 1–9 itself (no manual recompute needed): Oct 93 + 93 on `528461f1…`, Nov 1–9 27 + 27 on `f89ce44b…`, 0 days without a pattern.
- [ ] 4.3 Manual check by the user (on `http://127.0.0.1:5173`, real data):
      - Team page, next 14 days: every day 2 on D8 and 1 on N8.
      - Each of the 6 people, Schedule tab: the history list (Phase 5) shows
        October with `Operation-1/Oct/2026` and November with
        `Operation-1/Nov/2026`; moving the preview to Oct 1 and Nov 1 shows the
        off days of §0.
      - Rows 8 and 13: Oct 1–4 show the swap tags; the history shows one crew
        start each (the swap is not a schedule change).
      - Pattern pages, Month tab (Phase 6): October on the October pattern,
        November on the November pattern, as in 6.4.
      - `/ar/...`: the same pages right to left.
      Done when: the user reports it holds.

### Phase 5: Schedule history on the Schedule tab (RO12)

Can be built before or after Phases 1–4. It is how the user checks 4.3.

- [x] 5.1 Pure `#lib/roster/schedule-history.ts`: from a person's dated rows
      (memberships, team / department / personal assignments with anchor, own-rule
      versions), return the periods in which nothing changes (swaps are one-off
      days, listed under the history as "Swaps in this period"):
      `{ from, to | null, source, teamId, departmentId, patternId, anchorDate,
      crewStart, offWeekdays, ruleReason }`, newest first, using the same
      precedence as the engine (personal → team → department, B6). Vitest with
      made-up people: one period; a monthly pattern change on the 1st; a crew
      start change mid-month; a team move; no plan before the first membership.
      Done when: `pnpm test` passes.
      > note: 2026-11-09: each period's state comes from `rosterDay` itself (no
      > overrides), evaluated on every date where a membership, assignment or own rule
      > starts or ends, so the precedence is the engine's. 6 Vitest cases (the five above
      > + a personal plan winning over own rules). `pnpm test` 446 passed.
- [x] 5.2 Loader: the employee page loads the person's memberships, the
      assignments that reach them (personal, their teams', their departments'),
      own-rule versions with reasons, and the pattern names; then 5.1.
      Done when: `pnpm check` is clean.
      > note: 2026-11-09: `getScheduleHistory` in `roster.bl.ts` (also team and
      > department names and the person's approved swaps, via `swaps.crud.ts`); the
      > employee page loads it as `scheduleHistory`. `pnpm check` 0 errors.
- [x] 5.3 UI: a "Schedule history" `Card` on the Schedule tab under the summary
      (component in `#lib/app/patterns/`): one line per period with the dates
      (`formatCalendarDate` in `<bdi>`), the source (team / department /
      personal), the pattern name linking to `/patterns/[id]` via
      `localizedHref`, the crew start or off days with the rule's reason, and the
      approved swaps whose dates fall in the period (date, the other person, link
      to the swap); an `Empty` state when there is none. Strings `schedule_history_*` in `en` and
      `ar`. Svelte autofixer clean. Done when: eslint, prettier and `pnpm check`
      are clean.
      > note: 2026-11-09: `#lib/app/patterns/ScheduleHistoryCard.svelte`, after the day
      > panel on the Schedule tab; current / scheduled badges as in the pattern history;
      > swap links open `/changes?swap=<id>`. 15 `schedule_history_*` strings in en + ar.
      > Autofixer clean (card and page), eslint, prettier, `pnpm check` clean.
- [ ] 5.4 Manual check by the user (`http://127.0.0.1:5174`, e2e data, then real
      data after Phase 3):
      - The history lists every period, newest first, with the right pattern and
        crew start.
      - Row 8's person: "1–31 Oct · `Operation-1/Oct/2026` · Crew start: day 9"
        with the 2 swaps listed, then "from 1 Nov · `Operation-1/Nov/2026`".
      - The pattern names link to the pattern pages.
      - `/ar/...`: right to left, Arabic labels, dates readable.
      Done when: the user reports it holds.

### Phase 6: Month filter on the pattern page (RO13)

Can be built after Phase 5 (it reuses its history logic). It is how the user checks
a whole month for the crew (4.3).

- [x] 6.1 Pure `#lib/roster/pattern-month.ts`: from the roster data of the
      pattern's candidates for a month (`patternCandidates`, `loadRosterData`),
      return (a) the targets with their dates clipped to the month; (b) each person
      whose days the pattern planned, with day count, first and last date, crew
      start(s), swap days and edited days; (c) per-day counts by shift and off.
      Vitest with made-up data: a team assigned all month; a pattern that starts on
      the 15th; a person who joins the team mid-month; a swap day (counts the
      shift the person really works); nobody in the month.
      Done when: `pnpm test` passes.
      > note: 2026-11-09: `patternMonth` + `isMonth`, `addMonths`, `monthDates`; 6 Vitest
      > cases (the five above + the month helpers). `pnpm test` 452 passed.
- [x] 6.2 Loader for `/patterns/[id]`: when `?tab=month`, read `?month=YYYY-MM`
      (default the current month; refuse other formats with the shared
      `InvalidInputError`), load the candidates and their roster data for that
      month, run 6.1, add the swaps and day edits of those people in the month.
      Read with `staff.write` like the page. Done when: `pnpm check` is clean.
      > note: 2026-11-09: `getPatternMonth` in `assignments.bl.ts` (+ `listPeopleNames` in
      > `roster.crud.ts`). The load depends on `?month=` only; `?tab=` is read through
      > `untrack` (a direct `?tab=month` link gets this month), so switching the other
      > tabs still never refetches; opening the Month tab adds `month=`. Day edits come
      > from the followers' days (no extra query). `pnpm check` 0 errors.
- [x] 6.3 UI: a **Month** tab on the pattern page (component in
      `#lib/app/patterns/`): a month switcher (GET form / links with
      `localizedHref`, ‹ › with `rtl:rotate-180`, the month name from
      `@internationalized/date` in the current locale); "Assigned to" (targets
      with dates); "Followed by" (people, day count, crew start, link to
      `/employees/[id]?tab=schedule`); the month grid (`RosterPreview`, one row
      per person, all days of the month) with swap and day-edit markers; per-day
      counts under the grid; the swaps and day edits as a list with links. `Empty`
      state when nobody followed the pattern that month. Strings
      `patterns_month_*` in `en` and `ar`. Svelte autofixer clean. Done when:
      eslint, prettier and `pnpm check` are clean.
      > note: 2026-11-09: `#lib/app/patterns/PatternMonthTab.svelte`; month switcher is a
      > GET form like `PreviewRange` (‹ › `rtl:rotate-180`, "This month", name from
      > `formatMonth`); per-day counts per shift code, off and absent; 26 new strings
      > (`pattern_tab_month`, `patterns_month_*`) in en + ar. Autofixer clean (tab and
      > page), eslint, prettier, `pnpm check` clean.
- [ ] 6.4 Manual check by the user (`http://127.0.0.1:5174`, e2e data, then real
      data after Phase 3):
      - `Operation-1/Oct/2026` → Month → October 2026: assigned to team
        Operations 1–31 Oct; 6 people; every day 2 D8 + 1 N8; the 2 swaps on
        Oct 1–4 listed and marked on the grid.
      - The same page → November 2026: nobody (the November pattern took over);
        `Operation-1/Nov/2026` → November: the same 6 people, no swaps.
      - ‹ › moves one month; the URL keeps `?tab=month&month=…`; the other tabs
        are unchanged.
      - `/ar/...`: right to left, arrows mirrored, Arabic month names.
      Done when: the user reports it holds.

## 4. Out of scope

- Punches for October and November (entered by hand or imported later).
- Other teams' rosters: the check script, RO4 and RO11 make them the same steps.
- December: RO6 (check, Copy, rename, assign from 2026-12-01).
- A month grid for the whole team (the planned roster screen, S3.2).
