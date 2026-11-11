# Shift change request: one person, one date, another shift

**Status:** in progress (asked by the user 2026-11-11: "import now then build the shift change request"; built, all three databases migrated; waiting for the user's check 5)
**Date:** 2026-11-11
**Goal:** HR can record that a person works **another shift on a planned work day** (for example
day shift D8 → night shift N8 on 13 Oct). It is a third kind on the Swaps page next to self swap
and employee swap: the same request → approve / reject / cancel flow, audit and History. Approving
it changes the roster for that one day, and the day is recalculated against the new shift, so a
night worked on a planned day-shift date is never shown as 12 hours late.

First use: Operations, person 4e26598d, 13 and 14 Oct 2026 (HR's workbook says D, the punches are
20:00 → 08:00), see `2026-11-11-punches-without-shifts.md` task 4.

## 1. Decisions

| ID | Decision |
|---|---|
| SC1 | **A new swap kind `shift_change`** on `swap_request`, with a new column `shift_id` (the new shift). Only the person (A), one date (`first_date`), no second date, no other person, never "pay as overtime" |
| SC2 | **Only on a planned work day, to a different shift.** Refused on a day off, a full-day absence, a holiday, a day that already has another override, or when the new shift is the planned one |
| SC3 | **Approving writes one `roster_override`** (person, date, new shift, `swap_group_id` = the request), like a swap; cancelling an approved one removes it. The day is recalculated (cause `swap`) |
| SC4 | **The day is a normal work day on the new shift:** required, late and overtime against the new shift; no off-day pay |
| SC5 | **Where:** Swaps page → New → kind "Shift change" (person, date, new shift, reason); the day panel and a "fits another shift" warning on the entry sheet open it filled in (`/changes/new?kind=shift_change&staff=…&date=…`) |

## 2. Tasks

- [x] 1 Migration: `swap_kind` += `shift_change`, `swap_request.shift_id` (FK `shift`), checks.
      > note: 2026-11-11 `drizzle/0023_shift_change_request.sql`; the check compares `kind::text`, because
      > drizzle runs all pending migrations in one transaction and a new enum value can't be used as
      > an enum there.
- [x] 2 Rules (`src/lib/roster/swaps.ts`) + tests; schema, service, labels, both languages.
      > note: 2026-11-11 issues `missing_shift`, `same_shift`; 4 new tests; `pnpm test` 485 passed.
- [x] 3 Screens: New swap form (kind, date, shift), list, pattern month tab, schedule history,
      links from the day panel and the entry sheet. `pnpm check`, `pnpm test`, eslint, autofixer.
      > note: 2026-11-11 `pnpm check` 0 errors, eslint and prettier clean, svelte-autofixer clean on
      > SwapForm, changes/+page, changes/new/+page, PatternMonthTab, ScheduleHistoryCard, DayPanel,
      > EntrySheetForm.
- [x] 4 Apply the migration to all three databases (`attendance_app` after the user's OK).
      > note: 2026-11-11 applied to `attendance_app_e2e` and `attendance_app_test`; `attendance_app`
      > after the user's OK the same day: before and after 2 swaps, 8 overrides, 116 events.
- [ ] 5 The user records D8 → N8 for 4e26598d on 13 and 14 Oct and checks those days are no
      longer late.
