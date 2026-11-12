# Attendance rules: overtime rounding and the Friday Prayer credit as settings

**Status:** in progress (built and checked statically; the October recompute on `attendance_app` waits for the user's OK)
**Date:** 2026-11-12
**Goal:** October 2026 gives Odoo's figures, and both rules that make a difference (overtime rounding, Friday Prayer credit) are settings, dated by version, so November can use other values. This is step 4 of `2026-11-12-october-odoo-parity.md` (OC7) and the first piece of `2026-11-11-engine-v2-hourly-leave-carry.md` (EN1, EN2, EN3 in part, EN5 in part). Nothing else of engine v2 is built.

## 1. Decisions

Recorded in `docs/decisions.html` (AR1–AR6, EN and AR). Two defaults wait for the user (Q-AR1, Q-AR2).

| ID | Decision | Why |
|---|---|---|
| AR1 | Versions in table `attendance_rule` (company level only now); each has `effective_from` and an exclusive `effective_to`; a day takes the version in force on its shift date, else the built-in defaults | Dated history; EN1's shape without the department and pattern levels |
| AR2 | Overtime rounding is a step (0 = none, 5, 10, 15, 30) and a direction (nearest, up, down); Odoo's October value is none | Odoo rounds nothing |
| AR3 | Credit is three computed columns on `day_result`: `credit_minutes`, `shortage_minutes`, `credit_extra_minutes`. Credit only on a planned work day, a Friday, with exactly the setting's segments (two) | FP1, Q-EN7; no credit row, so re-imports cannot stack it |
| AR4 | Versions: 2026-01-01 → 2026-10-01 the app's old rules (nearest 15, no credit); from 2026-10-01 Odoo's rules | 9,270 stored days before October would have changed otherwise |
| AR5 | A new version may not start on or before a later one; closing the version in force; no row deleted | CLAUDE.md §6 rule 6 |
| AR6 | `DAY_RESULT_ENGINE` 2; October is recomputed with the existing "Recompute from a date" after the user's OK | Engine version is part of the hash; recomputes need the user's OK |
| Q-AR1 | Default: a Friday credit needs exactly two segments (BRIEF R15) | Waiting for the user |
| Q-AR2 | Default: months before October keep the app's old rules | Waiting for the user |

## 2. Tasks

- [x] 1. Pure rules: `src/lib/roster/attendance-rules.ts` (defaults, version in force, rounding, Friday credit). Overtime rounding takes the rule (`src/lib/roster/overtime.ts`); the constant `OVERTIME_ROUNDING_MINUTES` is gone.
      > note: 2026-11-12. `shiftSummary` counts closed segments, applies the credit, and derives shortage and leftover credit. Worked is unchanged.
- [x] 2. Day figures: `dayResultOf` stores the three columns; the explanation keeps `attendanceRules` (version id, source, values); `DAY_RESULT_ENGINE` = 2.
- [x] 3. Schema and migrations: `attendance_rule` table, `day_result` columns, `0026` (table, columns, October seed), `0027` (versions before October).
      > note: 2026-11-12 applied to `attendance_app_e2e` and `attendance_app_test`: `attendance_rule` has 2 rows (2026-01-01 → 2026-10-01, step 15, prayer off; from 2026-10-01 open, step 0, prayer on 60 min, 2 segments); migrations 27 → 28; `day_result` rows unchanged (22 377 on e2e, 0 on test).
- [x] 4. Service: `attendance-rules.bl.ts` (add a version from a date: closes the version in force, audited, flags and recomputes from the date), crud, shared zod schema.
- [x] 5. Admin page: `/admin/settings` card "Attendance rules" (rules in force today, history, add-version sheet), EN and AR strings.
- [x] 6. Day tag "Friday Prayer +60" (group `credit`, tone `info`), in the status column and the colour guide; shortage row in the figures popover.
- [x] 7. Tests: `src/lib/roster/attendance-rules.test.ts` (FP1 example; no credit on a Friday with one segment, a Thursday with two, a Friday day off, a Friday full-day state, the setting off; rounding none, nearest, up and down; the version boundary on 1 November). `overtime.test.ts` and `attendance.test.ts` updated for the default (none). `day-tags.test.ts` for the tag.
      > note: 2026-11-12 `pnpm test`: 54 files, 547 tests, all passed. `pnpm check`: 0 errors (1 warning in an untouched file).
- [ ] 8. Manual checks on `http://127.0.0.1:5174` (the user does them; see the list in section 4).
- [ ] 9. October recompute on `attendance_app` (shows the user the counts first; waits for the OK).
- [ ] 10. Odoo comparison after the recompute (read-only, counts only).

## 3. Odoo check (counts only)

Baseline from 2026-11-12, on the 3,632 punched work days of people in the app (before this change):

| Item | Equal | Differing |
|---|---|---|
| Worked | 3,632 | 0 |
| Overtime | 2,960 | 661 (rounding only), 11 other (7 Operations: HR's roster) |
| Shortage | 3,498 | 134: about 120 with an Odoo credit (out of scope), about 10 Friday break days, 14 are 3–13 minutes higher in the app |

After the recompute (waits for the user's OK):

- Targets: the 661 rounding differences gone; the Friday break days without an Odoo credit match on shortage; worked still 3,632 / 3,632.
- before → after: pending.

## 4. Manual checks (the user, on `http://127.0.0.1:5174`)

1. `/admin/settings` shows "Attendance rules": in force today "Odoo's values", and a history with two rows; the same in `/ar`.
2. "Add a version": a date in the past two days, a step of 5 minutes: a new row appears in the history; the row above shows "until" the new date. A date equal to an existing version's start is refused.
3. `/attendance/days` (after "Recompute from a date" from 2026-10-01 on the e2e database): a Friday with two punch segments on a work day shows "Friday Prayer +60" in the status column, and its shortage is lower than before.
4. Overtime minutes on a day with 7 minutes past required show 7 (not 0 or 15) for October.

## 5. Migration and data notes

- `0026` and `0027` are applied to `attendance_app_e2e` and `attendance_app_test`. `attendance_app` needs them (after the user's OK and a row count):
  `set -a; . ./.env; set +a; pnpm db:migrate` (`.env` is the real-data database; check its name first).
- A recompute on `attendance_app` rewrites stored days from 2026-10-01 to today; days before October keep their figures (AR4), and each row gets the new columns.
- Edit log: credit and shortage are not tracked yet (the explanation has the rule). Log lines for overtime and worked still appear as before.
- Not built: department and pattern levels, the "No prayer credit" day action, hourly leave, carry.
