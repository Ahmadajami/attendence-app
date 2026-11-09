# Operations team: October 2026 punch history from Odoo

**Status:** to do (proposed 2026-11-09; Phase 0 done, waiting for the user's answers to Q-OI1–Q-OI9 and "approved")
**Date:** 2026-11-09
**Goal:** bring the October 2026 check-ins and check-outs of the 6 members of
team Operations (`31da93d7-07cf-4ee6-bf02-606158f67fa2`) from the local Odoo DB
into `attendance_app`, so the app computes their October days against the
roster already entered (plan `2026-11-09-operations-roster-nov-2026.md`).
A one-time history import: not the general punch-file import S1.6 (still
blocked on Q-A11).

Real data: CLAUDE.md §1 applies. This plan, the decisions and every note use
staff record IDs, dates and counts only. No employee numbers, no names, no
reasons.

**Hard scope.** Exactly these 6 staff, shift dates 2026-10-01 → 2026-10-31.
Nobody else is extracted, imported, given an absence or recomputed:

| Short ID | Staff record ID |
|---|---|
| 1c5c2c19 | `1c5c2c19-10a8-41c2-b879-bd068686ae8a` |
| 412d2b7e | `412d2b7e-e778-405a-b04b-0f165f2efa1c` |
| 4e26598d | `4e26598d-7a9d-4921-a5cd-6aacfbe9f1a6` |
| 8b8d9748 | `8b8d9748-9f19-4c3e-9a14-d23f38abffe4` |
| b2339c1f | `b2339c1f-a5f7-4821-bfb7-d8772e4f05f1` |
| ec994043 | `ec994043-3806-4bf7-9c06-42cdd38c62b8` |

## 0. What Phase 0 found (read-only, 2026-11-09)

**App DB `attendance_app`**

- Team `31da93d7` has exactly these 6 members for October: one open membership
  each, from 2026-10-01 00:00 Damascus; no other member. All 6 active.
- `attendance_event` is empty (whole DB: 0 rows). No active absence for the 6.
- Stored days (`day_result`) for the 6 in October: 186 (6 × 31). Planned
  shift days 93 (D8 62, N8 31), off 93. Statuses today: `missing` on work days,
  `off` on off days. Swap days: 8 (4e26598d 4, b2339c1f 4).
- Shifts: D8 08:00–20:00 and N8 20:00–08:00 (used by the pattern), plus D
  09:00–18:00 and N 20:00–08:00; every shift has window 180 min before and
  360 min after.
- For all 6, `staff.legacy_badge_no` = `staff.employee_no` (6 of 6), so the
  match key is the same whichever column is used.

**Odoo DB `syravia_night_shift`** (container `odoo-db`, 127.0.0.1:5432)

- `raw_attendance_log` (model `raw.attendance.log`, the device punch store) is
  **empty**: 0 rows in this DB, and 0 in `syravia_dev`, `syravia_ref`,
  `syravia_test`, `legacy_test` (`builder_test` has no such table). There are
  no raw device punches in Odoo.
- `hr_attendance` holds the punches as **closed pairs** (`check_in`,
  `check_out`, both full timestamps, stored as UTC without zone): 4,230 rows
  with a check-in in October (all people). For the 6 (matched
  `hr_employee.barcode` = `staff.employee_no`, 1 Odoo employee each, all active):
  **58 pairs**, every one with a check-out; `in_mode` / `out_mode` = `manual`;
  all created in one go on 2026-10-22; minute precision (no seconds).
- Per person (pairs = distinct Damascus check-in dates): 1c5c2c19 10,
  412d2b7e 6, 4e26598d 11, 8b8d9748 11, b2339c1f 10, ec994043 10 → **total 58,
  equal to the Odoo baseline from the report**.
- Per Damascus check-in date: 3 pairs on each day 2026-10-01 → 2026-10-20,
  except 10-08 and 10-09 with 2. **0 pairs from 2026-10-21 to 2026-10-31**
  (the user confirmed 2026-11-09: those punches were never collected).
- Shape: 38 day pairs (check-in 06–13 h Damascus, 405–882 min), 20 night pairs
  (check-in 17–20 h, all end the next morning, 720–890 min). **No night shift
  is split**: each night is one row with its next-morning check-out.
- 1 more pair of one of the 6 checks in on 2026-09-30 and ends on 2026-10-01:
  shift date 2026-09-30, outside the scope.

**Excel report** (`~/secure/syravia/imports/rosters/2026-10/october_2026_no_roster.xlsx`,
sheet `Daily`, cross-check only)

- For the 6: 186 lines, 58 with check_in + check_out, none on or after 10-21,
  no swap flag (`is_swapped_off` / `is_swapped_on` all `No`).
- **58 of 58** Excel lines have the same date and the same HH:MM as the Odoo
  pairs converted from UTC to Asia/Damascus. This confirms Odoo stores UTC.
- `manual_state`: 182 normal, **4 sick**: 412d2b7e 2 days (one range),
  b2339c1f 2 days (one range); all four are planned D8 days in the app, none has
  a punch.

**Pairs against the app's roster** (Damascus check-in date; day pair = check-in
before 15 h, night pair = after)

- 52 of 58 fall on a day the app plans the same shift (D8 or N8).
- 6 do not:

| Person | Shift date | Pair | App plans | Note |
|---|---|---|---|---|
| 4e26598d | 2026-10-13 | night (20:00, 720 min) | D8 | Odoo had this person on 2-day blocks |
| 4e26598d | 2026-10-14 | night (20:00, 720 min) | D8 | same |
| 4e26598d | 2026-10-17 | day (08:00, 720 min) | off | |
| 8b8d9748 | 2026-10-16 | day (07:00, 752 min) | off | |
| b2339c1f | 2026-10-01 | day (07:00, 824 min) | off, `swap_off` | Oct 1–4 swap |
| b2339c1f | 2026-10-02 | day (13:00, 405 min) | off, `swap_off` | Oct 1–4 swap |

- Swap days with pairs: 6 (4e26598d 10-01 and 10-02 N8 `swap_on`, as planned;
  b2339c1f 10-03 and 10-04 D8 `swap_on`, as planned; b2339c1f 10-01 and 10-02
  on its `swap_off` days, the two rows above).

**Code to reuse (no second matcher)**

- `attributeEvent()` in `src/lib/roster/attendance.ts`: the existing pure
  overnight-safe matcher (BRIEF §10): a punch goes to the rostered shift whose
  attribution window holds it, else to the best-fitting active shift as
  unscheduled; a check-out stays with the open check-in's shift while it is in
  that shift's window. Not used by any service yet (manual entry picks the shift
  date by hand).
- `validatePair()` / `pairMinutes()` in `src/lib/attendance/entry.ts`: the manual
  entry's checks (errors: longer than 16 h, overlap, future; warnings: outside
  window, unplanned).
- `recomputeDailyScope()` (daily page **Recompute these days**, scoped to one
  team) recomputes only the team's people. `recomputeFrom()` (**Recompute from a
  date**) recomputes everyone: not used here.
- `setDayState()` (day-state service, the day editor) writes an absence with a
  reason, one audit row, and recomputes.
- Scripts run under `tsx` and cannot import services (`#lib/server/db` needs
  `$app/env`). `entry.ts` pulls in paraglide through `auth.schema.js` and
  `utils/datetime.js`; Phase 2 checks it loads under `tsx` first.

## 1. Decisions (proposed; all in `docs/decisions.html`, group "Monthly rosters")

| ID | Decision | Why |
|---|---|---|
| OI1 | **Source = Odoo `hr_attendance`** (58 closed pairs, full timestamps) for the 6, check-in in October Damascus time. The Excel `Daily` sheet is a cross-check only | `raw_attendance_log` is empty in every Odoo DB; the pairs carry full timestamps and agree 58/58 with the Excel; the Excel has HH:MM only |
| OI2 | **`source = 'seed'`** on every imported event | Main plan §2/§4: Odoo history is the seed. `import` stays for device files (S1.6), `manual` for typed punches |
| OI3 | **Times are UTC** in Odoo; stored as `timestamptz` as they are | Odoo stores naive UTC; the Excel's Damascus HH:MM match 58/58 after converting |
| OI4 | **Each pair → 2 events** (`check_in`, `check_out`; type from the Odoo column, never guessed). Shift date and shift from `attributeEvent()` over the person's roster days (day before, day, day after); the check-out with `open` = the check-in's attribution. A pair whose two ends land on different shift dates or shifts is **held** (not imported, listed by person ID + date) for the user | One matcher, the existing one; a pair is one shift worked, never split |
| OI5 | **Manual entry's checks** (`validatePair`): an error (over 16 h, overlap, future) rejects the pair; a warning (outside window, unplanned) imports it with a fixed reason, `Odoo history (October 2026): not on the planned shift` | Same rules as typed punches; the service requires a reason on unplanned punches |
| OI6 | **Roster days for matching = the stored `day_result` rows** (shift, team, swap role) of the 6 for 2026-09-30 → 2026-11-01, read before writing | The script cannot load the roster through the services; those rows were recomputed and verified 186/186 against the workbook (roster plan). Alternative: an admin-only server action that loads the roster through the services (more code, same result today) |
| OI7 | **Idempotent**: an event already stored with the same staff, `occurred_at`, type and `source = seed` is skipped; two punches of one person within **60 s** of each other count as one (the later is skipped) | A rerun inserts nothing; the 58 pairs have minute precision, so 60 s catches only real duplicates |
| OI8 | **Scope filter everywhere**: the extractor reads only the 6 people's pairs (their badges come from the app by staff ID, never typed); the importer rejects any other employee number with a reason; shift dates outside 10-01 → 10-31 are rejected (the 09-30 pair) | Hard scope of this task |
| OI9 | **Oct 21–31 stay without punches** (planned days show as missing); nothing is invented | The punches were never collected (user, 2026-11-09) |
| OI10 | **Recompute only the team**: daily page → scope team Operations → **Recompute these days** 2026-10-01 → 2026-10-31 (the user, in the browser). Not "Recompute from a date" | The existing scoped recompute, 6 people only, one audit row |
| OI11 | **Never imported**: Odoo statuses, schedules, cycles, swaps, `manual_state`, leave reasons | The app's roster is the truth; the old cycles were wrong for ec994043 and 4e26598d |
| OI12 | **The 4 sick days** are entered by the user in the day editor (2 actions: 412d2b7e one 2-day range, b2339c1f one 2-day range), state `sick`, reason `Odoo history (October 2026)` | Goes through the existing absence service (`setDayState`), with its audit and recompute; the Odoo reason text is never copied |

## 2. Questions for the user (answer before "approved")

| ID | Question | Default |
|---|---|---|
| Q-OI1 | Source: Odoo `hr_attendance` pairs (58, full timestamps) as OI1, or the Excel `Daily` sheet (HH:MM as Damascus, check-out < check-in = next day)? They agree 58/58 | `hr_attendance` |
| Q-OI2 | `source = seed` for these events (OI2), or `import`? | `seed` |
| Q-OI3 | Odoo times are UTC (OI3, confirmed by the Excel match): agree? | yes |
| Q-OI4 | Oct 21–31: import nothing, the planned days stay "missing" (OI9)? | yes |
| Q-OI5 | Duplicates: same person, same type within 60 s = one punch (OI7)? None expected | 60 s |
| Q-OI6 | **4e26598d, 2026-10-13 and 10-14:** night pairs (20:00 → 08:00) on days the roster plans D8. `attributeEvent` puts each check-in on the planned D8 (inside its window, which runs to 02:00) and the check-out on the next day's D8, so OI4 would hold both pairs. Options: (a) import each as an **unplanned N8 on its check-in date** with the OI5 reason, the planned D8 then shows as not worked; (b) hold them and you enter them in the day editor; (c) first record what really happened in the roster (e.g. a self swap D8 → N8), then import as planned | (a) |
| Q-OI7 | **Day pairs on off days** (4e26598d 10-17, 8b8d9748 10-16): import as unplanned work on an off day with the OI5 reason? The day engine then treats them by the pattern's pay rules for work on an off day | yes |
| Q-OI8 | **b2339c1f, 2026-10-01 and 10-02:** the app has these as the person's `swap_off` days of the Oct 1–4 swap, but Odoo has a day pair on both (07:00, 824 min; 13:00, 405 min). Import them as unplanned work on swap-off days (the day then shows the swap and the punches), or is the swap as entered wrong for this person (then fix the swap first)? Note: the 13:00 pair fits shift D (09–18) better than D8 by `attributeEvent`'s distance rule; force D8 for it? | import as unplanned; keep `attributeEvent`'s choice |
| Q-OI9 | The 4 sick days (2 people, one 2-day range each, OI12): record them as `sick` absences — you in the day editor (default), or the import script writing the absence rows plus audit itself? | you, in the day editor |

## 3. Tasks

### Phase 0: Plan (read-only)

- [x] 0.1 Find the source and count it (Odoo + Excel cross-check), re-check the scope
      > note: 2026-11-09 `raw_attendance_log` 0 rows in every Odoo DB; `hr_attendance` 58 pairs for the 6 (10/6/11/11/10/10), 0 after 2026-10-20; Excel 58/58 same date and time; team 31da93d7 still has exactly the 6 for October; 0 events in `attendance_app`
- [x] 0.2 Compare the pairs with the app's planned days
      > note: 52 on the planned shift, 4 on off days (2 of them b2339c1f's swap-off days), 2 night pairs on planned D8 days (4e26598d); 4 sick lines (412d2b7e 2, b2339c1f 2)
- [x] 0.3 Write this plan, the index row and decisions OI1–OI12 (proposed)
- [ ] 0.4 The user answers Q-OI1–Q-OI9 and says "approved"

### Phase 1: Extraction (after approval)

- [ ] 1.1 Read-only extractor `scripts/extract-october-punches.sh`: takes the 6
      employee numbers from `attendance_app` by staff record ID, runs one
      `BEGIN READ ONLY` query on `odoo-db` (`docker exec … psql`), writes
      `~/secure/syravia/imports/punches/2026-10/operations_punches_2026-10.csv`
      (folder 700, file 600): `employee_number, occurred_at` (ISO UTC),
      `type` (`check_in` | `check_out`), `odoo_attendance_id`. Prints counts only
      — *done when* the file has 116 rows (58 × 2), 6 employee numbers, mode 600,
      and nothing is written in the repo

### Phase 2: Import script

- [ ] 2.1 Pure helpers in `src/lib/attendance/punch-import.ts` (parse rows, scope
      filter, 60 s duplicate rule, pair → `attributeEvent` → held / rejected /
      accepted with reason) + Vitest tests with made-up people only — *done when*
      `pnpm test` passes
- [ ] 2.2 `scripts/import-october-punches.ts` (style of
      `scripts/backdate-import-memberships.ts`, `scripts/lib.ts`): `--file`,
      `--database` (must equal the connected DB), dry run by default, `--commit`.
      Reads the 6 people's roster days (OI6), team on the shift date from the
      stored day (= `teamOnDate`), skips stored events (OI7), writes
      `batch([...inserts, auditInsert(...)])` with one audit row (file name,
      counts, `source = seed`). Prints counts only: people matched, events per
      person ID and per day, rejected / held by reason, duplicates skipped —
      *done when* `pnpm check`, eslint and prettier pass
- [ ] 2.3 `attendance_app_e2e`: dry run, commit and a rerun (0 new) with a
      synthetic file (made-up numbers for the e2e Operation people)
- [ ] 2.4 Dry run on `attendance_app`, shown to the user
- [ ] 2.5 Commit on `attendance_app` after the user's OK; rerun dry = 0 new

### Phase 3: Recompute and verify

- [ ] 3.1 The user: day editor, 4 sick days (Q-OI9) and the scoped recompute
      (OI10)
- [ ] 3.2 Report (counts only): days with a punch per person ID next to the
      Odoo baseline (6/10/10/11/11/10), every difference explained; days per
      status per person; the 8 swap days with their swap role; Oct 21–31 as
      missing
- [ ] 3.3 Manual check by the user (unticked until reported): Month tab of the
      October pattern; Schedule tab and day History of 2 people (one with a swap)
