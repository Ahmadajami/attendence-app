# Roster import: every team's month roster from one file, previewed, saved and undone in the app

**Status:** in progress
**Date:** 2026-11-12
**Goal:** create the October 2026 roster of everyone without one (Operations has its own) from
Odoo's day plan (IM13), following Odoo's structure: **one roster per department** (RI10), through `/imports` with the same preview → save → undo as the punch
import, so the punch import (`2026-11-11-attendance-import-odoo-and-devices.md`) reads planned days.
The same file shape takes HR's monthly workbooks later.

## 0. Starting point (2026-11-12, counts only)

| Item | Count |
|---|---|
| Teams without a roster | 25 with an Odoo plan (235 people) + 2 with nobody planned (Turkish Airline, Voyage Royale) |
| Shifts to create (proposed from median check-ins, user OK 2026-11-12) | 19 |
| Fitted per team (entry sheet, `~/secure/syravia/imports/rosters/2026-10/odoo/`) | 25 weekly patterns, 124 own off-day rules, 26 personal patterns (34 people), 67 day changes |
| The 67 day changes by Odoo mark (`manual_state`) | 29 swap-marked (18 off, 11 work) → 11 self-swap pairs + 7 single days; 22 extra off days and 16 worked usual off days with no mark |
| Odoo's October rosters (checked 2026-11-12) | 11, each attached to departments: DAM Porters && Drivers (90 people), all 8 Aleppo departments together (83), FlyDubi, QATAR, AirArabia, Etihad, Accounting, Station Damascus (2), Turkish (2: to 24 Oct, from 25 Oct). App departments match Odoo's one-to-one and every person of an app department follows the same Odoo roster; "Station Aleppo" is the parent of the 7 Aleppo departments |
| How Odoo stores swaps (checked 2026-11-12) | No swap record: the two day rows change (off ↔ work) with a mark `swap_off` / `swap_on` and "swapped with"; in October every one points to the **same person**, so all are self swaps. 0 swap requests in October; 21 "change my day off" requests, each the whole month (= the person's own rule). Odoo's October rows last changed 2026-11-04 |

## 1. Decisions

| ID | Decision | Why |
|---|---|---|
| RI1 | **Rosters of imported history come in through `/imports`, not typed** (replaces RO7 for history): preview → save as one batch → undo. Typing in the forms stays for day-to-day changes (user, 2026-11-12) | 25 teams by hand is hundreds of form entries; the preview keeps "HR sees everything before it is written" |
| RI2 | **Two kinds:** *Shifts* (Code, Name EN, Name AR, Start, End, Required minutes, Break minutes, Colour) and *Roster* (the month grid). Shifts first: a roster cell may only name an existing active shift | A shift is shared by many teams; one small file, created once |
| RI3 | **The roster file is HR's month grid:** `Employee No`, `Team`, then one column per date (`YYYY-MM-DD` header), each cell a shift code or `O` (off); an empty cell = no plan that day. One month per file | The shape HR already sends; the Odoo tool writes the same |
| RI4 | **The app fits the grid** (pure `#lib/roster/fit-weekly.ts`, tested): per team the main shift (most people) and a weekly pattern with the team's most common off days; per person a weekday that is off on more than half of their planned days on that weekday (and at least twice) is an off day, and their off days become an **own rule** when they differ from the team's; a person whose main shift differs gets a **personal pattern** (shared by people of the team with the same shift and off days); every remaining day is a **day change**. Before save the app replays the result through `rosterDay` and requires **0 mismatches** with the file | The structure HR would have typed; the replay proves it gives exactly the file |
| RI5 | **One month, bounded:** assignments and own rules from the 1st to the next month's 1st. A team, person or day that already has an assignment, own rule or day change in that month is **refused** with the reason (e.g. Operations) | Never overwrite a roster someone entered |
| RI6 | **Odoo's swap-marked days become app self swaps** (approved `self_swap`, first date work → off, second date off → work, same person, same week, else same month; normal pay); a swap-marked day with no partner and every other difference is a day edit (`roster_override`): a usual work day off → off; a usual off day worked → that shift (counted as extra work). Unmarked worked days: Q-RI3 | Odoo's "swap" marks are self swaps (checked 2026-11-12); the app's self swap pays the moved day normally |
| RI7 | **Batch id** on `pattern`, `pattern_assignment`, `staff_schedule`, `roster_override`, `shift`. **Undo** of a roster batch: its day changes cancelled, its assignments and own rules removed, its patterns deactivated; audited with the rows before; days recomputed. Refused once a punch import was saved on top of those days (undo that first). Shifts batch: undo deactivates its shifts while no pattern uses them | Same promise as the punch import: a mistake can be taken back |
| RI8 | **Names:** team pattern `<Team>/<Mon>/<YYYY>` (as Operations), personal `<Team> <code> <off days>/<Mon>/<YYYY>`; reason on every row `Roster import <file>` | Findable on the pattern pages |
| RI10 | **Follow Odoo's structure: a roster belongs to a department** (user, 2026-11-12). The grid has a `Department` column: the plan is fitted per department and assigned to it (Aleppo: one pattern on "Station Aleppo", which its 7 departments inherit); a person without a department falls back to their `Team`. The app plans personal → team → department, so a department pattern reaches its people with or without a team: 31 of the 32 people without a team are covered (30 in DAM Porters && Drivers, the Aleppo Lost & Found supervisor under Station Aleppo). **Drivers belong to DAM Porters && Drivers:** the 3 drivers in the Admin team without a department get that department (the user sets it on the employee page); their own 480-minute day becomes a personal pattern | Odoo HR plans by department; no team decision is needed for people Odoo already rosters |
| RI9 | **Tool** `tools/odoo/extract_roster.py` (read-only) writes the shifts file and the month grid from Odoo's day plan, matched by badge, excluded people left out (IM14) | Repeatable; no personal data in the repo |

## 2. Questions for the user (defaults in **bold**)

| ID | Question | Default |
|---|---|---|
| Q-RI1 | ~~Odoo's employee-swap days: day changes or employee swaps?~~ Answered by the data (2026-11-12): they are self swaps → RI6 | — |
| Q-RI3 | ~~The worked usual off days with no swap mark: pair as self swaps?~~ Answered 2026-11-12 by OC4 (`2026-11-12-october-odoo-parity.md`): pairs (same week, else same month) become self swaps; the 5 lone worked days stay day edits | — |
| Q-RI2 | Pattern names as RI8? | **yes** |

## 3. Data model

- `import_kind` += `shifts`, `roster`.
- `import_batch_id` (nullable FK, index) on `shift`, `pattern`, `pattern_assignment`,
  `staff_schedule`, `roster_override`.

Migration: generate, read the SQL, apply to `_e2e` and `_test`; `attendance_app` after the row
counts and the user's OK.

## 4. Tests (Vitest, made-up people only)

| Case | Expect |
|---|---|
| R1 a team of 3 on one shift, off Fri+Sat, no exception | one weekly pattern, no own rule, no day change |
| R2 one person off Sun+Mon | own rule [0, 1] |
| R3 one person on another shift | personal pattern; two people with the same shift and off days share it |
| R4 a usual work day off, a usual off day worked | two day changes (off; the shift) |
| R5 a person planned only from the 10th | empty cells = no plan; a weekday seen off only once is not a rule |
| R6 replay | the fitted structures give the grid for every person-day (0 mismatches) |
| R7 file checks | unknown employee, unknown/inactive shift code, team mismatch, a date outside the month, a person twice |

## 5. Tasks

### Phase 1 · Fitting (pure)
- [x] 1.1 `#lib/roster/fit-weekly.ts`: grid → team pattern, own rules, personal patterns, day
      changes; replay through `rosterDay` (R1–R6). **Done when** the tests pass.
      > note: 2026-11-12, 8 tests pass (R1–R6 + two reader cases). On the real October grid (offline,
      > full-month memberships): 25 patterns, 124 own rules, 26 personal patterns (34 people), 67 day
      > changes — the entry sheet's counts — and the replay of all 7 265 planned person-days gives
      > 0 mismatches.

### Phase 2 · Data
- [x] 2.1 Migration (§3) on `_e2e`, `_test`; `attendance_app` after the user's OK.
      > note: 2026-11-12, `0025_roster_import_batch`: `import_kind` += `shifts`, `roster`;
      > `import_batch_id` on `shift`, `pattern`, `pattern_assignment`, `staff_schedule`,
      > `roster_override` **and** `swap_request` (self swaps, OC4). Applied to `_e2e` and `_test`
      > (26 migrations each); `attendance_app` 2026-11-12 after the user's OK (before and after:
      > shifts 4, patterns 3, assignments 2, own rules 6, day edits 10, swaps 4, punches 116, staff
      > 310; migrations 25 → 26).

### Phase 3 · Shifts kind
- [x] 3.1 Reader + preview (create / same as the app / code taken with other times → refused),
      save, undo; template.
      > note: 2026-11-12, `#lib/roster/roster-file.ts` `readShiftFile` (the shift form's own zod rules,
      > Excel times read, a code twice refused) + tests; `roster-import/shift-import.bl.ts`; undo
      > refused while a shift is used. Manual check: 6.1.

### Phase 4 · Roster kind
- [x] 4.1 Reader (R7) + fit + checks against the app (RI5) + preview per team (pattern, own
      rules, personal patterns, day changes, refused people / teams, replay result).
      > note: 2026-11-12, `readRosterGrid` (+ tests) and `roster-import/roster-import.bl.ts`. Groups:
      > the `Department` column (assigned to the department, reaching its sub-departments), else
      > `Team`, whose people are planned **person by person** (personal patterns): a team pattern
      > would also reach team members a department plans, and a team pattern comes first (found on
      > the real October file: 313 replay mismatches over 12 people until changed). Fit adds self
      > swaps (OC4: a day off on a work day + a worked off day, same shift, same week, else month).
      > Refused: unknown person / group / shift, archived, twice, not in the department or team, the
      > group or person already planned in the month, the person's team planned, a pattern name taken.
- [x] 4.2 Save (one batch, audited, recompute) and undo (RI7).
      > note: 2026-11-12, save plans the file again (stale → refused) and needs 0 replay mismatches;
      > patterns, assignments (1st → next 1st), own rules, day edits, approved self swaps with their
      > day edits, all with the batch id; touched people = listed + unlisted members of the
      > departments; recompute up to today. Undo refused once a punch batch covers those dates.
      > note: 2026-11-12, fixed after the user's first e2e save ("something changed since the
      > preview" with nothing changed): the save compared the stored preview as JSON text, but `jsonb`
      > reorders keys; it now compares with keys sorted (`#lib/utils/canonical-json.ts`, 2 tests).

### Phase 5 · Tool and October
- [x] 5.1 `tools/odoo/extract_roster.py` → `~/secure/syravia/imports/rosters/2026-10/odoo/`
      (`shifts_2026-10.md`, `roster_2026-10.md`).
      > note: 2026-11-12, each Odoo roster → the nearest app department holding all its people; a
      > person's group = the nearest such department in their chain, else own department, else
      > team; members of a team planned in the month (Operations) and excluded people left out.
      > October: 267 people, 21 groups (13 departments), 17 shifts (none in the app yet). Offline
      > dry run (the import's readers, fit and replay on the app's real departments and
      > memberships): 0 issues, 13 department patterns, 18 personal patterns (29 people), 162 own
      > rules, 33 self swaps, 108 day edits (54 extra days off, 50 another shift on a work day, 4
      > worked usual days off of which 1 punched), **0 mismatches over 7 976 planned days**. The 3
      > Admin-team drivers still have no department, so they are in team Admin; rerun the tool after
      > the user sets their department.
      > note: 2026-11-12, rerun after the 3 drivers got DAM Porters && Drivers: 267 people, 21 groups
      > (DAM 92), 17 shifts; dry run 13 department patterns, 19 personal patterns (29 people), 162 own
      > rules, 33 self swaps, 108 day edits, 0 refused, 0 mismatches over 7 976 planned days. The
      > real database's October own rules, day edits and swaps are all Operations' (not in the file).
- [x] 5.2 e2e: a made-up shifts file and grid; then `attendance_app` after the user's OK; each
      team checked with `check-team-roster.ts verify` (0 mismatches).
      > note: 2026-11-12, real import by the user: shifts batch 17 created; roster batch 267 people,
      > 32 patterns, 42 assignments (13 department, 29 personal), 162 own rules, 33 self swaps (66
      > swap days), 108 day edits, 0 refused, 0 mismatches. Checked against the file from the stored
      > rows (replay through `rosterDay`): 7 976 / 7 976 planned person-days equal; the recomputed
      > day results: 7 976 / 7 976 equal, none missing, none still flagged. 2 department members not
      > in the file (HR & Admin 1, Station Damascus 1; no Odoo plan) are planned by their department's
      > pattern: 43 work days, 28 of them on 1–20 Oct without a punch.

### Phase 6 · Manual checks by the user
- [ ] 6.1 Shifts and roster preview, save, undo on `http://127.0.0.1:5174/imports` (e2e).
      > note: 2026-11-12 the user ran the e2e checklist: no errors (after the save-check fix).
      > note: 2026-11-12 made-up files ready: `~/secure/syravia/imports/test/shifts-e2e-sample.md`,
      > `roster-e2e-sample.md` (August 2026, which e2e has free); checklist given to the user.
- [ ] 6.2 After the real import: a team's Schedule tab and pattern page look as if typed.
