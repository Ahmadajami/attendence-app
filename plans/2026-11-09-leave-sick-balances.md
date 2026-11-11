# Leave and sick balances: opening balances from before the app, and the new-year choice (hold or reset)

**Status:** to do (proposed 2026-11-09; waiting for the user's approval of §1 and the defaults in §8)
> note: 2026-11-11 this plan is Phase 3 of `2026-11-11-engine-v2-hourly-leave-carry.md` (user: carry both leave days and the time balance, EN10). Proposed there: LB19's `/leave` page becomes the Annual / Sick tabs of one `/balances` page (EN13).
**Date:** 2026-11-09
**Goal:** Every person has two yearly balances, **annual leave** and **sick leave**. HR enters
each person's **opening balance** (what was already granted, carried and used **before the app
started**), so the app's "days left" match HR's records from the first day. When a **new year**
starts, HR opens it for a group of people and chooses, per balance: **Reset** (the new year
starts at the number HR types; last year's leftover is dropped) or **Hold** (last year's leftover
moves into the new year, on top of the number HR types).

**Lane:** one agent on `app/main` (or a branch `app/balances` cut from it). One commit per
phase, with the plan file. Start from the first unticked box. This plan **takes over Phase 7**
(7.1, 7.2) of `plans/2026-11-01-pattern-pay-holidays-missions.md` once approved; those two boxes
get a pointer note and are ticked here, not there (same as the swaps plan did with 6.1/6.2).

**Before you start, read:** `CLAUDE.md` in full (§1 personal data: **sick days are health
data**, §3 UI rules + Forms, §5 plans, §6 decisions log, §8 hand-off), then the pay plan §1
PR30–PR34 and PR40, and `src/lib/leave/balance.ts`.

---

## 0. Starting point (checked 2026-11-09)

- **Table:** `leave_entitlement` (`src/lib/server/db/schema/leave.ts`): `staff_id`, `year`,
  `days` (0–365), `carried_days` (−365–365), `reason`, `created_by`/`updated_by`, timestamps;
  unique (`staff_id`, `year`). Annual leave only; no sick balance; no "used before the app".
  Migrated in all three DBs (newest migration `0021_staff_legacy_badge_no`).
- **Pure logic:** `src/lib/leave/balance.ts`: `leaveDatesInYear()` (only `leave` absences),
  `leaveBalance()` → `{ yearly, carried, taken, booked, left }`, `suggestCarry()`; tests T23–T24
  in `balance.test.ts`.
- **Not built:** pay plan Phase 7: no `leave.schema.ts`, no `leave.bl/crud`, no `/leave`
  page, no employee Leave card, no below-zero warning.
- **Absences:** `absence` table, types `sick | leave | no_show | other | mission`
  (`#lib/schemas/enums.ts`); cancelled, never edited (PR40).
- **Settings:** `app_setting` exists with an **empty** key list
  (`src/lib/schemas/settings.schema.ts`); nothing reads a "start date" yet.
- **Data in the app:** rosters and memberships from **2026-10-01** (operations roster plan),
  so absences before that date are not (all) in the app; Odoo had no balances (PR30).
- **Permission:** `staff.write` for balance writes (PR34); `settings.manage` for the start date.
- **Parallel plan:** `plans/2026-11-09-hourly-leave.md` (proposed the same day) makes **paid
  hourly leave** come off the annual balance as a fraction of the day (HL9) and extends
  `balance.ts` (its task 2.2) and the future `/leave` page (its task 4.3). See LB23.

## 1. Decisions (proposed; stop and ask before departing from one once approved)

### What a balance is

| # | Decision | Why |
|---|---|---|
| LB1 | **Two kinds of balance per person and year: `annual` and `sick`.** `annual` counts `leave` absences, `sick` counts `sick` absences. Mission, no show and other never count (PR31). One table for both: `leave_entitlement` gets a `kind` column; unique becomes (`staff_id`, `year`, `kind`) | Same maths, same screens; a second table would copy every query |
| LB2 | **Both count only planned work days** (off days and holidays inside a leave or sick period don't count), as PR31 already does for annual leave (Q-LB5) | One rule HR can explain; the roster already knows the planned days |
| LB3 | **Days left = yearly + carried − used before the app − taken − booked.** Taken = counted days up to today; booked = counted days after today. Going below zero is a **warning, not a refusal**, for both kinds (PR33) | HR may approve exceptions; sick leave can't be refused anyway |
| LB4 | The year is the **calendar year** (PR31, Q-PR5) for both kinds | Already decided; one year boundary |

### Opening balances (before the app)

| # | Decision | Why |
|---|---|---|
| LB5 | **One app-wide "balances start date"** (`app_setting` key `balances_start_date`, set once by an admin with `settings.manage`; proposed **2026-10-01**, Q-LB1). From that date the app's absences count; **absences before it are ignored** for balances | The app's records start there; earlier leave lives in HR's files, so counting both would count it twice |
| LB6 | **Opening balance = three numbers per person and kind for the start year:** yearly days, carried from the year before, and **used before the start date** (new column `used_before_days`, 0–365). The screen shows the resulting "left on the start date" live as HR types (Q-LB2) | Matches how HR's paper record reads; "left" stays a result, so the sum can be checked |
| LB7 | **`used_before_days` is only allowed in the start year** (refused in later years by the BL, `ValidationError`) | After the start year every used day is an absence in the app |
| LB8 | **Entry screen: an "Opening balances" grid** on `/leave` (year = start year, a department or team filter, one row per active person, the three numbers per kind as inputs, "left" computed). **Save** writes only the changed rows in one batch, with one audit row per person (ids and numbers only) and a common reason. A file import from HR's sheet is **Phase 6, only if HR has such a file** (Q-LB3) | 310 people: typing per department is feasible; an import needs a file format nobody has shown yet |
| LB9 | **Changing the start date after opening balances exist** is allowed but the setting sheet warns with the count of rows it affects ("12 opening balances were entered for 2026-10-01") | Moving the date changes which absences count; HR must re-check the numbers |

### New year: hold or reset

| # | Decision | Why |
|---|---|---|
| LB10 | **No automatic roll-over.** A year is **opened** by HR with **Open year** on `/leave`: year, kind, the people (current filter's selection, or all active people of the filter), a **mode**, a **number of days**, a reason. One batch + one audit row per person | The app runs on one PC with no scheduler; HR decides; nothing changes behind HR's back |
| LB11 | **Mode Reset:** the new year's yearly days = the number HR types; carried = **0**. Last year's leftover is dropped, **positive or negative** | The user's first option: "reset to the number the user enters" |
| LB12 | **Mode Hold:** carried = **last year's days left** (at the moment of opening, booked days included), yearly days = the number HR types (may be 0). A **negative** leftover is carried too (a debt). An optional **"carry at most N days"** field caps a positive carry; empty = no cap (Q-PR6, Q-LB4) | The user's second option: "hold to the new year"; the cap is there for when HR gives a rule, without a code change |
| LB13 | **Defaults in the Open year sheet:** annual → **Hold**, sick → **Reset**; the number is prefilled per person with **last year's yearly days** ("same as last year"), editable for the whole selection. HR can switch the mode for any selection, so one group can hold and another reset (Q-LB6) | Annual leave usually carries, sick leave usually restarts; per-selection choice covers exceptions |
| LB14 | **The mode is stored on the row** (`opened_as`: `opening` = entered as opening balance, `reset`, `hold`, `set` = typed by hand) and shown as a badge on `/leave` and the employee Leave card | HR and auditors see how each number came to be |
| LB15 | **People who already have a row for that year and kind are skipped**, listed in the result toast/sheet; changing one person's numbers is **Edit** on that row (audited, reason required) | Opening twice must never silently overwrite a corrected row |
| LB16 | **A year can be opened from 1 December of the year before.** Until a year is opened, from 1 January `/leave` shows a banner "2027 not opened: annual N people, sick M people", and the day editor / entry sheet warning reads "year not opened" instead of a number | HR can prepare in December; a missing year is visible, never guessed |
| LB17 | **Late changes to the old year** (leave cancelled or added after a Hold): `/leave` marks rows whose stored carried ≠ last year's current days left, with **Carry again** (one person or the selection; audited). Nothing changes by itself | December corrections happen; the stored number stays what HR approved until HR re-carries |
| LB18 | A **person with no row for the previous year** gets carried 0 in Hold mode (new hire, or never entered) | Nothing to carry; HR can edit the row |

### Screens and data

| # | Decision | Why |
|---|---|---|
| LB19 | **`/leave` page** (sidebar "Leave", after Attendance; phosphor `CalendarCheckIcon`; `staff.write`). GET filters: year, department, team, **tab Annual / Sick**. Columns: yearly, carried, used before, taken, booked, left (below zero in `destructive`), opened as. Actions: Opening balances (start year only), Open year, Edit, Carry again | One place for every balance; pay plan PR34 extended to two kinds |
| LB20 | **Employee page: a Leave card** with both kinds for the chosen year and the list of counted periods (dates only; **sick reasons are never shown** here, PR40) | Looked up per person |
| LB21 | **Warnings:** when the day editor or the entry sheet sets leave or sick, it shows the days left after the change ("this leaves −2 sick days"); a warning, never a block (LB3) | HR sees the effect before saving |
| LB23 | **Hourly leave fits in, whichever plan lands first:** paid hourly leave (HL9) is part of **taken / booked** of the **annual** balance as day fractions; the start date rule (LB5) applies to it too; it never touches the sick balance. The second plan to be built merges into the first one's `balance()` signature instead of adding a second balance function | One balance function, one number on every screen |
| LB22 | **Sick balances are health data** (R18): numbers and counts only, never in logs, audit text, toasts or chat beyond ids and figures; Playwright and e2e use made-up people | CLAUDE.md §1 |

## 2. Data model (migration `0022_leave_balance_kinds`)

| Change | Detail |
|---|---|
| New enum `balance_kind` | `annual`, `sick` (`BALANCE_KINDS` in `#lib/schemas/enums.ts`, mapped to absence types `leave` / `sick`) |
| New enum `balance_opened_as` | `set`, `opening`, `reset`, `hold` |
| `leave_entitlement.kind` | `balance_kind not null default 'annual'` (existing rows become annual) |
| `leave_entitlement.used_before_days` | `numeric(5,2) not null default 0`, check 0–365 |
| `leave_entitlement.opened_as` | `balance_opened_as not null default 'set'` |
| `leave_entitlement.carry_cap` | `numeric(5,2) null` (the cap used in Hold, for the record) |
| Unique index | drop `leave_entitlement_staff_year_unique`; add (`staff_id`, `year`, `kind`) |
| `app_setting` key | `balances_start_date`: `z.iso.date()` in `appSettingSchemas` (no DB change) |

Table name stays `leave_entitlement` (renaming costs a migration on the real DB for no gain).
Before applying to `attendance_app`: row count of `leave_entitlement` (expected 0) and the
user's OK.

## 3. Pure logic (`src/lib/leave/balance.ts`, Node tests, no DB)

- `countedDatesInYear(absences, year, kind, startDate)`: replaces `leaveDatesInYear`; the
  absence type comes from the kind; dates clipped to `max(1 Jan, startDate)`–31 Dec.
- `balance(entitlement, days, today)` → `{ yearly, carried, usedBefore, taken, booked, left,
  openedAs }`; `entitlement = null` → `{ notOpened: true, … }`.
- `openYear({ mode, days, cap }, previous: Balance | null)` → `{ days, carriedDays, openedAs,
  carryCap }` (LB11, LB12, LB18).
- `carryDrift(stored, previous)` → the difference for LB17 (0 when none).
- `suggestCarry` removed (replaced by `openYear`).
- If the hourly-leave plan's task 2.2 is built first, `balance()` keeps its hourly input and
  adds the kind, start date and used-before (LB23); its tests H9/H10 keep passing.

## 4. Tests

| # | Case | Expected |
|---|---|---|
| T23 / T24 | Unchanged (annual) | still pass |
| T-LB1 | Start 2026-10-01; yearly 21, carried 3, used before 10; a leave day on 2026-09-20 and 2 leave work days in October | Sept day ignored; taken 2; left 12 |
| T-LB2 | Sick kind with 2 sick work days, 1 sick off day and 1 leave day | sick taken 2; the leave day not counted |
| T-LB3 | Open 2027 Reset 21, 2026 left 5 | days 21, carried 0, left 21, opened as reset |
| T-LB4 | Open Hold 21: from left 5 / from left −2 | carried 5 → left 26 / carried −2 → left 19 |
| T-LB5 | Hold with cap 10 from left 14; cap 10 from left −3 | carried 10; carried −3 (the cap limits positive carry only) |
| T-LB6 | Hold for a person with no 2026 row | carried 0 |
| T-LB7 | `used_before_days` > 0 for a year after the start year | zod/BL refusal |
| T-LB8 | 2026 leave cancelled after a Hold | `carryDrift` = +1 |
| T-LB9 | No row for the year | `notOpened` true; warning text "year not opened" |
| T-LB10 | Schema: opening grid with a negative or > 365 value; Open year with mode missing | field errors |

## 5. Tasks

### Phase 0 · Approval
- [ ] 0.1 The user approves §1 and answers or accepts §8. **Done when** the status line says
      approved and every LB row in `docs/decisions.html` is `approved` or `default`

### Phase 1 · Schema and migration
- [ ] 1.1 Enums, columns, unique index (§2); `balances_start_date` in `settings.schema.ts`;
      `pnpm db:generate`, read the SQL. **Done when** the SQL only adds the enums/columns and
      swaps the unique index, and `pnpm check` passes
- [ ] 1.2 Apply to `attendance_app_test` and `attendance_app_e2e`. **Done when** both list
      migration 0022
- [ ] 1.3 Apply to `attendance_app` after the row count and the user's OK. **Done when**
      migrated; note the row count before/after

### Phase 2 · Pure logic
- [ ] 2.1 `balance.ts` (§3) + T23–T24, T-LB1–T-LB9. **Done when** `pnpm test` passes

### Phase 3 · Service (replaces pay plan 7.1)
- [ ] 3.1 `#lib/schemas/leave.schema.ts` (opening grid, open year, edit row, carry again,
      start date) + T-LB10
- [ ] 3.2 `leave.crud.ts`: for a set of people + year + kind, one query each for entitlements,
      counted absences and planned work days; writes return unexecuted queries
- [ ] 3.3 `leave.bl.ts`: `listBalances`, `saveOpeningBalances` (start year only, LB7),
      `openYear` (skip existing, LB15; 1 December rule, LB16), `editBalance`, `carryAgain`,
      `setStartDate` (LB9 count); `staff.write` / `settings.manage`; `batch([...writes,
      auditInsert(...)])`, audit with ids and numbers only. **Done when** `pnpm check` passes

### Phase 4 · Screens (replaces pay plan 7.2)
- [ ] 4.1 `/leave` page: filters, Annual / Sick tabs, table, not-opened banner, drift marker
      (LB16, LB17, LB19); sidebar entry
- [ ] 4.2 `OpeningBalancesSheet` (grid, live "left", start date card for `settings.manage`)
- [ ] 4.3 `OpenYearSheet` (kind, mode Hold/Reset with LB13 defaults, days, optional cap,
      reason; result lists skipped people by count and opens their rows on request) and
      `BalanceEditSheet`
- [ ] 4.4 Employee **Leave** card (LB20); "days left after" warning in the day editor and the
      entry sheet (LB21)
- [ ] 4.5 Every string in `messages/en.json` + `messages/ar.json` (`leave_*`, `balance_*`);
      `svelte-autofixer` clean on every touched `.svelte`; `pnpm check && pnpm test`, eslint +
      prettier on touched files

### Phase 5 · Docs, tests, hand-off
- [ ] 5.1 `docs/decisions.html` LB rows updated to their final status; pay plan Phase 7 pointer
      notes; architecture guide mentions the two balances
- [ ] 5.2 Playwright spec on `attendance_app_test` (made-up people: opening grid, Open year
      Hold and Reset, warning below zero); the user runs it
- [ ] 5.3 Manual check by the user on `http://127.0.0.1:5174` (`_e2e`):
  1. As admin, set the balances start date to 2026-10-01 → the date shows on `/leave`
  2. `/leave` → Opening balances, one team: type yearly 21, carried 2, used 5 for a made-up
     person → "left" shows 18 before saving; after Save the row shows opened as "Opening"
  3. Add a leave day on a planned work day in November → taken +1, left 17; add one on an off
     day → nothing changes
  4. Sick tab: same steps with a sick day → only the sick balance moves
  5. Set leave beyond the balance → warning "this leaves −1 days", the save still works
  6. Open year 2027, Annual, mode Hold, 21 days, for the team → carried = each person's 2026
     left, badge "Hold"; run it again → everyone listed as skipped
  7. Open year 2027, Sick, mode Reset, 14 days → carried 0, left 14, badge "Reset"
  8. Cancel a 2026 leave day after step 6 → the row shows the drift marker; **Carry again**
     fixes it and History/audit shows it
  9. Employee page → Leave card shows both kinds for 2026 and 2027; no sick reason visible
  10. `/ar/leave`: right to left, numbers and dates in `<bdi>`, no English left
  11. Still fine: day editor and entry sheet save leave and sick as before

### Phase 6 · Import opening balances from HR's file (only if Q-LB3 = yes)
- [ ] 6.1 `scripts/import-opening-balances.ts` on the pattern of `import-employees.ts`: reads
      the file from `~/secure/syravia/imports/`, key `employee_no`, dry run first (counts only:
      matched, unknown numbers, invalid values), then writes through `saveOpeningBalances`.
      **Done when** a second dry run reports 0 changes

## 6. Not in this plan

- Half days, hourly leave, accrual per month, leave by seniority or job (Q-PR7).
- Other balances (unpaid, exam, maternity) and leave requests/approvals by employees (after
  login, S8).
- Pay effects of a negative sick balance (unpaid sick): payroll S4.
- A company settings screen (S2.3); only the start date gets a small card on `/leave`.

## 7. Risks

- **Double counting** if the start date is earlier than the first leave typed in HR's file:
  LB5/LB9 and the step 1 check guard it; HR confirms the date (Q-LB1).
- **Wrong carry** if December leave is corrected after opening: LB17 makes it visible.
- **Health data** on screen: sick tab, card and audit carry numbers only (LB22).

## 8. Open questions (defaults used until answered)

| # | Question | Default |
|---|---|---|
| Q-LB1 | From which date do the app's leave and sick records count (balances start date)? | 2026-10-01 (LB5) |
| Q-LB2 | What does HR have for each person before the start: used days, or only days left? | yearly + carried + used; "left" computed (LB6). If only "left" is known, HR types it as yearly with carried and used 0 |
| Q-LB3 | Does HR have the opening numbers in a file (Excel) we can import once? | no: typed in the grid (LB8); Phase 6 only if yes |
| Q-LB4 | In **Hold**, is there a maximum number of days that may move to the new year? Is a negative balance carried? | no cap (field optional); negative carried (LB12) |
| Q-LB5 | Do sick days count on planned work days only, or on every calendar day of the sickness? | planned work days only, like annual leave (LB2) |
| Q-LB6 | Default mode at the new year: annual Hold, sick Reset? Does Hold also add the new year's days? | annual Hold, sick Reset; Hold = leftover + the number HR types (LB12, LB13) |
| Q-LB7 | How many sick days per year does a person get (one number for everyone, or per person)? | per person, typed by HR, prefilled "same as last year" (LB13) |
