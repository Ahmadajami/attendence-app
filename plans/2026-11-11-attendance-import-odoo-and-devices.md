# Attendance import: Odoo history first, then fingerprint device files, checked against Odoo inside the app

**Status:** to do (proposed 2026-11-11; waiting for approval and the answers to Q-IM1–Q-IM7)
**Date:** 2026-11-11
**Goal:** bring the punch history into the app **from Odoo** (pilot: team Operations, October
2026; then every team and month up to go-live), then import the **fingerprint device files** for
the days after that. The comparison with Odoo that we did in a throw-away HTML page
(`dummy-html/ops-october-entry.html`, deleted 2026-11-11) becomes a **page in the app**: for every
imported person and day, the app's figures next to Odoo's, every difference with its cause. A
month counts as migrated only when no difference is left unexplained.

Replaces `2026-11-09-operations-october-punch-import.md` (now superseded): its helpers
(`src/lib/attendance/punch-import.ts`, `scripts/import-october-punches.ts`) and its open HR
confirmations (T2–T4) move here. Review of the discussion that led here (EN/AR):
`answers/2026-11-11-revision.html`.

Real data: CLAUDE.md §1. Extracted files live only in `~/secure/syravia/imports/`; this plan and
its notes use staff record IDs, dates and counts only.

## 0. Starting point (read 2026-11-11)

| What | State |
|---|---|
| Punch import code | `punch-import.ts`: one row per person and date with `HH:mm` in/out, read like the entry sheet (`resolvePair`, `validatePair`), duplicates within 60 s dropped (OI7), shift = planned or best fit. `scripts/import-october-punches.ts`: dry run and e2e run done (commit b4b8a9c); **0 events on `attendance_app`** |
| Import batches | `import_batch` / `import_row` exist, `import_kind` = `staff` only; `/imports` page imports employees (preview → commit) |
| Odoo data | `syravia_dev` (container `odoo-db`, not running on 2026-11-11): `hr_attendance` (one row per segment, so a Friday with a prayer break is two rows), `roster_line` (Odoo's day: code, required, break, credits by kind, status, OT, shortage, final, balance). For one Operations person (1c5c2c19) the 10 October work days matched the October report row for row; Odoo's day balances were reproduced on all 126 Operations rows of 1–21 Oct by the Odoo rules |
| October report | `~/secure/syravia/imports/rosters/2026-10/october_2026_no_roster.xlsx`, Daily sheet: in/out (first/last), required, actual, OT, shortage, final, balance; **no break segments, no credits** |
| Earlier source rule | 2026-11-09 the user dropped Odoo as "old data" (memory) and chose the October report; **2026-11-11 the user asks to import from Odoo** → Q-IM1 settles which store |
| Blocking rules | a punch on a day off still needs a shift (OW1–OW6 not built); a night worked on a planned day shows 12 h late (OW7–OW10); the engine has no balance, credits or Friday Prayer (engine v2) |
| Device files | none received yet (main plan S1.6, blocked on a sample) |

## 1. Decisions (proposed 2026-11-11)

| ID | Decision | Why |
|---|---|---|
| IM1 | **Source: the Odoo database, read-only, through an extraction script** that writes CSV files to `~/secure/syravia/imports/odoo/<YYYY-MM>/` (`punches.csv`: badge, check-in, check-out per segment; `days.csv`: Odoo's day figures; `states.csv`: full-day leave/sick/mission). The app never connects to Odoo's database; the import reads the files. The October report stays as a cross-check (Q-IM1) | Odoo keeps the segments and credits the report lost; files in the secure folder keep the DB boundary clean and every run repeatable |
| IM2 | **Scope: pilot first, then widen.** Pilot = Operations (6 people), 2026-10-01 → 2026-10-31. Then every app person with an Odoo badge, month by month, from 2026-10-01 to the day before the app goes live (Q-IM2) | Operations is the team we already compared row by row |
| IM3 | **Import in the app, not by script:** `/imports` gets a **Punches** kind (`import_kind` += `punches`). Upload the CSV → **preview** (one line per person and date: pairs, planned day, what the engine will do: planned / day-off work / needs a shift change / joins the previous night / refused, with the reason) → **commit** as one batch (events with source `import` and the batch id) → **undo batch** (voids its events, audited, recompute). Reuses `punch-import.ts` | The same preview-then-commit the employee import has; HR sees every decision before anything is written |
| IM4 | **Segments stay segments:** two Odoo rows on one day become two pairs; the gap is unpaid and the engine adds Friday Prayer (FP1, EN5) | Matches Odoo without storing a credit |
| IM5 | **Odoo's results imported as a reference, never as pay:** table `odoo_day_reference` (staff, date, batch, Odoo code, required, payable, break, credits by kind, status, OT, shortage, final, balance) filled from `days.csv` | The check page needs Odoo's numbers next to the app's; keeping them stops anyone recomputing Odoo from memory |
| IM6 | **Full-day states** (`states.csv`: Odoo leave / sick / mission days) become `absence` rows during the same import, listed in the preview, audited, health data never shown outside the day editor (Q-IM3) | Otherwise those days show "missing" |
| IM7 | **Odoo credit minutes** (leave / mission / sick / training, other than the automatic Friday Prayer 60): kept in the reference and shown as cause "Odoo credit, not in the app" until hourly leave exists; then one conversion step turns each into an hourly-leave row of its kind covering the day's gap (Q-IM4) | No guessed time ranges before the hourly-leave table exists |
| IM8 | **The check page:** `/imports/[id]/check` (and per person on the employee Attendance tab): app vs Odoo per day for worked, late, OT minutes, shortage, balance (balance after engine v2), status; a row with a difference gets a **cause**: plan differs (Odoo roster ≠ app roster), swap / shift change, break or prayer, credit not in the app, rounding, rule setting, punch differs, unexplained. Filters by cause and person; counts per cause; the period card (Required / Worked / OT / Shortage / Balance) for both. Pure module `src/lib/attendance/odoo-compare.ts` with tests | The HTML comparison, but inside the app on stored data, for every team |
| IM9 | **"Migrated" rule:** a month of a team is migrated when its check shows **0 unexplained** rows; each explained cause that comes from a deliberate change (rounding 15, OW rules, a corrected roster) is accepted once per cause on the check page (audited, who and when) | One clear finish line per month |
| IM10 | **Device files after Odoo:** `/imports` gets a **Device** kind for the fingerprint exports (BioTime / ZK style): raw stamps (badge, time, state if present, device). Pairing: the state code when the file has it; otherwise in/out by order inside the person's planned window; duplicates within 60 s dropped; a midnight split merged; an unknown badge goes to an alias list (`badge → staff`) HR maps once. Same preview → commit → undo → check (against the roster only, no Odoo reference) (Q-IM5) | The daily source after go-live; designed only once a sample file exists |
| IM11 | **Order:** the off-day-work rules are built before the first commit on `attendance_app` (otherwise day-off rows need a made-up shift and night rows show 12 h late); the balance column of the check waits for engine v2 Phase 1; the pilot can be imported and checked on worked / late / OT before that (Q-IM6) | The import must store punches the way they will stay |
| IM12 | **Every write through the app's BL** (permission `attendance.record`, audit, recompute); the extraction script is the only script and it only reads Odoo | CLAUDE.md §3; one path for typed, imported and device punches |

## 2. Data model

- `import_kind` += `punches`, `device`, `odoo_reference` (migration).
- `attendance_event.import_batch_id` (nullable FK) for batch undo and the check page.
- `odoo_day_reference` (IM5): `staff_id`, `shift_date`, `import_batch_id`, `odoo_code`,
  `required_minutes`, `payable_minutes`, `break_minutes`, `credit_leave`, `credit_mission`,
  `credit_sick`, `credit_training`, `prayer_credit` (bool), `status`, `ot_minutes`,
  `shortage_minutes`, `final_minutes` (numeric 2), `balance_minutes` (numeric 2); unique
  (staff, date, batch).
- `compare_cause_acceptance` (IM9): team, month, cause, accepted_by/at, note.
- `badge_alias` (IM10): badge, staff, source (`device`), created_by/at.

Migrations: generate, read the SQL, apply to `_test` and `_e2e`; `attendance_app` after the row
count and the user's OK.

## 3. Tests (Vitest, made-up people only)

| Case | Expect |
|---|---|
| I1 Friday two segments 07:30–12:10, 13:25–20:15 | two pairs, gap unpaid, preview "planned D8", prayer +60 in the day |
| I2 night row 20:00 → 08:00 on a planned N8 day | one pair on the start date |
| I3 day-off row | preview "day-off work", saved without a shift (needs OW1) |
| I4 night on a planned D8 day | preview "needs a shift change", not saved (OW7) |
| I5 a 00:00–08:00 row after a planned night | "joins the previous night" (OW12) |
| I6 duplicate stamp 30 s apart | one event |
| I7 undo batch | every event of the batch voided, days recomputed, audit row |
| I8 compare: same punches, app OT 60 (rounded to 15) vs Odoo OT 54 | cause "rounding", not "unexplained" |
| I9 compare: Odoo code D, app plan off | cause "plan differs" |
| I10 device file without state codes, 4 stamps | two pairs by order inside the window |
| I11 device file, unknown badge | row held, alias needed |

## 4. Tasks

### Phase 0 · Before anything is written to `attendance_app`
- [ ] 0.1 Answers to Q-IM1–Q-IM7; IM1–IM12 approved (on approval OI13–OI17 of the superseded plan become `replaced` by IM1, IM3 in `docs/decisions.html`).
- [ ] 0.2 Off-day-work plan: Q-OW1–Q-OW13 answered and its rules built (IM11).
- [ ] 0.3 HR confirmations carried over from the superseded plan: 4e26598d on 10-13 / 10-14
      (planned D8, punches 20:00 → 08:00: shift change?), the Oct 1–4 swap of b2339c1f and
      4e26598d (both worked swap-off days), day-off work of 4e26598d 10-17 and 8b8d9748 10-16.

### Phase 1 · Extract from Odoo (read-only)
- [ ] 1.1 Start `odoo-db` (user), count `hr_attendance` and `roster_line` per month and team
      (counts only, in a note).
      > note: 2026-11-12, October (read-only): `roster_line` 9 185 rows for 306 people (source
      > roster 271, fixed 29, cycle 6 = Operations); `hr_attendance` 4 450 rows for 291 people,
      > 2026-09-30 to 2026-10-22. People are matched by Odoo `barcode` = the app's
      > `staff.legacy_badge_no` (it differs from `employee_no` for 58 of the 302 with a badge; a first
      > count on `employee_no` alone was wrong and is replaced by this note). 274 of the 306 match;
      > 32 are not in the app (306 October punches). Of the 274, 33 have no team in the app (31 in
      > department DAM Porters && Drivers; 261 October punches), so they can't be rostered by team.
      > App side: 25 teams besides Operations with an Odoo plan, 235 people; 15 team members have
      > none (8 without a badge and not in Odoo, 1 badge not in Odoo, 6 in Odoo but never rostered
      > or punched).
      > note: 2026-11-12, roster source decided (IM13): Odoo's day plan for the other teams until HR's
      > workbooks arrive; entry through the forms (RO7). Odoo's shift hours are placeholders (all
      > "morning", start 10:00 while median check-ins are 04:00–09:30), so 19 shifts are proposed from
      > median check-ins. Entry sheet + one verify workbook per team (column A = `employee_no`) in
      > `~/secure/syravia/imports/rosters/2026-10/odoo/`: 124 own rules, 26 personal patterns (34
      > people), 67 day changes. `check-team-roster.ts verify` now takes weekly patterns and a
      > repeated `--pattern` (team + personal); `plan` stays cycle-only. Tested on
      > `attendance_app_e2e` with a made-up August case (test rows removed after): 186/186; one wrong
      > cell → 1 mismatch; personal pattern left out → its days flagged; Operations October cycle
      > unchanged (184/186, the 2 = the shift changes of 10-13/10-14). Punch files for these teams
      > must carry `employee_no` (the import matches on it), found through `legacy_badge_no`.
      > note: 2026-11-12, app vs Odoo people (by badge): 280 in both; 30 only in the app; 67 only in
      > Odoo (32 active, 21 with 306 October punches); 5 same badge with a different name (81 October
      > punches, user to check); 32 in both with no team (261 October punches); 1 active difference
      > (staff 5d58a7f0, archived in the app) excluded from everything (IM14,
      > `~/secure/syravia/imports/exclude.json`). Still to import for October 1–20: 4 450 punched
      > days (23 with a break, 2 without check-out, 3 over 16 h, 33 without an Odoo plan line) and
      > 369 leave / sick / mission days in 243 stretches. 21–31 October is in no Odoo table
      > (`raw_attendance_log` is empty).
- [ ] 1.2 Extraction script in the Roster repo (`tools/`, under that repo's CLAUDE.md): month +
      department / team filter → the three CSV files in `~/secure/syravia/imports/odoo/<YYYY-MM>/`
      (mode 600). **Done when** the October Operations files hold the counts of 1.1 and match the
      October report on first in / last out for every day.
      > note: 2026-11-12, done differently: `tools/odoo/extract_punches.py` in **this** repo (the import
      > reads its format), one Markdown file instead of three CSVs, all teams. October:
      > `~/secure/syravia/imports/odoo/2026-10/punches_2026-10.md`, 4 643 lines = 4 251 Odoo rows
      > (3 945 matched by badge + 306 of people not in the app, kept so the preview refuses them
      > visibly) + 23 extra parts from break days + 369 state lines (346 + 23); 2 without a check-out;
      > the excluded person left out; read by `readPunchFile` with 0 issues. Not ticked: the
      > comparison with the October report is not done.

### Phase 2 · Punch import in the app
- [ ] 2.1 Migration (§2), `import_kind` values, `import_batch_id`.
- [ ] 2.2 `punch-import.ts` reads the Odoo CSV (segments) and the template (first/last), returns the
      preview decisions of IM3; tests I1–I7.
- [ ] 2.3 `/imports` Punches kind: upload, preview table (filters by decision), commit, undo.
- [ ] 2.4 Full-day states (IM6) in the same preview and commit.
      > note: 2026-11-12, built (not yet ticked: I5 and I7 have no unit test, and 6.1 is the user's).
      > **2.1** migration `0024_punch_import_batch`: `import_kind` += `punches`, `import_status` +=
      > `undone`, `import_batch.summary` / `undone_by` / `undone_at`, `import_batch_id` on
      > `attendance_event` **and** `absence`; applied to `_e2e` and `_test`; on `attendance_app`
      > 2026-11-12 after the user's OK (before and after: 116 events, 0 absences, 0 batches, 310 staff;
      > migrations 24 → 25). **2.2** `#lib/attendance/punch-import`: `readPunchFile`
      > (columns Employee No, Date, Check in, Check out, State; one line = one punch part or one state,
      > never both; Excel cells read), `planPunchImport` lists skipped lines and no longer counts a
      > voided event as stored (re-import after undo), `planStateImport`, `stateRanges`; 6 new tests
      > (I1 two parts, I6 duplicate line, re-import after undo, states, ranges); 492/492.
      > **2.3** `/imports` kind "Punches and full-day states", template, batch page with the
      > one-outcome equation, reasons by count, filter (show / employee number) in the URL, 100 lines
      > per page, commit, undo with a confirm dialog; service `punch-import.bl.ts`: the planned day comes
      > from the live roster (`rosterDay`), commit plans the file again and refuses a stale preview,
      > undo refuses when a punch of the batch was corrected since; writes audited, days recomputed
      > (`punch_reading`). Upload caps for punches: 4 MB, 20 000 lines, 62 days. **2.4** states become
      > absences (consecutive days joined) in the same batch; the kind is never shown in the preview.
      > Q-IM7 default used: undo needs `import.run` + `attendance.record`.

### Phase 3 · Odoo reference and the check page
- [ ] 3.1 `days.csv` → `odoo_day_reference` (kind `odoo_reference`, same preview/commit/undo).
- [ ] 3.2 `odoo-compare.ts` + tests I8, I9.
- [ ] 3.3 `/imports/[id]/check` and the employee Attendance tab section; cause acceptance (IM9).

### Phase 4 · Pilot, then widen
- [ ] 4.1 Operations October on `attendance_app_e2e` (synthetic copy rules), then on
      `attendance_app` after the user's OK. **Done when** the check shows 0 unexplained rows
      (balance after engine v2).
- [ ] 4.2 Each further team and month (IM2), one batch each, same finish line.
- [ ] 4.3 Credit conversion to hourly leave once that plan is built (IM7).

### Phase 5 · Fingerprint device files
- [ ] 5.1 A sample export from the user (Q-IM5); read-only profile of its columns (counts only).
- [ ] 5.2 Device parser + pairing (IM10), tests I10, I11.
- [ ] 5.3 `/imports` Device kind, alias mapping, preview → commit → undo → check against the roster.

### Phase 6 · Manual checks by the user
- [ ] 6.1 Punch import preview, commit and undo on `http://127.0.0.1:5174/imports` (e2e).
      > note: 2026-11-12 the user reported the preview of the made-up sample file: the 8 expected
      > reasons, once each (duplicate skipped; refused: bad time, bad state, over 16 h, check-out only,
      > state conflict, unknown person, state with times). Same day: save and undo work (user).
      > Re-upload after undo, `/ar` and the old staff batch not yet reported.
      > note: 2026-11-12, before the real punch import (user asked for the refused ids first): the
      > preview predicted offline with the import's own planner on `attendance_app` (October roster
      > saved): 4 643 lines = 4 258 to import (3 912 pairs, 346 states; 534 pairs with a warning) +
      > 53 skipped (already imported, Operations) + 332 refused + 0 empty. Refused: 329 unknown
      > person (22 employee numbers Odoo has and the app doesn't), 3 longer than 16 h (3 people).
      > List with names for the user: `~/secure/syravia/imports/odoo/2026-10/punch-refusals-2026-10.html`.
      > note: 2026-11-12, the user's answer: keep the 3 long days (IM17: a file import keeps a pair
      > over 16 h with a warning; typed entry still refuses; 2 new tests) and give one of them the HR
      > employee number HR gave (staff 12761a44; the Odoo badge stays as legacy badge; audit row). Punch file
      > regenerated (19 lines carry the new number). Predicted again: 4 643 = 4 261 to import + 53
      > skipped + 329 refused (all unknown person, 22 employee numbers); the 3 long days import with
      > a warning.
      > note: 2026-11-12, imported on `attendance_app` by the user and checked against Odoo: batch
      > committed, 4 261 lines (3 915 pairs = 7 818 events, 346 states = 229 absences), 53 skipped,
      > 329 refused; no day left to recompute. Punches: 3 945 / 3 945 Odoo person-days equal to the
      > minute (23 break days as two parts), 0 app punch days without an Odoo row; states 346 / 346.
      > Day figures 1–20 Oct, 3 632 punched work days: worked 3 632 equal; required 3 627 (4 of the 5
      > others are Operations, whose roster follows HR's workbook); overtime 2 960 equal + 661 only the
      > app's 15-min rounding (OC7) + 11 other (7 Operations); shortage 3 498 equal, 134 other: ~120 days
      > with an Odoo credit (hourly leave / mission / sick minutes, IM7), ~10 Friday break days (prayer
      > +60, OC7), 14 where the app is 3–13 min higher (1 is 60) with no lateness: an Odoo rule to find.
      > 261 punched Odoo off days not compared yet (day-off work, check page).
- [ ] 6.2 Check page for Operations October (e2e, then real).
- [ ] 6.3 Device import with the sample file.

## 5. Questions for the user (defaults in **bold**)

| ID | Question | Default |
|---|---|---|
| Q-IM1 | Source: the **Odoo database** (keeps break segments and credits) or the October **report** workbook (first in / last out only)? On 2026-11-09 Odoo was called "old data"; for October it now matches the report | **Odoo database, report as a cross-check** |
| Q-IM2 | After the Operations pilot: which teams and months, and up to which date? | **every team with Odoo badges, from 2026-10-01 to the day before go-live** |
| Q-IM3 | Import Odoo's full-day leave / sick / mission days as absences? | **yes** |
| Q-IM4 | Odoo credit minutes: reference only now, converted to hourly leave later? | **yes** |
| Q-IM5 | Which device software, and can you give one sample export (one day, any team)? | needed for Phase 5 |
| Q-IM6 | Import the pilot before engine v2 (check worked / late / OT now, balance later)? | **yes** |
| Q-IM7 | Who may undo an import batch? | **the same permission that imports (`attendance.record`)** |
> note: 2026-11-12 answered by the user: Odoo was updated and is current again, so **the Odoo database is the source** (IM1). Checked read-only the same day: punches from 2026-05-21; October complete for 1–20 (about 290 people a day), nothing after 22 October. `hr_attendance` holds one row per person per day (first in → last out); breaks are only on `roster_line`. For Operations 1–20 Oct: 58 days, the same 58 already imported.

> note: 2026-11-12 answered by the user: **Q-IM2** every team, **October only** from Odoo (1–20); 21–31 from the device files; earlier months stay in Odoo. **Q-IM3** yes. The import goes through the **in-app import page** (IM3, IM6 approved), not an extended script. Q-IM4, Q-IM6, Q-IM7 still open.

## 6. Open items carried from the 2026-11-10 discussion pages (deleted 2026-11-11)

From `dummy-html-arch/2026-11-10-how-attendance-works.html` (not in a plan before). Not blocking
the pilot, but A1 matters as soon as imported months exist:

| ID | Question | Note |
|---|---|---|
| A1 | A backdated pattern change over days that already have punches: keep the old plan, warn, or refuse? | today the change applies and the days recompute; with imported history a warning listing the punched days is the likely default |
| A2 | Team change: choose an effective date (past or future) instead of "now"? | membership rows are dated already |
| A3 | Team change: end or keep the person's own rules (crew start, own off days)? | a crew start of the old cycle means nothing in a new team |
| A4 | New hire: membership from the start date, and ask for the crew start when the team has a cycle? | the employee import set memberships from 2026-10-01 (RO4) |

## 7. Not in this plan

Payroll exports (S5), emails (S6), automatic device sync over the network (no network access
from the app to devices while there is no facility server, S8).
