# Hourly leave: paid and unpaid hours off inside a work day

**Status:** to do (proposed 2026-11-09; waiting for the user's answers to Q-HL1–Q-HL9 or "every default")
> note: 2026-11-11 the user chose four **kinds** instead of paid / unpaid: annual, sick, mission (paid) and unpaid (EN8 in `2026-11-11-engine-v2-hourly-leave-carry.md`). HL1 (`paid boolean` → `kind`), HL7–HL9 change accordingly before building; EN9 adds "Cover the gap". This plan is Phase 2 of engine v2.
**Date:** 2026-11-09
**Goal:** HR records that a person is away for **part of a work day** (for example 10:00–12:00
on a 08:00–20:00 shift), as **paid** hourly leave (counted as time worked and taken from the
yearly leave balance) or **unpaid** hourly leave (excused, so not late or short, but not paid).
The daily record, the day tags, the edit log and the leave balance follow straight away, and the
payroll engine (S4.1) gets the minutes it needs for Final and Deduction.

**Lane:** one agent on `app/main` (or a branch `app/hourly-leave` cut from it). One commit per
phase, with the plan file. Start from the first unticked box.

**Before you start, read:** `CLAUDE.md` in full (§1 personal data, §3 UI + Forms rules for every
`.svelte` change, §5 plans, §6 decisions log, §8 hand-off), then
`plans/2026-11-01-pattern-pay-holidays-missions.md` (PR13 permissions, PR16–PR24 the stored day,
recompute and edit log, PR19 day states, PR30–PR34 leave balance, Phase 7 not built yet) and
`docs/reference/BRIEF.md` §4 (R5 grace, R7 status, R8 credits never create OT, R9 Final, golden
numbers G2, G6, G7).

---

## 0. Starting point (checked 2026-11-09)

- **Full-day states only.** `absence` (`src/lib/server/db/schema/attendance.ts:81`) holds whole
  Damascus dates (`starts_on`–`ends_on`), types `sick | leave | no_show | other | mission`
  (`ABSENCE_TYPES`, `src/lib/schemas/enums.ts:22`). `leave` is paid. There is **no unpaid leave
  type and no part-day record**. A `leave` day makes the day `source = 'absence'`, status
  `absent`, required 0 (punches stay but count for nothing, PR19).
- **Old module:** `roster.line.leave_credit_minutes` (356 days used it, 32,348 minutes,
  `docs/reference/DATA_PROFILE.md:133`) is exactly "paid hourly leave": minutes that reduce the
  shortage but never create OT (R8) and add to Final (R9; golden G2, G6, G7). The deprecated
  `partial_leave_minutes` is empty (P16) and is not ported. The old module had **no unpaid
  hourly leave**; HR handled it outside the system.
- **Day engine:** `dayResultOf` (`src/lib/attendance/day-result.ts:86`, `DAY_RESULT_ENGINE = 1`)
  uses `shiftSummary` (`src/lib/roster/attendance.ts:156`): lateness = check-in − planned start,
  status `late` past the shift's grace, `short` when worked < required. There is **no early-leave
  minutes, no shortage minutes, no credits, no Final or Deduction yet**: those are S4.1 (main
  plan, Lane C, not started) — `day_result`'s comment already reserves them.
- **Day editor:** `DayStateSheet.svelte` / `DayPanel.svelte` (`src/lib/app/attendance/`) on
  `/attendance/days`; service `src/lib/server/services/day-state/day-state.{bl,crud}.ts`
  (permission `attendance.record`, `batch` + audit, `markNeedsRecompute` then `recomputeAfter`,
  source `day_edit`).
- **Leave balance:** `src/lib/leave/balance.ts` (`leaveBalance`: whole days only) and the
  `leave_entitlement` table (`days numeric(5,2)`, so fractions already fit). The `/leave` page and
  the employee **Leave** card (pay plan Phase 7) are **not built yet**.
- **Edit log enums:** `LOG_FIELDS`, `LOG_SOURCES`, `LOG_CAUSES` (`src/lib/schemas/enums.ts:77–127`).
- **Newest migration:** `0021_staff_legacy_badge_no`.

## 1. Words used in this plan

| Word | Meaning |
|---|---|
| **Hourly leave** | One record: a person, a shift date, a time range inside that day's planned shift, paid or unpaid, a reason. Arabic UI: «إجازة ساعية» |
| **Paid hourly leave** | The minutes count as worked for pay (a *credit*, R8/R9) and come off the yearly leave balance |
| **Unpaid hourly leave** | The minutes are *excused* (no lateness, no shortage flag, no tardiness bracket) but **not paid**: they reduce Final (S4.1) and do not touch the balance |
| **Counted minutes** | The part of a record that falls inside the day's planned shift window; only these count |

## 2. Decisions (proposed 2026-11-09; the user approves or changes them)

| # | Decision | Why |
|---|---|---|
| HL1 | **A new table `hourly_leave`**, not more columns on `absence`: one row per range, `starts_at`/`ends_at` as `timestamptz`, `paid boolean`, a reason, cancelled never deleted (Q-HL1) | `absence` is day-granular with a per-date `EXCLUDE`; mixing time ranges into it would break that rule and every reader of it. Times as `timestamptz` (CLAUDE.md §6.4), overnight shifts included |
| HL2 | **Entered as a time range** (from–to, local time) on a shift date, **not as a number of minutes** (Q-HL2) | The range tells the engine whether it covers the late start, the early end or the middle, so lateness and early leave are measured correctly; HR reads "10:00–12:00", not "120" |
| HL3 | **Only on a planned work day, inside the planned shift window.** Refused on off days, holidays, days with a full-day state, and outside the shift. A range that covers the **whole** required time is refused with "use a full-day state instead" **The shift date decides, not the calendar date of the hours** (added 2026-11-09, off-day-work plan OW13): on a Monday 20:00 → Tuesday 08:00 night, leave 04:00–08:00 is recorded on Monday and allowed even when Tuesday is an off day | One clear meaning per day; a full day already has its own state (PR19); a night's morning hours are part of the night |
| HL4 | **Several ranges per day are allowed if they don't overlap** (`EXCLUDE` on `tstzrange` per person among active rows), minimum **15 minutes** each (Q-HL3) | Morning errand plus an afternoon appointment is real; overlaps would double count |
| HL5 | **If the roster changes after the leave was recorded** (day becomes off, a full-day state is set, the shift moves), the row stays but counts only its minutes inside the new shift window (often 0), and the day gets a "Hourly leave outside the shift" tag | Rows are never edited by side effects (R17: regeneration keeps manual work); HR sees and fixes it |
| HL6 | **Lateness and early leave are measured around the leave:** a range starting at the shift start moves the expected arrival to its end; a range ending at the shift end moves the expected departure to its start. Grace (R5) applies after that | 08:00 shift, leave 08:00–10:00, check-in 10:05 → late 5 (within grace), not 125 |
| HL7 | **Paid leave minutes are a credit (R8):** they reduce the shortage and **never create overtime**. OT stays worked − required. The stored day keeps the counted minutes as recorded; S4.1 applies R9 exactly (golden G2, G6, G7: the credit adds to Final even on a make-up day) (Q-HL5) | Matches the old `leave_credit_minutes` and the golden numbers HR already trusts |
| HL8 | **Unpaid leave minutes are excused, not paid:** the day is not `late`/short because of them, no tardiness bracket (R6) for them, but S4.1 subtracts them from Final, so they show in Deduction (R10) | "Unpaid" means the salary goes down, not that the person broke a rule |
| HL9 | **Paid hourly leave comes off the yearly leave balance as a fraction of that day's required time:** 3 h on a 12 h shift = 0.25 day; 2 h on an 8 h shift = 0.25 day. The balance stays in days with two decimals and also shows hours (Q-HL4) | A full-day leave already counts one planned work day whatever its length (PR31); the fraction keeps the same rule for part of a day. No new setting |
| HL10 | **Going over the balance is a warning, not a refusal** (same as PR33) | HR may approve exceptions |
| HL11 | **Who:** `attendance.record` sets and cancels (PR13), past dates allowed (PR11), every write audited without the reason (it may hold health details), then flags and recomputes the days (PR17), source `day_edit`, cause `hourly_leave` | Same path as day states; nothing new to learn |
| HL12 | **Where:** a **Hourly leave** section in the existing day editor (`DayStateSheet` / `DayPanel` on `/attendance/days`): list of the day's ranges (time, paid/unpaid, minutes, Cancel) and an Add form. Day tags "Hourly leave (paid) 2 h" / "(unpaid)". The employee **Leave** card and `/leave` (pay plan Phase 7) show hours taken (Q-HL6) | HR already edits days there; no new page |
| HL13 | **No request/approval flow in this plan:** HR records approved leave, like full-day states (Q-HL7) | Requests by employees need login (S8) |
| HL14 | **No monthly cap** on hourly leave in this plan; a monthly total is shown per person on the Leave card (Q-HL8) | Nobody named a cap; adding one later is a setting, not a redesign |
| HL15 | **Full-day unpaid leave is not in this plan** (Q-HL9): HR keeps using `other` until asked | The request was hourly leave; a new absence type touches the balance, tags and reports |

## 3. Data model (migration `0022_hourly_leave` + custom `0023_hourly_leave_constraints`)

| Table / enum | Change |
|---|---|
| `hourly_leave` (new, `schema/leave.ts`) | `id uuid`, `staff_id → staff (restrict)`, `shift_date date`, `starts_at timestamptz`, `ends_at timestamptz`, `paid boolean not null`, `reason text not null`, `recorded_by`, `cancelled_by`, `cancelled_at`, timestamps. Checks: `ends_at > starts_at`, duration 15 min – 16 h, reason present. Indexes (`staff_id`, `shift_date`), (`shift_date`) |
| custom SQL | `EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (cancelled_at IS NULL)` (needs `btree_gist`, already used by `absence`: check, else `CREATE EXTENSION IF NOT EXISTS`) |
| `day_result` | `leave_paid_minutes int not null default 0`, `leave_unpaid_minutes int not null default 0`, `early_leave_minutes int not null default 0` |
| `LOG_FIELDS` | + `leave_paid`, `leave_unpaid`, `early_leave` |
| `LOG_CAUSES` | + `hourly_leave` |
| `DAY_RESULT_ENGINE` | 1 → 2 (every stored day is rewritten on the next recompute; only the three new columns change for days with no hourly leave) |

Migrations go to `attendance_app_test` and `attendance_app_e2e` without asking, to
`attendance_app` only after a row count and the user's OK (CLAUDE.md §4).

## 4. Engine rules (pure, `src/lib/leave/hourly.ts` + `day-result.ts`)

1. `countedRanges(day, rows)`: clip each active row to the planned shift window
   `[day.start, day.end]`; drop empty parts. Full-day state, off day or holiday → nothing counts
   (HL5).
2. `paidMinutes` / `unpaidMinutes` = sums of the counted parts by `paid`.
3. **Expected arrival** = shift start, moved to the end of a counted range that starts at the
   shift start (chains of touching ranges move it further). **Expected departure** = shift end,
   moved likewise to the start of a range that ends at the shift end (HL6).
4. `lateMinutes` = max(0, check-in − expected arrival); `earlyLeaveMinutes` = max(0, expected
   departure − check-out) (new, also for days without leave). Grace from the shift as today.
5. **Short** = worked + paid + unpaid < required. Status `late` uses the moved arrival.
6. **Overtime** unchanged: worked − required (HL7, R8). Leave minutes never add to it.
7. If the person punched **inside** a leave range, nothing is taken off; the day gets a "Worked
   during hourly leave" tag so HR can cancel or shorten the leave (Q-HL5).
8. **Balance** (`balance.ts`): `leaveBalance` takes hourly rows with their day's required minutes;
   `taken`/`booked` add `minutes / required` rounded to 2 decimals; new fields `hoursTaken`,
   `hoursBooked` (HL9). Unpaid rows never count.

## 5. Tests (Vitest, made-up people only)

| # | Setup (shift 08:00–20:00, required 720, grace 15 unless said) | Expected |
|---|---|---|
| H1 | Paid 08:00–10:00, in 10:05, out 20:00 | late 5 (within grace, status not `late`), worked 595, paid 120, OT 0 |
| H2 | Unpaid 18:00–20:00, in 08:00, out 18:00 | early leave 0, unpaid 120, short false, OT 0 |
| H3 | Paid 12:00–14:00, in 08:00, out 20:00 | paid 120, worked 720, OT 0, tag "worked during hourly leave" |
| H4 | Paid 07:00–09:00 (starts before the shift) | counted 08:00–09:00 = 60 |
| H5 | Leave 08:00–20:00 (whole shift) | refused at write: "use a full-day state" |
| H6 | Two ranges 09:00–10:00 and 09:30–11:00 | second refused (overlap) |
| H7 | Night shift 20:00–08:00, paid 02:00–04:00 on shift date D | stored on D, instants on D+1 02:00–04:00 Damascus, counted 120 |
| H8 | Day later set to full-day `sick` | hourly row kept, counted 0, tag "outside the shift" |
| H9 | Paid 3 h on a 12 h day + paid 2 h on an 8 h day, yearly 21 | taken 0.5, hoursTaken 5, left 20.5 |
| H10 | Unpaid 4 h | balance unchanged |
| H11 | No leave, in 08:00, out 19:30 | early leave 30 (new column), short true |
| H12 | Paid 08:00–09:00 and 09:00–10:00 (touching), in 10:00 | arrival moved to 10:00, late 0 |
| H13 | Golden G2 / G6 / G7 re-expressed with paid hourly leave | the minutes S4.1 needs are on the day (contract test for Lane C) |
| H14 | Night shift 20:00–08:00 on Mon, **Tue is an off day**; paid 04:00–08:00, out 04:00 | allowed and stored on Mon; counted 240, early leave 0, OT 0; Tue stays `off` with nothing on it (off-day-work plan OW13, N9) |

## 6. Tasks

### Phase 0 · Decisions
- [ ] 0.1 The user answers Q-HL1–Q-HL9 (or "every default"); HL1–HL15 become `approved` in this
      plan and in `docs/decisions.html`. **Done when** the status line says approved.

### Phase 1 · Schema
- [ ] 1.1 `hourly_leave` in `schema/leave.ts`, new `day_result` columns, enum additions;
      `pnpm db:generate` → read the SQL → `0022`; custom `0023` with the `EXCLUDE`. **Done when**
      `pnpm check` passes and both SQL files are read.
- [ ] 1.2 Apply to `attendance_app_test` and `attendance_app_e2e`. **Done when** both list 23
      migrations.
- [ ] 1.3 Apply to `attendance_app` after the row count and the user's OK. **Done when** the user
      said yes and the count is in a note.

### Phase 2 · Engine (pure)
- [ ] 2.1 `src/lib/leave/hourly.ts` (`countedRanges`, `leaveMinutes`, `expectedWindow`) and the
      `shiftSummary` / `dayResultOf` changes, `DAY_RESULT_ENGINE = 2`, `diffDayResult` tracks the
      three new fields. **Done when** H1–H8, H11–H14 pass and the existing tests still pass.
- [ ] 2.2 `balance.ts` hours (HL9). **Done when** H9, H10 pass and T23/T24 still pass.
- [ ] 2.3 Day tags `hourly_leave_paid`, `hourly_leave_unpaid`, `hourly_leave_outside_shift`,
      `worked_during_leave` (+ explanations, colour guide entries). **Done when** `day-tags.test.ts`
      covers them.

### Phase 3 · Service
- [ ] 3.1 `#lib/schemas/hourly-leave.schema.ts` (shift date, from, to as `HH:mm`, paid, reason) +
      Vitest; `services/hourly-leave/hourly-leave.{bl,crud}.ts`: add (time → instant inside the
      day's planned shift, overnight-safe; HL3 checks; overlap → `ConflictError` listing the
      clashing times), cancel, list for a person and date range; batch + audit (no reason in the
      audit row) + flag + recompute (HL11). **Done when** `pnpm check && pnpm test` pass.
- [ ] 3.2 Recompute loads active `hourly_leave` rows with the other inputs (one query per batch of
      people and dates). **Done when** a recompute of a seeded day in `attendance_app_e2e` stores
      the minutes (note: record IDs only).

### Phase 4 · UI
- [ ] 4.1 `HourlyLeaveSection.svelte` in `#lib/app/attendance/`, mounted in `DayStateSheet` /
      `DayPanel`: list (time in `<bdi>`, Paid/Unpaid badge, minutes, Cancel with a reason) and an
      Add form (`HourlyLeaveForm`, Superforms, two time inputs, paid `Switch`, reason; days left
      and the below-zero warning for paid, HL10). Day tags shown on `/attendance/days`. **Done
      when** `svelte-autofixer` is clean on every touched file.
- [ ] 4.2 Strings `hourly_leave_*` in `messages/en.json` and `messages/ar.json`. **Done when**
      `pnpm check` passes.
- [ ] 4.3 If pay plan Phase 7 (`/leave`, Leave card) is built by then: add "hours taken / booked"
      and the person's hourly rows of the year; otherwise add this to Phase 7's task 7.2 as a
      `> note:`. **Done when** one of the two is done.

### Phase 5 · Checks, docs, hand-off
- [ ] 5.1 `pnpm check && pnpm test`, eslint + prettier on touched code, `svelte-autofixer` clean.
- [ ] 5.2 `docs/decisions.html` statuses, `docs/architecture-guide.html` (day inputs list), the
      main plan's S4.1 task gets a `> note:` with the contract (HL7, HL8, H13).
- [ ] 5.3 **Manual check by the user** on `http://127.0.0.1:5174` (e2e DB):
  1. `/attendance/days` → a work day → Edit → **Hourly leave** → add paid 10:00–12:00 → the day
     shows the "Hourly leave (paid) 2 h" tag; lateness and status follow HL6.
  2. Add unpaid 18:00–20:00 on another day → tag "(unpaid)", the day is not short.
  3. Add an overlapping range → refused with the clashing time.
  4. Add a range on an off day or covering the whole shift → refused with the right message.
  5. Cancel a range → the tag disappears; the edit log (`/changes` or the day history) shows the
     change with source "day edit".
  6. Night shift: add 02:00–04:00 on a 20:00–08:00 day → stored on that shift date.
  7. Paid hourly leave beyond the balance → warning, saved.
  8. `/ar/attendance/days` → the same section right to left, times in `<bdi>`.
  9. Night shift ending on an off day (Mon 20:00 → Tue 08:00, Tue off): add 04:00–08:00 on Monday
     → saved on Monday, no early leave; Tuesday still shows an off day with nothing on it.

## 7. Questions for the user (defaults in **bold**)

| # | Question | Default |
|---|---|---|
| Q-HL1 | New table for hourly leave, or extra columns on the full-day `absence` table? | **New table** (HL1) |
| Q-HL2 | Does HR enter a time range (10:00–12:00) or only a number of minutes? | **Time range** (HL2) |
| Q-HL3 | Smallest hourly leave? Several per day? | **15 minutes; several, not overlapping** (HL4) |
| Q-HL4 | How does paid hourly leave come off the yearly balance: as a fraction of that day's shift (3 h of 12 h = 0.25 day), or by a fixed day length (e.g. every 8 h = 1 day)? | **Fraction of that day's required time** (HL9) |
| Q-HL5 | Paid leave on a day the person still worked the full shift: pay the credit anyway (old rule, golden G7) or count nothing? | **Old rule, plus a "worked during hourly leave" tag** (HL7) |
| Q-HL6 | Where does HR enter hourly leave: the day editor only, or also the entry sheet? | **Day editor only** (HL12) |
| Q-HL7 | Do employees request hourly leave in the app (approval flow), or does HR record approved leave? | **HR records it** (HL13) |
| Q-HL8 | Is there a limit (hours per month or per year)? | **No limit; monthly total shown** (HL14) |
| Q-HL9 | Do you also want **full-day unpaid leave** as a new day state? | **Not in this plan** (HL15) |

## 8. Out of scope

- Final, Deduction, tardiness brackets and period netting (S4.1): this plan only stores the
  minutes they need (HL7, HL8).
- Employee requests and approvals (needs login, S8).
- Importing old `leave_credit_minutes` from Odoo: real-data import stays with the production
  import plan; the 356 old days can be loaded as paid hourly leave later, but the old field has
  minutes only, no times (they would be placed at the shift start, a note per row).
- Sick, mission and training credit minutes: same mechanism, separate plan if HR asks.
