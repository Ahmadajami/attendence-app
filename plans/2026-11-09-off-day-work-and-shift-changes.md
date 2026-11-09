# Work outside the roster: day-off work without a shift, and work on another shift

**Status:** to do (proposed 2026-11-09; waiting for answers to Q-OW1–Q-OW7 and approval)
**Date:** 2026-11-09
**Goal:** every punch that does not match the roster is recorded and calculated
correctly, by hand and by import, now and in the future:

- **Day-off work** (no shift planned that day) is saved as **check-in, check-out
  and hours only, with no shift**. The screens show "Day-off work 13:00–19:45,
  6 h 45 min" instead of a shift name that nobody chose.
- **Work on another shift than the planned one** (night instead of day) is never
  shown as hours late. The app asks for the roster to be fixed first (a swap).

It came up in the October Operations import
(`2026-11-09-operations-october-punch-import.md`, now on hold until this plan is
done): 4 rows of day-off work had to be given a made-up shift, and 2 night rows on
planned day-shift days would have shown 12 h late.

Real data: CLAUDE.md §1. Record IDs, dates and counts only.

## 0. How the app works today (read 2026-11-09)

| Where | Today | Problem |
|---|---|---|
| `attendance_event.shift_id` | `NOT NULL`: every punch names a shift | Day-off work must be given a shift nobody chose |
| Entry sheet (`saveEntrySheet`), day editor (`setDayPunches`) | A shift must be picked for every pair (`attendance_shift_required`); a shift other than the planned one = `unplanned` warning + reason | On a day off the user picks any shift just to save |
| Time reading (`resolvePair`) | Uses the shift to place a check-in after midnight on the next day | Without a shift: a simpler rule is needed |
| Checks (`validatePair`) | Errors: over 16 h, overlap, future. Warnings: outside the shift's window, unplanned | Window check needs a shift |
| Day calculation, day off (`shiftSummary`, `dayResultOf`) | Required 0, late 0, **all worked minutes are day-off work** (overtime by the pattern's pay rules), flag "worked a day off without a swap" (`unauth_swap`). The shift is only a label | Overtime is computed only when a shift id exists (`attendance.ts`:217): with no shift it would be lost |
| Day calculation, planned day, other shift | Compares with the **planned** shift: a 20:00 check-in on a planned 08:00 shift = **720 min late** | Wrong "late"; the real fix is the roster (a swap) |
| Swaps | Self swap and employee swap exist (swaps plan); "days against the pattern are a swap" is the Operations rule (roster plan RO) | — |

## 1. Decisions (proposed)

| ID | Decision | Why |
|---|---|---|
| OW1 | **A punch may have no shift only on a day with no planned shift** (day off, swap-off day, holiday). On a planned work day a shift is still required | Day-off work has nothing to be compared with; a planned day always has |
| OW2 | **Schema:** `attendance_event.shift_id` becomes nullable (migration). The service enforces OW1; existing rows keep their shift | Smallest change; the rule depends on the roster, which the DB can't see |
| OW3 | **Time reading without a shift:** the check-in is that wall-clock time on the day's date; a check-out earlier than (or equal to) the check-in is the next morning (same as `resolveCheckOut`). The pair stays on the date it started | The same rule the entry sheet already uses for check-outs |
| OW4 | **Checks without a shift:** over 16 h, overlap and future stay errors; the window warning is skipped; a reason is still required (it is unplanned work) | Same safety as today |
| OW5 | **Calculation:** a day-off pair with no shift counts like today's day-off work (required 0, late 0, every minute day-off work by the pay rules, the existing flag); overtime no longer needs a shift id | Numbers stay exactly as today; only the made-up label goes |
| OW6 | **Screens:** entry sheet and day editor offer **"No shift (day-off work)"** first on a day with no planned shift (default there); daily page, Month tab, day History and Schedule show **"Day-off work"** with the times and hours; en + ar strings | The user sees what really happened |
| OW7 | **Another shift on a planned day:** the entry sheet, day editor and import **refuse** a pair whose times fit another shift better than the planned one, with the message "times fit N8, not the planned D8: record a swap first" and a link to the swap form. After the swap the pair is planned | HR rule: days against the pattern are a swap; never a fake 12 h late |
| OW8 | **Import** (`punch-import.ts`): day-off rows are saved without a shift (OW1, OW3); rows that fit another shift on a planned day are listed as "needs a swap" and not saved (OW7); a rerun after the swap saves them | The import follows the same rules as typing |

## 2. Questions for the user

| ID | Question | Default |
|---|---|---|
| Q-OW1 | Allow "no shift" only on days without a planned shift (OW1), or on every day? | only days without a planned shift |
| Q-OW2 | Name on the screens: "Day-off work" / "عمل يوم راحة"? | yes |
| Q-OW3 | A night of day-off work (e.g. 20:00 → 08:00) stays on the date it started (OW3)? | yes |
| Q-OW4 | Another shift on a planned day: refuse until a swap is recorded (OW7), or allow and calculate against the shift actually worked (no swap, flagged)? | refuse + link to the swap form |
| Q-OW5 | Work on a **swap-off** day (b2339c1f, Oct 1–2): keep today's flag "worked a day off without a swap", or a separate flag "worked a swap-off day"? | separate flag, so HR can check the swap |
| Q-OW6 | Payroll export: show day-off work hours in their own column? | yes, beside overtime |
| Q-OW7 | Existing punches already saved on a made-up shift on a day off (e2e only today): move them to "no shift"? | no; only new punches (a correction can move one) |

## 3. Tasks

### Phase 1: Calculation and storage

- [ ] 1.1 Migration: `attendance_event.shift_id` nullable — *done when* applied to
      `_test` and `_e2e`; `attendance_app` after the row count and the user's OK
- [ ] 1.2 `shiftSummary` / `dayResultOf`: day-off pairs without a shift give the
      same figures as today (overtime without a shift id); tests with made-up
      people — *done when* `pnpm test` passes
- [ ] 1.3 `resolvePair` / `validatePair` without a shift (OW3, OW4) + tests

### Phase 2: Typing (entry sheet, day editor)

- [ ] 2.1 Services: OW1 rule, "no shift" option, OW7 refusal with the swap hint
- [ ] 2.2 Entry sheet and day editor: "No shift (day-off work)" option, default on
      days with no planned shift; en + ar strings; svelte-autofixer clean
- [ ] 2.3 Daily page, Month tab, day History, Schedule tab: "Day-off work" label

### Phase 3: Import and reports

- [ ] 3.1 `punch-import.ts` + script: OW8 (no shift on day-off rows; "needs a
      swap" list) + tests
- [ ] 3.2 Payroll export column (Q-OW6)

### Phase 4: Check

- [ ] 4.1 `pnpm check`, eslint, prettier, `pnpm test`
- [ ] 4.2 Manual check by the user on the e2e server (unticked until reported):
      day-off work typed with no shift; night day-off work; a planned day with
      night times refused with the swap hint; Arabic pages
