# Daily attendance: pattern pay rules, holidays, missions, swaps, leave balance and edit log

**Status:** in progress (approved 2026-11-02; extended the same day with swaps, leave balance and the edit log; Phases 1–2 built, Phase 3 built except the backfill button (5.2); `attendance_app` migrations 0015–0018 waiting for the user's OK)
**Date:** 2026-11-01 (rewritten and extended 2026-11-02)
**Goal:** Once punches are in, the app keeps one **daily attendance record per
person per day**. It works the record out from the person's pattern (shift,
overtime on/off, rates, holidays), their absences, missions and **swaps**, and
their punches. HR reviews the days, changes a day when needed (for example
"this day is leave"), and every affected record is updated straight away.
Every change to a value is written to an **edit log** that says where it came
from (typed, punch reading, Odoo seed, correction, day edit, swap…), and each
person has a **yearly leave balance**.

Plain-language guide (EN/AR, every step with examples): `docs/daily-attendance-guide.html`.

Related: main plan S1.3/S1.4/S1.6 (punches), S2.3 (department rules), S3.5
(`/changes`: this plan builds its swap part), S3.6 (day popup), S4.1/S4.2
(engine, stored results); builder plan B1–B7; two-level management plan
(approver chain, later).
Rules: BRIEF R7–R9, R12, R13, §9.6, §9.7, §9.9; open questions Q1, Q3, Q6, Q8, Q9.

## 0. The flow in one picture

```
 punches arrive ──────────┐   (entry sheet, day panel, corrections;
                          │    seed S1.3 and file import S1.6 later)
 pattern settings ────────┤   (overtime on/off, rates, holidays)
 absences and missions ───┤   (entry sheet, day editor, mission sheet)
 approved swaps ──────────┤   (self swap, employee swap)
 roster changes ──────────┘   (assignments, own days, one-off shifts)
                          │
                          ▼
        recompute the affected person-days (pure engine)
                          │                     │
                          ▼                     ▼
     day_result: one row per person      attendance_log: one line per
     and date (≤ today)                  changed value: old → new,
        status · worked · late ·         when, who, source, cause
        overtime · rate · paid / unpaid
                          │
                          ▼
  /attendance/days ── HR reviews ── edits a day (leave, sick, mission…)
        │  History drawer per day           │
        └──────────── recompute ◀───────────┘

  leave balance (per person, per year) = yearly days + carried − leave days taken
```

## 1. Decisions

The user answered PR1–PR3 and approved the plan (PR1–PR15) on 2026-11-02, then
answered PR22, PR25, PR26 and PR30 the same day. PR16–PR21, PR23, PR24,
PR27–PR29 and PR31–PR34 are defaults until the user says otherwise. All are in
`docs/decisions.html` (group "Pay rules").

### Pay rules, holidays, missions (PR1–PR15)

| # | Decision | Why |
|---|---|---|
| PR1 | Overtime "price" is a **rate multiplier** on the person's own hourly pay (×1.25, ×1.5…), not money per hour | The app holds no salaries; the old rules and the golden numbers use multipliers |
| PR2 | A **holiday** applies to **everyone who follows the pattern** on that date; a **mission** applies to the **members HR picks** | Holidays are for the whole rhythm; missions are for one person or a few |
| PR3 | Each holiday has an **"overtime-eligible"** switch. On: every minute worked that day is paid at the holiday rate. Off: the day is a paid day off and minutes worked show as **unpaid extra** | Same switch as the old holiday assignment (R13) |
| PR4 | The pay rule is an **optional layer on the pattern**: pattern → department rule (S2.3, later) → company default. A person marked "no overtime" (S3.6, later) always wins | Different rhythms need different rules; the department layer still fits in between |
| PR5 | Pay rules are **versioned by date**, never edited in place; from **today or later** until periods exist | Changing a rate must not rewrite past pay |
| PR6 | Three rates: **work day**, **off day**, **holiday**; 1.00–5.00, two decimals; empty = inherit. No night rate here (Q3) | Matches R8/R9 and the old configuration |
| PR7 | The **company default is a code constant** (overtime on, 1.25 / 1.50 / 1.50) until S2.3 adds the settings screen | No settings screen yet; old values keep the golden numbers |
| PR8 | A holiday makes the day **off** for every follower (required 0). Whoever still works it gets a one-off shift; holidays apply to **shift dates** | The airport staffs holidays; who works is chosen per person |
| PR9 | A mission is a **full-day `absence` of type `mission`**, one row per member, sharing `group_id`, with `pattern_id`. Partial missions come later | Reuses the absence overlap rule, precedence, cancelling and the employee page |
| PR10 | Mission members must **follow the pattern on every date**; existing absences on those dates are **refused and listed** | No silent double states |
| PR11 | Holidays, missions, day edits and swaps may be on **past dates** with a reason; pay rules start today or later. Once periods exist, closed or locked periods are refused | HR records these after the fact; the lock protects paid months |
| PR12 | `/patterns/[id]` gets tabs **Days / Overtime & pay / Holidays & missions** (`?tab=days\|pay\|dates`) | Keeps the builder as it is; one place per pattern |
| PR13 | Pattern writes need `roster.manage`; day edits and recompute need `attendance.record` (as the entry sheet); viewing `staff.write` | Existing keys; single local user today |
| PR14 | **Change from a date** and **Copy** carry the pay rule in force and the upcoming holidays | The copy must behave like the original |
| PR15 | With overtime **off**, extra minutes show as **unpaid extra**; off-day work is not paid (Q8 default) | Same default as the brief |

### Daily record and recompute (PR16–PR21)

| # | Decision | Why |
|---|---|---|
| PR16 | **Daily attendance is stored**: table `day_result` (main plan §7), unique (person, shift date), with what the app computes today plus `inputs_hash`, `needs_recompute`, `explanation`. S4.1/S4.2 add the payroll columns to the same table | One place for HR to review, filter and export |
| PR17 | **Every write that changes an input recomputes the affected person-days in the same request**, after it commits. The write also flags those days `needs_recompute` in its own transaction; flagged rows are caught up on the next read or with a **Recompute** button | Records are never stale, and a crash cannot leave them wrong |
| PR18 | Only days **up to today** are stored; future days are computed on the fly | Future days have no punches |
| PR19 | **HR edits a day by setting its state** (leave, sick, mission, no show, other) for one day or a range, with a reason, or clears it. Punches stay but count for nothing while the day has a full-day state | R7; keeps the punch history |
| PR20 | A **Daily attendance** page `/attendance/days` (GET filters: date, department / team, status, source); **Edit day** and **History** per row; the employee day panel gets the same editor and history | One list after punches arrive |
| PR21 | Recompute is **per person and date range**, one query per table for the set, writes in batches of 500, skips unchanged rows | Fast enough in one request |

### Edit log (PR22–PR24)

| # | Decision | Why |
|---|---|---|
| PR22 | An **attendance edit log** records **every value change** of a person-day: field, old → new, when, who (or "system"), the **source** and the **cause** (the punch, absence, swap, holiday or rule that caused it) | The user is the only operator and needs to remember whether a value was typed or came from a punch reading (user, 2026-11-02) |
| PR23 | The log is written **by the recompute**: it compares the stored row with the new one and writes one line per changed field, tagged with the cause the writer passed. Sources: `typed` (entry sheet / day panel), `punch_reading` (file or device import), `odoo_seed`, `correction`, `day_edit`, `mission`, `swap`, `holiday`, `pay_rule`, `roster_change`, `system` (backfill, catch-up). A day's first computation writes one "created" line; the backfill writes only those. Append-only, never edited; absence **reasons are never copied** into it (health data), only ids | One writer means nothing is missed; ids keep health details out |
| PR24 | Each **in / out time shows its source** as a small badge (Typed, Punch reading, Odoo seed, Corrected) on the daily page, the entry sheet and the employee page; **History** opens the day's log, newest first, with a filter by field | Answers "typed or read?" at a glance; the full story one click away |

### Swaps (PR25–PR29)

| # | Decision | Why |
|---|---|---|
| PR25 | Swaps are **requests that change the roster only when approved**: `pending → approved / rejected`, an approved one can be **cancelled** (with a reason), even while the user is the only operator | Ready for supervisors and employees after login, same data and screens (user, 2026-11-02) |
| PR26 | Two kinds. **Self swap**: a person moves their own off day: work day W becomes off, off day O becomes work (with W's shift). **Employee swap**: on date D, A works and B is off → A is off and B works A's shift; an optional **return date** D2 does the reverse. Both days of a swap lie in the **same week (Sun–Sat) or the same calendar month**, chosen per swap | BRIEF §9.6 and R12; the scope the user chose (user, 2026-11-02); the return date covers "you work for me Monday, I work for you Thursday" |
| PR27 | Approving **re-checks** everything (the roster may have changed since the request) and creates `roster_override` rows sharing `swap_group_id` = the request id, in one `batch` with its audit row, then recomputes. Cancelling an approved swap cancels those overrides together. Refused: days not as described (A not working, B not off, O not an off day), an absence or another active one-off shift on a date, dates outside the scope, inactive people, closed periods (later) | Reuses the existing override machinery; a stale request cannot apply |
| PR28 | **Pay** (R12): a swap moves the off day, it does not change how days are paid. The new work day has normal required time; working a swapped-off day pays like an off day. **"Pay as overtime"** (per swap) pays the moved work day at the off-day rate. Working one's own off day **without** an approved swap sets an **"unauthorised swap"** flag on the day (shown, not penalised) | Same rules as the old module; HR keeps the choice per swap |
| PR29 | Creating a request needs `attendance.record`, approving / rejecting / cancelling needs `roster.manage`. After login (S8) the approver comes from the management chain (team supervisor → department manager → HR, D22) and nobody approves their own request | Existing keys now; the approver chain exists already (two-level plan) |

### Leave balance (PR30–PR34)

| # | Decision | Why |
|---|---|---|
| PR30 | A **yearly leave balance** per person: **yearly days** (set by HR per person and year) + **carried** from last year − **days taken** = **days left**; future booked leave shown separately | What HR asked for (user, 2026-11-02); the old module had no balance |
| PR31 | The leave year is the **calendar year** (Jan–Dec). Only `leave` absences count, and only on days the person was **planned to work** (not off days, not holidays); sick, mission, no show and other never count | Leave is taken from working days |
| PR32 | **Carry-over**: when HR opens a new year, the app suggests last year's days left as "carried"; HR can change it. No cap until HR gives one (Q-PR6) | No rule known yet; HR stays in control |
| PR33 | Going over the balance is a **warning, not a refusal** (day editor, entry sheet): "this leaves −2 days" | HR may approve exceptions |
| PR34 | A `/leave` page (per department or team, one row per person: yearly, carried, taken, booked, left; **Set yearly days** for a selection, with a reason) and a **Leave** card on the employee page (the year's numbers and the list of leave periods). Writes need `staff.write`; every change is audited | Balances are set in bulk once a year and looked up per person |

## 2. What exists today (facts from the code)

- `pattern`, `pattern_assignment`, `staff_schedule`, `roster_override`
  (with `swap_group_id`, cancelled together), `absence` (overlap `EXCLUDE`),
  `attendance_event` (append-only punches with corrections; `source` =
  `manual | seed | import`).
- `rosterDay()` returns the planned `patternId` and flags `extra` and
  `swapGroupId`; `shiftSummary()` computes status, worked, late and
  overtime **on every page load**; nothing is stored.
- `audit_log` records each mutation (ids and counts), but not "this value
  changed from X to Y on this day".
- No swap request, leave entitlement or day log tables.
- Phase 1.1–1.2 of this plan added `pattern_pay_rule`, `pattern_holiday`,
  `mission`, `absence.group_id` / `pattern_id` and `day_result` (`0015`,
  `0016`).

## 3. Data model

| Table / change | Columns and rules |
|---|---|
| `pattern_pay_rule` ✅ | `pattern_id`, `ot_enabled` (NULL = inherit), `work_day_rate`, `off_day_rate`, `holiday_rate` `numeric(4,2)` (1.00–5.00), `effective_from`, `effective_to` (exclusive), `reason`; at least one value; no overlap |
| `pattern_holiday` ✅ | `pattern_id`, `starts_on`, `ends_on` (≤ 14 days), names en/ar, `ot_eligible`, `reason`, cancelled by/at; active ones never overlap |
| `absence` ✅ | type `mission` added; `group_id`, `pattern_id` |
| `day_result` ✅ | person, shift date (unique), kind, status, source, pattern, shift, team, holiday, absence type, in / out, required, worked, late, overtime, rate, paid, unpaid, reason, explanation, `inputs_hash`, `needs_recompute`, `computed_at` |
| `day_result` (add) | `check_in_source`, `check_out_source` (`typed \| punch_reading \| odoo_seed`), `corrected boolean`, `swap_request_id` (FK), `swap_role` (`swap_on \| swap_off`), `unauth_swap boolean` |
| `attendance_log` (new) | `id`, `staff_id`, `shift_date`, `field` (enum: `created`, `kind`, `status`, `state`, `shift`, `check_in`, `check_out`, `required`, `worked`, `late`, `overtime`, `ot_rate`, `paid_ot`, `unpaid_extra`, `swap`), `old_value jsonb`, `new_value jsonb`, `source` (enum, PR23), `cause_type` (`event \| absence \| swap \| holiday \| pay_rule \| assignment \| schedule \| override \| none`), `cause_id uuid`, `actor_id` (NULL = system), `at`. Index (`staff_id`, `shift_date`, `at`). **Append-only** (a trigger refuses UPDATE and DELETE) |
| `swap_request` (new) | `id`, `kind` (`self_swap \| emp_swap`), `staff_id` (A), `other_staff_id` (B, emp only), `first_date` (self: the work day W; emp: D), `second_date` (self: the off day O, required; emp: the return date D2, optional), `scope` (`week \| month`), `pay_as_ot`, `reason`, `state` (`pending \| approved \| rejected \| cancelled`), `requested_by`, `decided_by`, `decided_at`, `decision_note`, `cancelled_by`, `cancelled_at`, timestamps. Checks: other staff iff emp, ≠ A; second date iff self (or optional for emp); dates differ; decision fields match the state |
| `leave_entitlement` (new) | `staff_id`, `year smallint`, `days numeric(5,2)` (0–365), `carried_days numeric(5,2)` (−365–365, default 0), `reason`, `created_by`, timestamps; unique (`staff_id`, `year`). Changes audited |

Migrations: `0015`, `0016` ✅; `0017_swaps_leave_log` (generated) and
`0018_swaps_leave_log_constraints` (custom: append-only trigger on
`attendance_log`, swap checks that drizzle cannot express).

## 4. Rules in pure code (Vitest, no DB)

- `src/lib/payroll/pay-rule.ts`: `OVERTIME_DEFAULTS`, `resolvePayRule()`,
  `overtimePay()`.
- `src/lib/roster/roster.ts`: `RosterInput.holidays`, `RosterDay.holiday`,
  `swapRole`; `payDayKind()` (a `swap_on` day with "pay as overtime" is
  `off_work`; working a planned off day with no swap sets `unauthSwap`).
- `src/lib/roster/attendance.ts`: holiday required 0; all-overtime kinds;
  a full-day absence ignores punches; in / out sources and `corrected`.
- `src/lib/attendance/day-result.ts`: `dayResultOf()`, `inputsHash()`,
  `diffDayResult(old, new)` → the log lines.
- `src/lib/roster/swaps.ts`: `sameScope(a, b, scope)` (Sun–Sat week, Q-A8),
  `checkSwap(request, rosterDays)` → issues (`a_not_working`,
  `b_not_off`, `o_not_off`, `absence`, `override`, `scope`, `same_date`,
  `inactive`), `swapOverrides(request, rosterDays)` → the override rows.
- `src/lib/leave/balance.ts`: `leaveBalance(entitlement, leaveDays,
  plannedWork, today)` → `{ yearly, carried, taken, booked, left }`;
  `suggestCarry(previous)`.

| # | Case (made-up people) | Expected |
|---|---|---|
| T1 | No pay rule on the pattern | 1.25 / 1.5 / 1.5, OT on, source `company` |
| T2 | Pattern sets only the off-day rate 2.0 | only that field says `pattern` |
| T3 | Version from the 10th: rate 1.5 | 9th → 1.25, 10th → 1.5 |
| T4 | OT off, 60 min past required | paid 0, unpaid 60, `ot_off` |
| T5 | Eligible holiday, one-off shift, worked 600 | `holiday_work`, 600 at the holiday rate |
| T6 | Holiday not eligible, worked 600 | paid 0, unpaid 600, `holiday_not_eligible` |
| T7 | Holiday, not worked | `holiday_off`, required 0, not absent |
| T8 | Holiday on a pattern off day | stays off, `holiday` set |
| T9 | Mission and holiday on the same date | absence (mission) wins |
| T10 | Night shift on the eve of a holiday | belongs to the eve: no holiday |
| T11 | Personal pattern, team pattern has a holiday | no holiday |
| T12 | Cancelled holiday | ignored |
| T13 | Punches on a day HR set to leave | kind `absence`, paid 0, `unpaid_reason: 'absence'` |
| T14 | Same inputs twice | same `inputs_hash`; no log lines |
| T15 | Check-out corrected 18:00 → 19:15 | log lines `check_out`, `worked`, `overtime` with source `correction` and the event id |
| T16 | Punch from a file, then typed correction | `check_in_source` `punch_reading`, then `corrected` true |
| T17 | Self swap Tue (work) ↔ Sat (off), same week | Tue off (`swap_off`), Sat works Tue's shift (`swap_on`), required normal |
| T18 | Self swap across two weeks, scope week | refused `scope`; same with scope month and same month → accepted |
| T19 | Employee swap on D, A works, B off | A `swap_off`, B `swap_on` with A's shift; with return date D2 the reverse on D2 |
| T20 | Employee swap where B also works on D | refused `b_not_off` |
| T21 | Swap with "pay as overtime", B works 600 on the moved day | `off_work`, 600 at the off-day rate |
| T22 | Works own off day, no swap | `unauth_swap` true, paid as off-day work |
| T23 | 21 yearly + 3 carried, 5 leave days on work days + 1 on an off day | taken 5, left 19 |
| T24 | Leave booked next month | booked counted apart from taken; left = yearly + carried − taken − booked |

## 5. Screens

- **`/attendance/days` (PR20):** GET form (date, department / team,
  status, source). Table: person, planned shift, in and out **with source
  badges**, worked, late, overtime ×rate or "not paid" (reason in a
  tooltip), badges (Holiday, Leave, Mission, Swap on/off, Unauthorised swap).
  Row actions **Edit day** and **History**. **Recompute** for the shown date
  and scope reports a count.
- **Day editor (`DayStateSheet`, PR19):** state from / to, reason, or
  **Clear state**; when the state is leave it shows the person's days left
  and warns below zero (PR33). Same sheet on the employee page day panel.
- **History (`DayHistorySheet`, PR24):** the day's log, newest first: time
  (`<bdi>`), field, old → new, source badge, who, a link to the cause (the
  punch, swap, holiday…). Filter by field.
- **`/changes` (swaps, PR25–PR29):** tabs Pending / Approved / Rejected &
  cancelled. **New swap** sheet: kind (self / employee), person (and the
  other person), dates (with what each person has planned on them), scope,
  pay as overtime, reason; the issues are shown before saving. Row actions
  **Approve**, **Reject** (note), **Cancel** (reason). The roster preview and
  the daily page show swap markers.
- **`/leave` (PR34):** GET filters (year, department / team); table yearly,
  carried, taken, booked, left; select people → **Set yearly days** sheet
  (days, carried with the suggestion pre-filled, reason). Employee page
  **Leave** card with the same numbers and the leave periods of the year.
- **`/patterns/[id]` tabs (PR12):** Days · Overtime & pay · Holidays &
  missions (as before).
- **Sidebar:** Daily attendance, Swaps, Leave.

## 6. Tasks

### Phase 1 · Schema and migrations
- [x] 1.1 Drizzle schema: `pattern_pay_rule`, `pattern_holiday`, `mission`
      in `ABSENCE_TYPES`, `absence.group_id` + `pattern_id`, `day_result`;
      enums in `#lib/schemas/enums.ts`; relations and types.
      `pnpm db:generate` → `0015`; read the SQL.
      **Done when** `pnpm check` passes and the SQL adds only these objects
      > note: 2026-11-02. Tables in `schema/roster.ts` (pay rule, holiday) and the new
      > `schema/day-results.ts`; enums `ROSTER_SOURCES`, `DAY_STATUSES`, `DAY_KINDS`,
      > `UNPAID_REASONS` in `enums.ts` (`RosterSource` and `ShiftStatus` now point at them).
      > `0015_daily_attendance.sql` read: 4 new enums, `mission` value, 3 tables, 2 absence
      > columns, FKs and indexes only. `pnpm check`: 0 new errors; the 2 errors left are in
      > `ReportTree.svelte` (`node.team`), already in commit 34213ba. `pnpm test` 262/262.
- [x] 1.2 Custom migration `0016`: both `EXCLUDE`s, rate / length / reason
      checks. **Done when** a rolled-back probe on `_test` refuses an
      overlapping version, an overlapping active holiday, a rate 0.5 and a
      15-day holiday
      > note: the range, length and reason checks are in `0015` (drizzle `check()`); `0016`
      > holds the two `EXCLUDE`s. A CHECK tying `absence.pattern_id` to `type = 'mission'` was
      > dropped: PostgreSQL refuses a new enum value in the transaction that adds it; the
      > service enforces it (Phase 4). Probe on `_test` (one rolled-back transaction): all four
      > refused, plus "no value set"; a cancelled holiday frees its dates; 14 days accepted;
      > 0 rows left behind.
- [ ] 1.3 Apply to `attendance_app_test` and `attendance_app_e2e`;
      `attendance_app` only after the row count and the user's OK
      > note: 2026-11-02 applied on `_test` (it also took the pending 0011–0014; now 17) and
      > `_e2e` (17); `drizzle-kit generate` says "No schema changes". `attendance_app`: 15
      > applied (up to 0014), counts before 0015–0016: absence 0, pattern 2,
      > department_manager 1. **Waiting for the user's OK.**
- [x] 1.4 Schema for the extension: `attendance_log`, `swap_request`,
      `leave_entitlement`, the new `day_result` columns, their enums.
      `pnpm db:generate` → `0017`; read the SQL.
      **Done when** `pnpm check` shows no new error and the SQL adds only
      these objects
      > note: 2026-11-02. `swap_request` in `schema/roster.ts`, `attendance_log` and the new
      > `day_result` columns in `schema/day-results.ts`, `leave_entitlement` in the new
      > `schema/leave.ts`; enums `LOG_FIELDS`, `LOG_SOURCES`, `LOG_CAUSES`, `SWAP_KINDS`,
      > `SWAP_SCOPES`, `SWAP_STATES`, `SWAP_ROLES`. Deviation: the in/out source columns reuse
      > the existing `punch_source` enum (`manual` = Typed, `import` = Punch reading, `seed` =
      > Odoo seed) instead of a second enum with the same meaning. All checks drizzle can
      > express went into `0017` (swap kind/other person/dates/state fields, cancel reason,
      > entitlement ranges and unique person + year, log cause, day swap fields). SQL read: 7
      > enums, 3 tables, 6 `day_result` columns, FKs, indexes, 1 check. `pnpm check`: only the 2
      > old `ReportTree.svelte` errors. `pnpm test` 262/262.
- [x] 1.5 Custom migration `0018`: append-only trigger on `attendance_log`,
      swap checks. **Done when** a rolled-back probe on `_test` refuses an
      UPDATE and a DELETE on the log, an employee swap without B, a self swap
      without O, and a second entitlement for the same person and year
      > note: `0018` holds the append-only triggers (UPDATE, DELETE and TRUNCATE refused); the
      > swap checks were all expressible in `0017`. Probe on `_test` with 2 made-up staff in one
      > rolled-back transaction: the 4 required refusals plus TRUNCATE, cause `none` with an id,
      > a swap with oneself, approved without a decision time, cancelled without a reason,
      > 400 yearly days; a valid self swap went pending → approved → cancelled; −2 carried
      > accepted; 0 rows left behind.
- [ ] 1.6 Apply `0017`–`0018` to `_test` and `_e2e`; `attendance_app` with
      `0015`–`0018` after the row count and the user's OK
      > note: 2026-11-02 applied on `_test` and `_e2e` (19 each); `drizzle-kit generate` says
      > "No schema changes". `attendance_app`: 15 applied (up to 0014); counts before
      > 0015–0018: absence 0, attendance_event 0, pattern 2, staff 8. **Waiting for the user's
      > OK.**

### Phase 2 · Pure logic (Vitest)
- [x] 2.1 `pay-rule.ts`. **Done when** T1–T4 pass
      > note: 2026-11-02 `src/lib/payroll/pay-rule.ts` (`OVERTIME_DEFAULTS`, `resolvePayRule`
      > with a source per field, `overtimePay` with the reasons in a fixed order: absence →
      > person without OT → holiday not eligible → OT off) + 9 tests.
- [x] 2.2 `roster.ts` holidays, swap roles, `payDayKind`. **Done when**
      T5–T12, T21, T22 pass and the existing roster tests still pass
      > note: `RosterInput.holidays` (optional until the loaders pass it, Phase 3),
      > `RosterDay.holiday` and `swapRole` (from the override's `swap_group_id`), `payDayKind`.
      > A holiday keeps `plannedShiftId` and sets `shiftId` to null unless an override works it.
      > T12 is tested as "only the planning pattern's holidays, on their dates"; cancelled
      > holidays are left out by the loader (Phase 3). Old roster tests unchanged and passing.
- [x] 2.3 `attendance.ts` + `day-result.ts` (`dayResultOf`, `inputsHash`,
      `diffDayResult`). **Done when** T13–T16 pass
      > note: `shiftSummary` now gives required 0 and all-overtime on a holiday, status
      > `absent` for any full-day state even with punches (before: `unscheduled`), the in/out
      > sources and `corrected`. `src/lib/attendance/day-result.ts`: `dayResultOf`,
      > `diffDayResult`, and `dayResultHash` instead of `inputsHash`: it hashes the computed
      > values plus `DAY_RESULT_ENGINE`, so time-dependent figures (expected → missing) and
      > engine changes are caught too (stored in `inputs_hash`). T15 also lists `ot_rate` and
      > `paid_ot` (15 min past 720); the source and cause of each line are added by the
      > recompute (Phase 3). 16 tests, including guide example A.
- [x] 2.4 `swaps.ts`. **Done when** T17–T20 pass
      > note: `src/lib/roster/swaps.ts` (`weekStart`, `sameScope`, `swapDates`, `checkSwap`
      > with 12 issue codes, `swapOverrides`) + 10 tests. The tests caught a plain one-off
      > shift not counted as a conflict when no swap id is given; fixed.
- [x] 2.5 `leave/balance.ts`. **Done when** T23–T24 pass and `pnpm test`
      is green
      > note: `src/lib/leave/balance.ts` (`leaveDatesInYear`, `leaveBalance`, `suggestCarry`)
      > + 5 tests. `pnpm test` 304/304 (262 before + 42); `pnpm check` only the 2 old
      > `ReportTree.svelte` errors; eslint and prettier clean; no server or SvelteKit import
      > in the new pure files.

### Phase 3 · Recompute and edit log (the heart of the flow)
- [x] 3.1 `day-results.crud.ts` + `day-results.bl.ts`:
      `recomputeDays(staffIds, from, to, cause)` (capped at today; loaders
      shared with the entry sheet; upsert in batches of 500; unchanged rows
      skipped; **log lines from `diffDayResult` written in the same batch**),
      `markNeedsRecompute()`, `catchUpDays()`.
      **Done when** a Vitest on the planning step shows which rows and log
      lines are written, kept and skipped
      > note: 2026-11-02. Pure planner `src/lib/attendance/recompute.ts` (`planRecompute`:
      > same hash → kept; same hash but flagged → rewritten without log lines; changed → one
      > line per changed value with the cause; new → `created`) + 3 tests. Service
      > `services/day-results/`: `recomputeDays` (capped at today, 100 people per load, 500
      > rows per statement, each chunk's rows and log lines in one transaction), `recomputeAfter`
      > (a failure after a committed write is reported with counts only and left flagged),
      > `catchUpFlagged`, `recomputeFrom` (the backfill, 3.3), `markNeedsRecompute`. Reads added:
      > `pattern-pay.crud` (pay-rule versions, active holidays) and `swaps.crud` (approved swaps).
      > `loadRosterData` now loads the assigned patterns' active holidays, so the entry sheet and
      > previews treat a holiday as off too. Not run against a database (agents don't start the
      > app): the user's check in the hand-off.
- [x] 3.2 Hook every writer (PR17) with its cause and source:
      `saveEntrySheet` (`typed`), `addPair` (`typed`), `correctEvent`
      (`correction`), the day editor (`day_edit`), missions (`mission`),
      swaps (`swap`), holidays (`holiday`), pay rules (`pay_rule`),
      assignments / own schedules / one-off shifts (`roster_change`).
      **Done when** every writer has the two calls (grep) and `pnpm check`
      passes
      > note: hooked now (flag in the writer's batch + `recomputeAfter` after it): entry sheet
      > and add pair (`recordRows`: `typed`, cause = the person's absence or first punch),
      > `correctEvent` (`correction`, the new event), `assign`, `endAssignment`, `editFromDate`,
      > `buildPattern` (`roster_change`), `setSchedule` (`roster_change`, the schedule version)
      > and `resetSchedule`. Assignment and schedule changes start today or later, so they reach
      > at most today's rows. The writers that don't exist yet are hooked when built: day editor
      > 5.1, missions / holidays / pay rules 4.2, swaps 6.1. Team moves and department changes are
      > not hooked: a move takes effect from the moment it is saved (today's team is read at
      > 00:00), and stored past days keep their figures until something recomputes them. grep:
      > 14 calls in 3 services; `pnpm check` 0 errors.
- [ ] 3.3 Backfill: `pnpm attendance:recompute --from <date>` (source
      `system`, one "created" line per day). **Done when** it runs on
      `_e2e` and prints counts only
      > note: deviation: a service function `recomputeFrom(actor, from)` (`roster.manage`, at
      > most 400 days, every active person plus anyone with punches, one audit row with the
      > counts) instead of a CLI script: the CLI scripts open their own DB client (tsx, no
      > `$app/env/private`), while the recompute reuses the app's loaders on the app's client.
      > The daily page gets a "Recompute from a date" button for it in 5.2; ticked when the user
      > has run it on `_e2e` and seen the counts.

### Phase 4 · Pattern pay, holidays, missions (services and sheets)
- [x] 4.0 Fix from testing (do first): on the employee page day panel, **Add punches** opens
      `AddPairForm` with no way to close it short of a reload. Add a **Cancel** button (ghost,
      phosphor `XIcon`, `m.attendance_cancel()` in en + ar) beside Save in `AddPairForm` and
      `CorrectionForm`, through an `onCancel` prop that `DayPanel` uses to set `adding = false` /
      `correcting = null`. Typed values are dropped on cancel.
      **Done when** `pnpm check` is clean, the autofixer is clean on the 3 files, and the user
      confirms on `5174`: Add punches → Cancel closes the form and the **Add punches** button
      comes back; Correct → Cancel closes the correction; both work on `/ar/employees/<id>`
      > note: 2026-11-02 built: `onCancel` prop + ghost **Cancel** (`XIcon`) after Save in both
      > forms, `DayPanel` wires it; new key `attendance_cancel` (en + ar). An Escape shortcut was
      > dropped: a key handler on `<form>` fails the a11y check (non-interactive element), and the
      > button is what was asked. 2026-11-02 the user confirmed it on `5174`.
- [ ] 4.1 `#lib/schemas/pattern-pay.schema.ts` + `day-state.schema.ts`
      (+ Vitest: rate range, empty = inherit, to ≥ from, ≤ 14 days, ≥ 1 member)
- [ ] 4.2 `pattern-pay.bl/crud`: pay rule set / reset, holiday add /
      cancel, mission add / cancel (group or member); each write in one
      `batch` with its audit row and `markNeedsRecompute`, then
      `recomputeAfter` (sources `pay_rule`, `holiday`, `mission`); refusals as
      translated `AppError`s
- [ ] 4.3 Copy and "change from a date" carry pay rule and upcoming
      holidays (PR14)
- [ ] 4.4 Tabs on `/patterns/[id]`, `PayRuleCard`, `PayRuleFormSheet`,
      `HolidayList` / `HolidayFormSheet`, `MissionList` / `MissionFormSheet`,
      cancel sheets, preview and staffing-strip holiday marks, library badge

### Phase 5 · Daily attendance page, day editor, history
- [ ] 5.1 `day-state` service: set / clear a state for one person over a
      date range (absence rows, overlap refused, reason; health reasons
      never logged), flagged in its batch, then `recomputeAfter` (source
      `day_edit`)
- [ ] 5.2 `/attendance/days` (GET filters incl. source, table from
      `day_result`, source badges, `catchUpFlagged` on load, Recompute for the
      shown date and scope, "Recompute from a date" for `recomputeFrom`) +
      `DayStateSheet` +
      `DayHistorySheet`; the same sheets on the employee day panel
- [ ] 5.3 Entry sheet and employee page read the stored figures; source
      badges on in / out; ×rate / "not paid" cell; `mission` label

### Phase 6 · Swaps
- [ ] 6.1 `#lib/schemas/swap.schema.ts` (+ Vitest) and `swaps.bl/crud`:
      create request (issues returned, not saved when blocking), approve
      (re-check, overrides with `swap_group_id`, audit, flag + `recomputeAfter`
      with source `swap`), reject, cancel (overrides cancelled together, flag +
      recompute)
- [ ] 6.2 `/changes` page with the tabs, `SwapFormSheet`, approve / reject
      / cancel sheets; swap markers in the roster preview and the daily page

### Phase 7 · Leave balance
- [ ] 7.1 `#lib/schemas/leave.schema.ts` (+ Vitest) and `leave.bl/crud`:
      balances for a set of people and a year (one query each for
      entitlements, leave absences and planned work days), set yearly days
      for a selection (batch + audit), carry suggestion
- [ ] 7.2 `/leave` page, `LeaveDaysSheet`, employee **Leave** card; days
      left and the below-zero warning in the day editor and the entry sheet

### Phase 8 · Strings, checks, docs, hand-off
- [ ] 8.1 Every string in `messages/en.json` and `messages/ar.json`
      (`daily_*`, `day_state_*`, `day_history_*`, `pattern_pay_*`,
      `pattern_holiday_*`, `pattern_mission_*`, `swap_*`, `leave_*`); sidebar
      links
- [ ] 8.2 `pnpm check && pnpm test`, eslint + prettier on touched files,
      `svelte-autofixer` clean on every touched `.svelte`
- [ ] 8.3 Docs: main plan S3.5 and S4.2 point here; S2.3 slots in between
      pattern and company; the guide updated; architecture guide flow
- [ ] 8.4 Playwright spec on `attendance_app_test` (made-up people); the
      user runs it
- [ ] 8.5 Manual check by the user (on `http://127.0.0.1:5174`, `_e2e`):
  1. Enter punches for a made-up person on the entry sheet →
     `/attendance/days` shows worked, overtime, ×1.25 and the badge "Typed"
  2. **History** on that row → "created" with source Typed
  3. Correct the check-out on the employee page → the row changes by
     itself; History shows check-out, worked and overtime old → new, source
     Correction; the in/out badge says Corrected
  4. **Edit day** → Leave → overtime "not paid", days left goes down by one;
     **Clear state** → figures and days left come back; both in History
  5. Pattern → Overtime & pay: OT off from today → a follower's row shows
     "not paid (overtime off)"; History shows source Pay rule
  6. Add a 2-day eligible holiday including today → rows show Holiday;
     the preview and staffing strip mark both days
  7. Add a mission for 2 followers → rows show Mission; a member with sick
     leave on those dates is listed and blocked
  8. `/changes` → New self swap Tue ↔ Sat in the same week → Pending; the
     roster has not changed. Approve → Tue off, Sat works; both days show
     Swap. A swap across two weeks with scope "week" is refused
  9. Employee swap on a date where B also works → refused with the reason;
     a valid one with a return date → after approval both dates change;
     Cancel → both go back
  10. `/leave` → set 21 yearly days for two people → taken and left
      correct; setting leave beyond the balance warns but saves
  11. `/ar/attendance/days`, `/ar/changes`, `/ar/leave`, `/ar/patterns/<id>`:
      right to left, dates in `<bdi>`, no English left
  12. Still fine: the pattern builder, assignments and the entry sheet

## 7. Not in this plan

- Payroll figures (Final, Deduction, tardiness brackets, OT gate): S4.1
  adds them to `day_result`.
- Department rules and the company settings screen (S2.3).
- The employee "no overtime" switch (S3.6).
- Partial missions and other day credits (S3.6/S4).
- Temporary pattern changes (`temp_pattern`, rest of S3.5).
- Approver chain and notifications for swaps (after login, S8).
- Leave by seniority, accrual or half days (until HR asks, Q-PR7).
- Old holiday windows (S2.5), night overtime and night premium (Q3).
- Punch file import (S1.6): it only has to call `recomputeDays` with source
  `punch_reading`.

## 8. Open questions (defaults used until answered)

| # | Question | Default |
|---|---|---|
| Q-PR1 | With overtime off, is extra time unpaid or paid flat ×1.0? (Q8) | unpaid (PR15) |
| Q-PR2 | Are partial missions (e.g. 2 hours) needed now? | no |
| Q-PR3 | May rate changes start on past dates before periods exist? | no (PR5) |
| Q-PR4 | Which states may HR set from the day editor? | leave, sick, mission, no show, other (PR19) |
| Q-PR5 | Leave year: calendar year, or from each person's start date? | calendar year (PR31) |
| Q-PR6 | Is there a cap on carried leave days? | no cap; HR edits the suggestion (PR32) |
| Q-PR7 | Do yearly days depend on seniority or job? | no: HR sets them per person (PR30) |
| Q-PR8 | Must an employee swap's return date be given? | optional (PR26) |

## 9. Fixes found while testing

- 2026-11-02: correcting a time on the employee page crashed the page when the correction form
  closed ("EnhancedForm.remove is not a function"). Cause: the field `remove` became an input named
  `remove`, which hides `HTMLFormElement.remove()` that Superforms calls on destroy. Renamed to
  `voidEvent` (schema, `CorrectionForm.svelte`, `correctEvent`, the page action); no other schema
  uses a form-method name. The four GET filter forms moved from the replaced
  `data-sveltekit-keepfocus` to `data-sveltekit-reset="false"`. The user confirmed the fix on
  `5174` (2026-11-02).
