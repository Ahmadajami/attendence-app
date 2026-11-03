# E2E test data: the Operation team, October and November 2026

**Status:** to do (proposed 2026-11-03; waiting for the user's approval and answers to Q-OP1–Q-OP5)
**Date:** 2026-11-03
**Goal:** Fill the **manual-test DB `attendance_app_e2e`** with a made-up copy of the production
Operation team: the same shifts and the same 24-day cycle, one pattern **per month** (October and
November 2026), each member on **their own crew start** that changes between the months, and
**realistic punches and absences from 2026-10-01** onward, so the roster, the daily page,
the employee page and recompute can be tested on a whole month of history without touching real data.

**Lane:** the main agent on `app/main` (no app code changes; one new script, one pure helper with
a Vitest test, this plan, decisions entries). One commit. Resume point = the first unticked box.

## 0. What production has (read-only queries, 2026-11-03; IDs and counts only)

| Thing | Production value |
|---|---|
| Pattern `f89ce44b-…-bb990ab7c538` | name `Operation-1/Nov/2026`, **cycle, 24 slots**: `N8 N8 N8 N8 · OFF×4 · D8 D8 D8 D8 · OFF×4 · D8 D8 D8 D8 · OFF×4` (slots 0–23). No own pay rule, no own holiday |
| Shifts | `D8` 08:00→20:00 (colour `#475569`), `N8` 20:00→08:00 next day (`#0f766e`); break 0, required = span (720 min), grace 0, window 180 before / 360 after |
| Assignments | 2, both anchor **2026-11-01**, from 2026-11-01, open: team `Operation` (`39805e41-…`) and department `Operation` (`fe748490-…`, no sub-departments) |
| Team | 6 active members, all in the Operation department |
| Own rules (`staff_schedule`, from 2026-11-01, open) | 5 members with a crew start: **0-based 1, 5, 9, 13, 20** (shown as "Crew start: day 2, 6, 10, 14, 21"); the 6th has no rule (follows the team, day 1) |
| Punches for these people | none yet |

How a day is chosen (`patternSlot`, `src/lib/roster/cycle.ts:51`): slot =
`(days since anchor + crew start) mod 24`. "Crew start: day 14" in the UI = `crew_start = 13`.

What `attendance_app_e2e` has today: 6 made-up people (numbers 1000–1504), 3 departments
(`Operations` `0398a2c8-…` with sub-department `Ramp`), 1 team (`E2E Team A`, no members),
shifts `D`/`E`/`N`, 4 patterns, 46 punches, 159 stored days, company holidays on **2026-10-15**
and **2026-10-19**, a company overtime rule from 2026-10-01. None of it is changed by this plan;
everything below is **added**.

## 1. Decisions (proposed; stop and ask before departing from one)

| # | Decision | Why |
|---|---|---|
| OP1 | **Made-up people only.** 6 new staff `Ops Tester 01`…`06` (Arabic `مختبر تشغيل 01`…`06`), employee numbers **2001–2006**, start date 2026-01-01, in the e2e `Operations` department and a new team **`Operation`** (`التشغيل`). Nothing is copied from production except the pattern shape, the shift times/colours and the **crew-start values** (numbers, not personal data) | CLAUDE.md §1: no real person leaves `attendance_app` |
| OP2 | **Same shifts as production**: new shifts `D8` and `N8` in e2e with the production times, colours and names (e2e's own `D`/`N` have other times and stay untouched) | The test must behave like the real team (12 h day, overnight night shift) |
| OP3 | **One pattern per month, same slots.** `Operation-1/Oct/2026` (copy of the November slots, anchor **2026-10-01**, assigned 2026-10-01 → 2026-11-01) and `Operation-1/Nov/2026` (anchor **2026-11-01**, from 2026-11-01, open), both assigned to the **team only** (Q-OP3, Q-OP4) | Mirrors how HR builds a new pattern each month; the cycle restarts on the 1st, like production |
| OP4 | **Crew starts change each month** (own-rule versions): November copies production's six values; October uses the same six values **rotated by two people**, so each member differs from every teammate *and* from their own November start (table in §2, Q-OP2) | "Each one has a different off day, different in each month" |
| OP5 | **Inputs only; the app computes the results.** The script writes shifts, team, people, memberships, patterns, assignments, own rules, punches and absences, with `audit_log` rows. It never writes `day_result`: the user runs **Recompute from 2026-10-01** on `/attendance/days`, so the real engine produces every stored day | A seed that wrote results itself could hide engine bugs instead of testing them |
| OP6 | **No future punches** (Q-OP1): punches stop at the last shift that has **ended** when the script runs (today: up to shift date 2026-11-02). November 3–30 shows as the planned roster. The script takes `--to <date>` and **can be rerun later** to top up the days that have passed since, up to 2026-11-30 | The app refuses a punch in the future (`validatePair` → `future`), and recompute stops at today (PR18) |
| OP7 | **Deterministic and guarded.** Fixed random seed (same data every run); refuses to run unless the DB name ends in `_e2e`; structure is created once (found again by employee numbers 2001–2006 and the pattern names); punches are added only for dates after the last seeded one; one `pg_dump` of `attendance_app_e2e` into `~/secure/syravia/backups/` before the first run | Safe to rerun, impossible to point at real data by mistake, and one restore undoes everything |
| OP8 | **A realistic mix**, at fixed counts per person per month (Q-OP5): mostly on time (±10 min), 2 late arrivals (10–45 min), 1 early leave (15–60 min), 2 overtime stays (30–90 min), and across the team: 2 missing check-outs, 2 no-shows (no punches, no absence), 1 sick spell (2 days, Oct), 1 leave spell (4 days, Oct 26–29), 1 extra shift on an off day (with a reason), 1 person working the company holiday 2026-10-19; nobody else punches on 10-15 / 10-19 | Every state of the daily page and every pay figure gets at least one example |

Questions for the user (each default above is used until answered; the answers go here and into
`docs/decisions.html`, then the decisions become `approved`):

| # | Question | Default |
|---|---|---|
| Q-OP1 | You asked for punches **up to 2026-11-30**, but today is 2026-11-03. Fill only the days that have passed (rerun later to top up), or write future punches now (the app would never accept those from a user)? | days that have passed only; rerun to top up (OP6) |
| Q-OP2 | October crew starts: the rotation in §2, or other values? | rotation in §2 (OP4) |
| Q-OP3 | October pattern: the same 24 slots as November, or a different shape (e.g. start on a day block instead of nights)? | same slots (OP3) |
| Q-OP4 | Production also assigns the pattern to the **department**. In e2e, `Operations` has the sub-department `Ramp` with person 1500, who would then follow it too. Team only, or team and department? | team only (OP3) |
| Q-OP5 | The mix of late / overtime / missing / sick / leave / extra shift / holiday work in OP8: keep, or all on time? | keep (OP8) |

## 2. The data

**People and crew starts** (crew start 0-based as stored; "day N" = what the UI shows; "—" = no
own rule, follows the team = day 1):

| Person | Employee no. | October 2026 (`Operation-1/Oct/2026`) | November 2026 (`Operation-1/Nov/2026`) = production |
|---|---|---|---|
| Ops Tester 01 | 2001 | 9 (day 10) | — (day 1) |
| Ops Tester 02 | 2002 | 13 (day 14) | 1 (day 2) |
| Ops Tester 03 | 2003 | 20 (day 21) | 5 (day 6) |
| Ops Tester 04 | 2004 | — (day 1) | 9 (day 10) |
| Ops Tester 05 | 2005 | 1 (day 2) | 13 (day 14) |
| Ops Tester 06 | 2006 | 5 (day 6) | 20 (day 21) |

Own-rule rows: an October version (2026-10-01 → 2026-11-01) for everyone with an October value,
a November version (2026-11-01 → open) for everyone with a November value (a "—" month has no
row: the `staff_schedule_has_rule` check forbids an empty one). Reason on each: "E2E seed".

**Punches** (`attendance_event`, `source = 'seed'`, `recorded_by` = the e2e admin, `team_id` =
the new team, `shift_id` = the planned shift, `shift_date` = the day the shift starts):

- `D8`: in around 07:50, out around 20:05 the same day.
- `N8`: in around 19:50 on the shift date, out around 08:05 the **next** day.
- Times in `Asia/Damascus`, minute precision, deviations from OP8, all inside the shift's window.
- A missing check-out = a check-in only. An extra shift on an off day carries the reason
  "E2E seed: extra shift".
- Roughly 15–16 planned work days per person in October, 1–2 in Nov 1–2 → about 190 pairs.

**Absences** (`absence`): 1 `sick` (2 days, October) and 1 `leave` (2026-10-26 → 10-29), reason
"E2E seed". **Audit** (`audit_log`, actor = the e2e admin): one row per created shift, team,
person, pattern, assignment and own rule (as the services write them), plus one
`seed.e2e_operation` row per run with the punch and absence counts.

## 3. Tasks

### Phase 1: generator and guard

- [ ] **1.1** Back up `attendance_app_e2e` (`pg_dump -Fc` inside the container, copied to
  `~/secure/syravia/backups/attendance_app_e2e-2026-11-03-before-op-seed.dump`, mode 600).
  *Done when:* the file exists and `pg_restore --list` reads it.
- [ ] **1.2** Pure generator `src/lib/dev/operation-seed.ts`: given the pattern slots, anchors,
  crew starts per month, a date range, `now` and a seed, returns the planned days and the punch /
  absence rows (no DB, no `$app`). Uses `patternSlot` and `startOfDamascusDay` from
  `#lib/roster/cycle.ts`.
  *Done when:* `src/lib/dev/operation-seed.test.ts` passes: (a) every work day's shift equals
  `patternSlot(...)` for that person and month, and November matches production's rule (crew
  start 13 on 2026-11-01 → slot 13 = OFF, on 2026-11-04 → slot 16 = `D8`); (b) no punch on a planned
  off day except the one extra shift; (c) no pair ends after `now`; (d) no two pairs of one person
  overlap and none is longer than 16 h; (e) the OP8 counts hold; (f) the same seed gives the same rows.
- [ ] **1.3** Script `scripts/seed-e2e-operation.ts` (tsx, own DB client like `scripts/lib.ts`,
  no `$app`): refuses unless `current_database()` ends in `_e2e`; creates the structure once
  (OP7) in one `batch`; inserts punches and absences for `(last seeded date, --to]` in one
  `batch` with the audit rows; prints counts only. Run as
  `pnpm exec tsx --env-file=.env.e2e scripts/seed-e2e-operation.ts --to 2026-11-02`.
  *Done when:* `pnpm check`, eslint and prettier on the new files and `pnpm test` pass, and running it
  against `attendance_app` (with a fake `DATABASE_URL` to a non-`_e2e` name) exits with an error
  before writing.

### Phase 2: seed and verify

- [ ] **2.1** Run the script on `attendance_app_e2e`. *Done when:* it prints the counts and a
  second run adds nothing.
- [ ] **2.2** Read-only checks (SQL): 6 people in team `Operation`; 2 patterns, 2 assignments; own
  rules as in §2; every punch's `shift_id` equals the slot computed in SQL from the anchor and the
  crew start; no punch after now; existing e2e rows unchanged (same counts as §0).
  *Done when:* every check passes; counts go in a `> note:`.
- [ ] **2.3** *(user)* On `/attendance/days`, **Recompute from 2026-10-01**. Then the agent counts
  `day_result` for the 6 people from 2026-10-01 to today (at most 6 × 34 = 204) and checks that none
  is flagged `needs_recompute`.
  *Done when:* every planned work day has a row and the states include late, overtime, missing check-out, absent,
  sick, leave, holiday, off-day work.

### Phase 3: manual check (the user, on `http://127.0.0.1:5174`)

- [ ] **3.1** `/patterns`: `Operation-1/Oct/2026` and `Operation-1/Nov/2026`, 24 slots each, the
  same N8/D8/OFF blocks.
- [ ] **3.2** `/teams/<Operation>`: the October preview puts each member on their October crew
  start, November on their November one; member rules read "Crew start: day N" as in §2.
- [ ] **3.3** `/employees/<2005>`: Own rules shows day 2 for October and day 14 for November; the
  day panel shows the punches.
- [ ] **3.4** `/attendance/days` for 2026-10-01 → 2026-11-02, team Operation: late, overtime, missing
  check-out, absent, sick, leave, the holiday on 10-15 / 10-19 and the extra shift all appear with
  sensible figures; night shifts count on the start date.
- [ ] **3.5** The same pages under `/ar/...` read right to left.
- [ ] **3.6** Later (Q-OP1 default): rerun the script with `--to <yesterday>` and recompute; the new days
  appear.

## 4. Undo

Restore the 1.1 backup (asks the user first, CLAUDE.md §1):
`docker exec -i attendance-app-db pg_restore -U attendance_app -d attendance_app_e2e --clean --if-exists < <backup>`.
Nothing else is touched; `attendance_app` (real data) and `attendance_app_test` are never written.
