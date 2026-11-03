# E2E test data: the Operation team, September to November 2026

**Status:** in progress (approved 2026-11-03, all questions answered; seeded, recomputed and verified 2.3; waiting for the manual check 3.x)
**Date:** 2026-11-03
**Goal:** Fill the **manual-test DB `attendance_app_e2e`** with a made-up copy of the production
Operation team: the same shifts and the same 24-day cycle, one pattern **per month** (September,
October and November 2026), each member on **their own crew start** that changes every month,
and **realistic punches and absences for September and October**, so the roster, the daily page,
the employee page and recompute can be tested on two months of history without touching real
data. November has its pattern and rules but no punches: the user types those by hand.

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

What `attendance_app_e2e` had before: 6 made-up people (numbers 1000–1504), 3 departments, 1
team, shifts `D`/`E`/`N`, 4 patterns, 46 punches, 159 stored days, company holidays on
2026-10-15 and 2026-10-19, a company overtime rule from 2026-10-01. **The user chose to wipe it**
(Q-OP4, 2026-11-03). The manual-test data behind earlier unconfirmed checks (pay plan 4.4, 4.8)
went with it; those checks are now done on the seeded Operation team.

## 1. Decisions (approved 2026-11-03)

| # | Decision | Why |
|---|---|---|
| OP1 | **Made-up people only.** 6 new staff `Ops Tester 01`…`06` (Arabic `مختبر تشغيل 01`…`06`), employee numbers **2001–2006**, start date 2026-01-01, in a new department **`Operation`** and a new team **`Operation`** (both `التشغيل`), like production. Nothing is copied from production except the pattern shape, the shift times/colours and the **crew-start values** (numbers, not personal data) | CLAUDE.md §1: no real person leaves `attendance_app` |
| OP2 | **Same shifts as production**: shifts `D8` and `N8` with the production times, colours and names | The test must behave like the real team (12 h day, overnight night shift) |
| OP3 | **One pattern per month, same slots.** `Operation-1/Sep/2026`, `Operation-1/Oct/2026` and `Operation-1/Nov/2026`, the same 24 slots, anchored on the 1st of their month; September and October end on the 1st of the next month, November is open. Each is assigned to the **team and the department**, like production | Mirrors how HR builds a new pattern each month; the cycle restarts on the 1st, like production |
| OP4 | **Crew starts change each month** (own-rule versions, Q-OP2 answer A): November copies production's six values; October gives each person another teammate's November value; September another again. No two teammates share a value in a month, and nobody repeats a value across the three months (table in §2) | "Each one has a different off day, different in each month" |
| OP5 | **Inputs only; the app computes the results.** The script writes shifts, department, team, people, memberships, patterns, assignments, own rules, the company holiday, punches and absences, with `audit_log` rows. It never writes `day_result`: the user runs **Recompute from 2026-09-01** on `/attendance/days`, so the real engine produces every stored day | A seed that wrote results itself could hide engine bugs instead of testing them |
| OP6 | **Past punches for September and October only** (Q-OP1): shift dates 2026-09-01 → 2026-10-31, never a punch after the moment the script runs. No future punches and no top-up runs; November punches are typed by the user | The user's answer (2026-11-03); the app refuses a punch in the future (`validatePair` → `future`) |
| OP7 | **Clean, then insert; deterministic and guarded.** One `pg_dump` of `attendance_app_e2e` first. `--reset` empties every test-data table (`TRUNCATE … RESTART IDENTITY`, no `CASCADE`) and **keeps** the accounts and setup: `user`, `session`, `login_attempt`, `role`, `permission`, `role_permission`, `app_setting`, the lookup lists (`staff_function`, `job_title`, `skill`, `document_type`, `custody_item_type`) and `drizzle.__drizzle_migrations`. The edit log's append-only trigger `attendance_log_no_truncate` is switched off and back on **inside the same transaction** as the TRUNCATE. Fixed random seed (same rows every run). Refuses any DB whose name does not end in `_e2e`; without `--reset` it stops if the team already exists | The user chose a clean DB (2026-11-03); the backup undoes it; nothing can point it at real data by mistake |
| OP8 | **A realistic mix** (Q-OP5): per person per month 2 late arrivals (10–45 min), 1 early leave (15–60 min), 2 overtime stays (30–90 min), the rest on time; across the team 2 missing check-outs, 2 no-shows (no punches, no absence), 1 sick spell (2 work days, September), 1 leave spell (2026-10-26 → 10-29), 1 extra shift on an off day (with a reason), a **company holiday on 2026-10-19** (overtime-eligible) that 1 person works and nobody else punches on | Every state of the daily page and every pay figure gets at least one example |

Questions (all answered 2026-11-03):

| # | Question | Answer |
|---|---|---|
| Q-OP1 | Which days get seeded punches? | **September and October**; no future punches (OP6) |
| Q-OP2 | Crew starts of the earlier months? | **A**: each person takes a teammate's value, different every month (OP4) |
| Q-OP3 | Shape of the earlier months' patterns? | **The same 24 slots** as November (OP3) |
| Q-OP4 | Team only, or team and department? | **Wipe the e2e DB and insert everything again**, then team and department like production (OP3, OP7) |
| Q-OP5 | Mix of cases, or all on time? | **Keep the mix** (OP8) |

## 2. The data

**People and crew starts** (crew start 0-based as stored; "day N" = what the UI shows; "—" = no
own rule, follows the team = day 1). The values live in `OPERATION_MONTHS`
(`src/lib/dev/operation-seed.ts`):

| Person | Employee no. | September (`Operation-1/Sep/2026`) | October (`Operation-1/Oct/2026`) | November (`Operation-1/Nov/2026`) = production |
|---|---|---|---|---|
| Ops Tester 01 | 2001 | 20 (day 21) | 9 (day 10) | — (day 1) |
| Ops Tester 02 | 2002 | — (day 1) | 13 (day 14) | 1 (day 2) |
| Ops Tester 03 | 2003 | 1 (day 2) | 20 (day 21) | 5 (day 6) |
| Ops Tester 04 | 2004 | 5 (day 6) | — (day 1) | 9 (day 10) |
| Ops Tester 05 | 2005 | 9 (day 10) | 1 (day 2) | 13 (day 14) |
| Ops Tester 06 | 2006 | 13 (day 14) | 5 (day 6) | 20 (day 21) |

Own-rule rows: one version per person per month with a value (from the 1st to the next 1st;
November open). A "—" month has no row (the `staff_schedule_has_rule` check forbids an empty
one). Reason on each: "E2E seed".

**Punches** (`attendance_event`, `source = 'seed'`, `recorded_by` = the e2e admin, `team_id` =
the new team, `shift_id` = the planned shift, `shift_date` = the day the shift starts):

- `D8`: in 5–20 min before 08:00, out 0–10 min after 20:00 the same day (unless a case says otherwise).
- `N8`: in before 20:00 on the shift date, out after 08:00 the **next** day.
- Times in `Asia/Damascus`, minute precision. A missing check-out = a check-in only. The extra
  shift carries the reason "E2E seed: extra shift".
- Where a month change puts a day shift right after a night, the night's check-out moves to
  5 min before the next check-in, so one person's pairs never overlap.

**Absences** (`absence`): 1 `sick`, 1 `leave`, reason "E2E seed". **Audit** (`audit_log`, actor =
the e2e admin): one `seed.create` row per created department, team, shift, person, pattern,
assignment, own rule and holiday, plus one `seed.e2e_operation` row with the counts.

## 3. Tasks

### Phase 1: generator and guard

- [x] **1.1** Back up `attendance_app_e2e` (`pg_dump -Fc`) to
  `~/secure/syravia/backups/attendance_app_e2e-2026-11-03-before-op-seed.dump`, mode 600.
  *Done when:* the file exists and `pg_restore --list` reads it.
  > note: 174 KB, 42 table-data entries listed.
- [x] **1.2** Pure generator `src/lib/dev/operation-seed.ts` (no DB, no `$app`; uses
  `patternSlot`, `addDays`, `daysBetween`, `startOfDamascusDay` from `#lib/roster/cycle.ts`).
  *Done when:* `src/lib/dev/operation-seed.test.ts` passes: production's rule (crew start 13 → off
  on 2026-11-01, `D8` on 2026-11-04); each month restarts on its 1st; crew starts differ per
  teammate and per month; every pair is on its planned shift except the one extra shift; no pair
  in the future, over 16 h or overlapping; the OP8 counts; no punches on absences, no-shows or the
  holiday (except its one worker); same seed → same rows.
  > note: 12 tests pass.
- [x] **1.3** Script `scripts/seed-e2e-operation.ts` (tsx, own DB client from `scripts/lib.ts`).
  Run as `pnpm exec tsx --env-file=.env.e2e scripts/seed-e2e-operation.ts --reset`.
  *Done when:* `pnpm check`, eslint and prettier on the new files and `pnpm test` pass, and it
  refuses a non-`_e2e` database before writing.
  > note: check 0 errors (1 old warning in generated `ui/`), eslint clean, 36 files / 371 tests
  > pass. Pointed at `attendance_app_test`: "Refusing to seed", exit 1.
  > note: the first `--reset` failed on the edit log's append-only trigger (TRUNCATE is atomic,
  > nothing was emptied: still 6 staff, 46 punches); the script now switches that trigger off and
  > on inside the TRUNCATE's transaction (OP7).

### Phase 2: seed and verify

- [x] **2.1** Run the script with `--reset` on `attendance_app_e2e`. *Done when:* it prints the
  counts, a second run without `--reset` refuses, and the kept tables have the same row counts.
  > note: emptied 29 tables, kept 12. Seeded 6 people, 3 patterns, 6 assignments, 15 own rules,
  > 1 holiday, 176 pairs = 350 events (112 on time, 24 late, 12 early leave, 24 overtime,
  > 2 missing check-out, 1 extra shift, 1 holiday work), 2 absences, 2 no-shows. Kept tables
  > before = after (1 user, 5 roles, 10 permissions, 20 role permissions, 4 functions, 2 job
  > titles, 1 skill, 1 document type, 21 migrations). Second run: "already there", exit 1.
- [x] **2.2** Read-only checks (SQL). *Done when:* every check passes.
  > note: 1 department, 1 team, 6 staff, 6 memberships, 2 shifts, 3 patterns, 6 assignments,
  > 15 own rules (match §2), 1 holiday, 0 overrides, 0 pay rules, 0 day_result. Shift computed in
  > SQL from anchor + crew start: 0 of 350 events differ (2 events = the extra shift, on an off
  > day as intended). 0 events after now, 0 outside 2026-09-01…10-31. Pairs per person per month
  > 13–16. Guard trigger `attendance_log_no_truncate` enabled again.
  > note: reseeded 2026-11-03 at the user's request (`--reset`). Before: 352 events, 384 day_result,
  > 404 log rows (backup `attendance_app_e2e-2026-11-03-before-op-reseed.dump`). After: 6 staff,
  > 350 events, 15 rules, 6 assignments, 0 day_result, 0 log rows, 0 future events, 1 user kept,
  > trigger enabled.
- [x] **2.3** *(user)* On `/attendance/days`, **Recompute from 2026-09-01**. Then the agent counts
  `day_result` for the 6 people from 2026-09-01 to today (at most 6 × 64 = 384) and checks that none
  is flagged `needs_recompute`.
  *Done when:* every planned work day has a row and the states include late, overtime, missing
  check-out, absent, sick, leave, holiday, off-day work.
  > note: checked 2026-11-03 after the reseed and the user's recompute: 384 rows (64 per person,
  > 09-01…11-03), 0 `needs_recompute`, 0 corrected. Stored shift = planned shift on every row except
  > the 7 intended ones (1 extra shift, 4 absence days, 2 holiday days off). Cases: late 24/24 late > 0;
  > early_leave 12/12 short; overtime 24/24 OT > 0; sick 2 + leave 4 → absence/absent; no-shows 2 →
  > missing; extra shift → off_work, 720 OT; holiday worker → holiday_work, 750 OT (743 worked,
  > rounded to the quarter hour); 5 others holiday_off. Missing check-out: 1 fixed by the user
  > (09-29, 1 manual event), 1 still open (10-20). November (no punches): 7 missing, 2 expected
  > (tonight's N8).
  > note: findings for the user: (a) the open check-out of 10-20 shows status `present` (tone "ok"),
  > because the engine has no "check-out missing" state for a past day (`shiftSummary`,
  > `src/lib/roster/attendance.ts`); (b) 107 of 112 on-time pairs carry 15–30 min OT, because the
  > seed checks in 5–10 min early and out a few minutes late, and the time past 12 h rounds to the
  > nearest 15 min (`roundOvertime`). Both waiting for the user's decision.

### Phase 3: manual check (the user, on `http://127.0.0.1:5174`)

- [ ] **3.1** `/patterns`: `Operation-1/Sep/2026`, `Operation-1/Oct/2026`, `Operation-1/Nov/2026`,
  24 slots each, the same N8/D8/OFF blocks.
- [ ] **3.2** `/teams/<Operation>`: the September, October and November previews put each member
  on that month's crew start; member rules read "Crew start: day N" as in §2.
- [ ] **3.3** `/employees/<2005>`: Own rules shows day 10 (September), day 2 (October), day 14
  (November); the day panel shows the punches.
- [ ] **3.4** `/attendance/days` for 2026-09-01 → 2026-10-31, team Operation: late, overtime,
  early leave, missing check-out, absent, sick (2003, 2026-09-26/27), leave (2006, 2026-10-26…29),
  the holiday on 2026-10-19 (one person worked it) and the extra shift all appear with sensible
  figures; night shifts count on the start date.
- [ ] **3.5** November: typing punches for 2026-11-01…03 on the entry sheet works against the
  November roster; a punch later than now is refused.
- [ ] **3.6** The same pages under `/ar/...` read right to left.

## 4. Undo

Restore the 1.1 backup (ask the user first, CLAUDE.md §1):
`docker exec -i attendance-app-db pg_restore -U attendance_app -d attendance_app_e2e --clean --if-exists < <backup>`.
Or reseed from scratch: run the script again with `--reset`. `attendance_app` (real data) and
`attendance_app_test` are never written.
