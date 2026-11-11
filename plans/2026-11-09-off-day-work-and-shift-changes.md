# Work outside the roster: day-off work without a shift, and work on another shift

**Status:** superseded (2026-11-11) by [2026-11-11-punches-without-shifts.md](2026-11-11-punches-without-shifts.md): the user's rule "a punch has no shift; the roster decides" answers Q-OW1 and makes most of this plan unnecessary; the shift change request and the other leftovers are listed there under "Later"
**Priority:** urgent
**Date:** 2026-11-09
**Goal:** every punch that does not match the roster is recorded and calculated
correctly, by hand and by import, now and in the future:

- **Day-off work** (no shift planned that day) is saved as **check-in, check-out
  and hours only, with no shift**. The screens show "Day-off work 13:00–19:45,
  6 h 45 min" instead of a shift name that nobody chose.
- **Work on another shift than the planned one** (night instead of day) is never
  shown as hours late. The app asks for the roster to be fixed first with a new
  **shift change** request (revised 2026-11-09: the existing swaps can't express it).
- **A night shift that ends on a day off** (Monday 20:00 → Tuesday 08:00, Tuesday
  off) counts entirely for Monday: Tuesday stays an off day with **no day-off work
  and no overtime** (added by the user 2026-11-09).
- **Partial (hourly) leave on such a night** (e.g. leaves at 04:00 Tuesday) is
  recorded on Monday's shift and counted there, not refused because Tuesday is off
  (added by the user 2026-11-09; built in `2026-11-09-hourly-leave.md`).

Plain-English explainer with pictures: `docs/off-day-work-explained.html`.
Arabic page with one example per question and an answer sheet: `docs/off-day-work-questions-ar.html`
(includes the proposed Q-OW13 "day with no roster", not yet in §2).

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
| Swaps | Self swap (moves an off day) and employee swap (A's work day goes to B, who must be off) exist (swaps plan); "days against the pattern are a swap" is the Operations rule (roster plan RO) | **Neither can say "same person, same date, day shift → night shift"**, so OW7 as first written ("record a swap first") had no way to be satisfied. `roster_override` (a one-off shift for one person and date) exists; only swaps write it |
| Night shift ending on a day off (checked 2026-11-09 by reading the code) | A typed night pair (`resolveCheckOut`) and the import's one-row-per-night both store every punch on the **start** date (brief §9.1 `attribution = start_date`); the off day after it has no events, stays `off`, no flag, no overtime. Monday's overtime = worked − required by Monday's pattern | Correct today, but **at risk**: (1) the new "no shift on an off day" rule would turn a Tuesday 00:00–08:00 row (a midnight split in a file, or typed on the wrong day) into day-off work; (2) a Tuesday row with only a check-out is rejected (`check_out_only`) instead of closing Monday's open check-in |
| Holiday after midnight | Brief §9.1 `holiday_split = False`: minutes after midnight on a holiday are **not** holiday minutes | Keep (Q-OW10) |
| Partial (hourly) leave | Not built; proposed in `2026-11-09-hourly-leave.md` (HL3: only inside a planned shift; test H7 covers a 02:00–04:00 leave on a night) | HL3 must say the **shift date** decides, not the calendar date of the hours, so leave on Tuesday morning inside Monday's night is allowed even when Tuesday is off |

## 1. Decisions (proposed; OW7 and OW8 revised and OW9–OW13 added 2026-11-09)

| ID | Decision | Why |
|---|---|---|
| OW1 | **A punch may have no shift only on a day with no planned shift** (day off, swap-off day, holiday). On a planned work day a shift is still required | Day-off work has nothing to be compared with; a planned day always has |
| OW2 | **Schema:** `attendance_event.shift_id` becomes nullable (migration). The service enforces OW1; existing rows keep their shift | Smallest change; the rule depends on the roster, which the DB can't see |
| OW3 | **Time reading without a shift:** the check-in is that wall-clock time on the day's date; a check-out earlier than (or equal to) the check-in is the next morning (same as `resolveCheckOut`). The pair stays on the date it started | The same rule the entry sheet already uses for check-outs |
| OW4 | **Checks without a shift:** over 16 h, overlap and future stay errors; the window warning is skipped; a reason is still required (it is unplanned work) | Same safety as today |
| OW5 | **Calculation:** a day-off pair with no shift counts like today's day-off work (required 0, late 0, every minute day-off work by the pay rules, the existing flag); overtime no longer needs a shift id | Numbers stay exactly as today; only the made-up label goes |
| OW6 | **Screens:** entry sheet and day editor offer **"No shift (day-off work)"** first on a day with no planned shift (default there); daily page, Month tab, day History and Schedule show **"Day-off work"** with the times and hours; en + ar strings | The user sees what really happened |
| OW7 | *(revised)* **Another shift on a planned day needs a shift change first:** the entry sheet, day editor and import **refuse** such a pair with "times fit N8, not the planned D8: record a shift change first" and a **Shift change** button that opens the request already filled in (person, date, from D8 to N8). After approval the pair is planned | HR rule: days against the pattern change the roster first; never a fake 12 h late. The first version pointed to a swap, which can't express it |
| OW8 | *(revised)* **Import** (`punch-import.ts`): day-off rows are saved without a shift (OW1, OW3); rows that need a shift change are listed in the preview with a **Create shift changes** button and not saved; a rerun after approval saves them | The import follows the same rules as typing, without retyping anything |
| OW9 | **New request kind `shift_change`** on `/changes`: one person, one date, from the planned shift to another shift, a reason; same pending → approve / reject / cancel flow, audit and History as swaps. Approval writes **one** `roster_override` (`swap_group_id` = the request). Migration: one value added to `swap_kind` | Reuses the swap machinery and the existing one-off table; the roster then says what really happened |
| OW10 | **When a pair "needs a shift change"** (one rule for typing and import, the one `chooseShift` already uses): both times inside the **planned** shift's window → planned; else both inside **another** shift's window → needs a shift change; else the planned shift with today's `outside_window` warning | A very late arrival on the right shift (D8, in at 11:30) stays late on D8 and is never mistaken for a shift change |
| OW11 | **A night shift belongs to the date it starts, even when the next day is off** (brief §9.1). Monday 20:00 → Tuesday 08:00 with Tuesday off: every minute counts for Monday; Tuesday stays `off` with **no day-off work, no "worked a day off" flag and no overtime**. Staying later (out at 09:00) is **Monday's ordinary overtime** by Monday's pattern, not day-off work. A holiday after midnight changes nothing (`holiday_split = False`) | The person worked one planned shift; the calendar date of its morning hours is not a second working day |
| OW12 | **Guard on the "no shift" rule:** on an off day, a time inside the **previous day's planned night shift** window is never day-off work. Typing: refused with "this belongs to Monday's night shift: enter it on Monday" and a link to that day. Import: such a row is **joined to the night** (a check-out-only row closes Monday's open check-in; a midnight split `20:00–23:59` + `00:00–08:00` becomes one pair, gap ≤ 2 min, as the old import's midnight-split merge, brief §10) and the preview says "joined to the previous night" | Without it, OW1 would turn the end of a night into paid day-off work |
| OW13 | **Partial (hourly) leave on a night shift is recorded on the night's shift date**, even when its hours fall on an off day: Monday's night, leave 04:00–08:00 Tuesday → stored on Monday, counted 240 min, early leave 0, Tuesday untouched; it comes off the balance as a fraction of Monday's required time. Built in `2026-11-09-hourly-leave.md` (HL3 clarified, test H14) | The leave is part of Monday's shift; refusing it because Tuesday is off would be wrong |

## 2. Questions for the user

| ID | Question | Default (recommended) |
|---|---|---|
| Q-OW1 | Allow "no shift" only on days without a planned shift (OW1), or on every day? | only days without a planned shift |
| Q-OW2 | Name on the screens: "Day-off work" / "عمل يوم راحة"? | yes |
| Q-OW3 | A night of day-off work (e.g. 20:00 → 08:00) stays on the date it started (OW3)? | yes |
| Q-OW4 | Another shift on a planned day: refuse until a shift change is approved (OW7), or allow and calculate against the shift actually worked (flagged)? | refuse + **Shift change** button |
| Q-OW5 | Work on a **swap-off** day (b2339c1f, Oct 1–2): keep today's flag "worked a day off without a swap", or a separate flag "worked a swap-off day"? | separate flag, so HR can check the swap |
| Q-OW6 | Payroll export: show day-off work hours in their own column? | yes, beside overtime |
| Q-OW7 | Existing punches already saved on a made-up shift on a day off (e2e only today): move them to "no shift"? | **answered 2026-11-10:** not handled. Problems that exist only in test data are not cases for this plan; the e2e rows may be deleted (or the e2e DB reseeded) instead of migrated |
| Q-OW8 | The 2 October night rows: did a colleague take that person's day shift in exchange, or did the person just work the night? | a one-person shift change (OW9); an exchange between two people = two shift changes approved together, added only if you need it |
| Q-OW9 | Night shift ending on a day off, person stays until 09:00: Monday's ordinary overtime (OW11), or day-off rate for the hour on Tuesday? | Monday's ordinary overtime |
| Q-OW10 | Night shift ending on a **holiday**: hours after midnight stay ordinary (brief `holiday_split = False`)? | yes |
| Q-OW11 | Typing a time on the off day that belongs to the previous night: refuse with a link to Monday (OW12), or move it to Monday automatically? | refuse with the link (typing); the import joins automatically |
| Q-OW12 | Partial (hourly) leave: approve `2026-11-09-hourly-leave.md` with its defaults and build it right after this plan? | yes |

## 3. Tests (Vitest, made-up people; D8 = 08:00–20:00, N8 = 20:00–08:00, required 720)

| # | Setup | Expected |
|---|---|---|
| N1 | Mon planned N8, in 20:00, out Tue 08:00; Tue off | Mon worked 720, OT 0; Tue `off`, worked 0, no day-off work, no flag |
| N2 | As N1, out Tue 09:00 | Mon OT 60 by Mon's pattern (ordinary); Tue unchanged |
| N3 | Import: Mon row in 20:00 / no out; Tue row no in / out 08:00 | one pair on Mon 20:00–08:00; preview "joined to the previous night" |
| N4 | Import: Mon row 20:00–23:59; Tue row 00:00–08:00 (midnight split) | one pair on Mon 20:00–08:00 |
| N5 | Typing on Tue (off): 00:00–08:00 while Mon was N8 | refused: "belongs to Monday's night shift", link to Mon |
| N6 | Tue (off) real work 14:00–18:00 after the N1 night | saved with no shift; Tue day-off work 240, flag as today |
| N7 | Mon planned D8; typed 20:00–08:00 | refused "needs a shift change"; after approving D8 → N8: planned, late 0 |
| N8 | Mon planned D8; in 11:30, out 20:00 | stays D8, late 210; no shift-change prompt (OW10) |
| N9 | Mon N8; hourly leave 04:00–08:00 Tue; out 04:00; Tue off | stored on Mon, leave 240, early leave 0; Tue untouched (hourly-leave plan H14) |
| N10 | Mon N8; Tue is a holiday | Mon minutes ordinary; Tue holiday rules apply only to Tue's own shift |
| N11 | Day-off pair with no shift, 13:00–19:45 | worked 405, all day-off work by the pay rules (same numbers as with a made-up shift) |

## 4. Tasks

### Phase 1: Calculation and storage

- [ ] 1.1 Migration: `attendance_event.shift_id` nullable; `swap_kind` + `shift_change` —
      *done when* applied to `_test` and `_e2e`; `attendance_app` after the row count and the
      user's OK
- [ ] 1.2 `shiftSummary` / `dayResultOf`: day-off pairs without a shift give the same figures as
      today (overtime without a shift id); `AttendanceEntry.shiftId: string | null` —
      *done when* N1, N2, N6, N10, N11 pass with `pnpm test`
- [ ] 1.3 `resolvePair` / `validatePair` without a shift (OW3, OW4) + tests

### Phase 2: Shift change request (OW9)

- [ ] 2.1 Pure `checkShiftChange` (planned work day, other active shift, no absence / override /
      holiday) + `swapOverrides` for the new kind + tests
- [ ] 2.2 Swaps service: create / approve / reject / cancel for `shift_change`; approval writes the
      override and recomputes the day; audit `swap.*` with ids only
- [ ] 2.3 `/changes`: kind "Shift change" in the new-request sheet (person, date, to shift,
      reason), list and detail; en + ar strings; svelte-autofixer clean

### Phase 3: Typing (entry sheet, day editor)

- [ ] 3.1 Services: OW1 rule, "no shift" option, OW10 refusal with the **Shift change** button,
      OW12 guard (previous night) — *done when* N5, N7, N8 pass
- [ ] 3.2 Entry sheet and day editor: "No shift (day-off work)" option, default on
      days with no planned shift; en + ar strings; svelte-autofixer clean
- [ ] 3.3 Daily page, Month tab, day History, Schedule tab: "Day-off work" label

### Phase 4: Import and reports

- [ ] 4.1 `punch-import.ts` + script: OW8 (no shift on day-off rows; "needs a shift change"
      list + button), OW12 joining (N3, N4) + tests
- [ ] 4.2 Payroll export column (Q-OW6)

### Phase 5: Partial leave on a night shift (OW13)

- [x] 5.1 `2026-11-09-hourly-leave.md`: HL3 says the shift date decides; test H14 and manual
      check 5.3 item 9 added for a night ending on an off day
      > note: done 2026-11-09 with this revision (plan text only)
- [ ] 5.2 Build the hourly-leave plan after the user approves it (Q-OW12); N9 passes there

### Phase 6: Check

- [ ] 6.1 `pnpm check`, eslint, prettier, `pnpm test`
- [ ] 6.2 Manual check by the user on the e2e server (unticked until reported):
      day-off work typed with no shift; night day-off work; a planned day with night times
      refused, the Shift change button, approval, then saved with late 0; a night ending on an
      off day shows nothing on the off day; a Tuesday 00:00–08:00 row refused with the link to
      Monday; Arabic pages
