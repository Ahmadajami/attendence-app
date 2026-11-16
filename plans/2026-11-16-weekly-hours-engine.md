# Weekly hours engine: required hours per week, 2 off days, overtime over a period

**Status:** in progress (approved 2026-11-16: the user's answers and "defaults for the rest"; Phase 1 written and tested, waiting for `pnpm check && pnpm test` on the laptop)
**Date:** 2026-11-16
**Goal:** A second way to calculate overtime, from the same data as the roster engine. It does not use shifts or rosters. Each person owes a number of hours per week and gets 2 off days per week. For any from–to period the engine shows the overtime, split into **day**, **night** and **off-day** overtime, each with its own multiplier set in the app. It is a separate report for everyone (WH1). The roster engine, `day_result` and the payroll exports stay as they are.

## 0. What it reads (all already in the app)

| Data | Table | Used for |
|---|---|---|
| Punches (check-in, check-out, breaks, corrections, voids) | `attendance_event` (each has its `shift_date`) | worked time per date, night minutes |
| Full-day absences (`leave`, `sick`, `mission`, `other`, `no_show`) | `absence` | paid, unpaid or owed by type (WH13) |
| People, teams, departments | `staff`, `team_membership`, … | who appears, filters |
| Timezone | app setting (default `Asia/Damascus`) | the night window and dates |

It does **not** read shifts, patterns, the roster, swaps, holidays (WH7) or `day_result`.

## 1. Decisions

Recorded in `docs/decisions.html` (group "Weekly hours engine", EN and AR).

| ID | Decision | Why |
|---|---|---|
| WH1 | *(approved 2026-11-16, user: 8a)* **A separate, read-only report for everyone**, next to the roster engine. Computed when the page asks; nothing stored yet; `day_result`, the roster engine and the payroll exports do not change | Compare both engines on real months before anything depends on it |
| WH2 | *(approved 2026-11-16, user: 1 "if b not specified then a")* **Off days:** if the person has **fixed off weekdays** (e.g. Fri + Sat, dated on the person), those are the off days. Otherwise they **float**: each week the engine takes the 2 days with the least worked time. Tie rule: Q-WH1 | No roster needed, but a person with fixed days keeps them |
| WH3 | *(approved 2026-11-16, user: 2b)* **Overtime over the whole period:** work-day time − required time of the period. A shortage in one week cancels overtime from another week. A net shortage is shown as **shortage**, never as negative overtime. Off-day overtime stands apart (Q-WH2) | User's choice |
| WH4 | *(approved 2026-11-16, user: 3a, kept with the defaults)* **Which overtime minutes are night:** the work-day minutes worked **after** the required time is reached, in time order, each marked day or night by the clock | User's choice. With WH3 the required time is reached near the end of the period, so the night share comes from the last days worked (Q-WH3, kept) |
| WH5 | *(approved 2026-11-16, user: defaults)* **Required time of a period** = weekly hours × days in the period ÷ 7 (each date with its own version); an absence day's share is weekly hours ÷ (7 − off days per week), e.g. 40 h ÷ 5 = 8 h (WH13). **Week start** is a setting (default Sunday, like Q-A8), read from the company version in force on the period's first date. A **partial week** at either end of the period gets floating off days by its share: round(2 × days ÷ 7), so a period never waits for days after its end | Each period stands alone and can be closed; fixed off days need no share |
| WH6 | *(approved 2026-11-16, user: 5 "keep a toggle for each one"; layout confirmed with the defaults)* **Toggles:** day OT, night OT and off-day OT each have an on/off switch (off: the minutes are shown but weighted 0, marked "not paid"). A fourth switch **"Night on an off day has its own rate"**: off → off-day night minutes take the off-day rate; on → they take a separate **off-day night rate** | Every choice is a switch, nothing is fixed in code |
| WH7 | *(approved 2026-11-16, user: 6)* **No holidays for now.** A holiday is an ordinary date: worked minutes count like any other day, and an unworked holiday does not lower the required time | User's choice; holidays can come later as their own decision |
| WH8 | *(approved 2026-11-16, user: 7 "defined at front end")* **Every number is set in the app**, never in code: weekly hours, off days per week (2), week start, night window, the four rates and the four switches. Company versions with dates (new table `hours_rule`, like `attendance_rule`); a person can have their own weekly hours and fixed off weekdays (table `staff_hours`, dated). Until a company version exists, the report shows minutes but no weighted totals, with a link to the settings | User's choice; dated versions never rewrite past periods silently |
| WH9 | *(approved 2026-11-16, user: defaults)* **Punch pairing:** corrections and voids applied (same rule as `effectiveEvents`); date by date (`shift_date`), in time order, a check-in pairs with the next check-out; the worked segment belongs to that date and may cross midnight; breaks are paid, as in the roster engine. A check-in without a check-out, or a segment over 16 h, is a **problem** shown on the row and counts 0 | Same pairing as the rest of the app; no hidden guesses |
| WH10 | *(replaced 2026-11-16 by WH13)* ~~Every absence lowers the required time~~ | The user asked why; WH13 makes it a choice per type |
| WH11 | *(approved 2026-11-16, user: defaults)* **No overtime rounding**: exact minutes. Weighted total = Σ minutes × rate, shown as hours:minutes and decimal hours, next to the raw minutes (like EN4) | Nothing was asked; rounding can become a setting later |
| WH12 | *(approved 2026-11-16, user: defaults)* **Screens:** page `/overtime` (sidebar under Attendance) with a GET filter form (from, to, department, team, search); one row per person: required, worked, shortage, day OT, night OT, off-day OT, off-day night OT, weighted total, problems; a drawer per person with the weeks (off days marked, F for fixed) and the days. Settings section "Weekly hours" (company versions); a "Weekly hours" card on the employee page (person versions). Permission: whoever may view attendance sees the report; whoever may change attendance rules edits the settings | One page answers "how much overtime in this period"; every figure traceable |
| WH13 | *(approved 2026-11-16, user: a)* **Each absence type counts one of three ways, set in the app** (company version): **paid** (the day's share is credited as paid time, never overtime), **unpaid** (the share is excused, so no shortage, and the day is listed as unpaid for payroll) or **not excused** (the day stays owed and shows as a shortage). Defaults: `leave`, `sick`, `mission` → paid; `other` → unpaid; `no_show` → not excused. An absence on an off day changes nothing. Punches on an absence day are ignored | Without it a leave day would cost the person twice (leave balance and overtime). Hours and pay stay separate questions; matches EN8. Unpaid + "not excused" together would also take the money twice, so a type has exactly one |

## 2. Data model (Phase 2)

- `hours_rule` (company versions, WH8): `weekly_minutes` int, `off_days_per_week` smallint (default 2, 0–7), `week_start` smallint (0 = Sunday … 6), `night_start` / `night_end` (`time`, may cross midnight), `day_ot_on` + `day_ot_rate`, `night_ot_on` + `night_ot_rate`, `off_day_ot_on` + `off_day_ot_rate`, `off_day_night_on` + `off_day_night_rate` (null unless on), `absence_treatment` (jsonb: one of `paid` / `unpaid` / `not_excused` per absence type, WH13), `effective_from`, `effective_to` (exclusive), `reason`, `created_by`, timestamps. Checks: rates 0–5 with 2 decimals, minutes 0–10080, reason present, dates in order, unique start. Same version rules as AR5.
- `staff_hours` (person versions, WH2, WH8): `staff_id`, `weekly_minutes` null (= company), `fixed_off_days` smallint[] null (= floating; when set: distinct weekdays, as many as the company's off days per week), `effective_from`, `effective_to`, `reason`, audit columns.
- Every write goes through `batch([...writes, auditInsert(...)])`. Nothing is deleted.

## 3. Pure logic (`src/lib/hours/`, no DB or SvelteKit imports)

- `dates.ts`: calendar dates and wall-clock → instant in the timezone (plain `Intl`, no package).
- `segments.ts`: punches → worked segments per date (WH9); night minutes of any interval by the night window in the timezone.
- `off-days.ts`: the weeks of a period and their off days, fixed or floating (WH2, Q-WH1); partial weeks by share (WH5).
- `period.ts`: required time and absences (WH5, WH13), work-day vs off-day minutes, overtime and shortage (WH3), night share of the overtime (WH4), weighted total with the toggles (WH6), problems. Returns the weeks and days behind every figure.
- `rules.ts`: the version types, the absence-treatment defaults (WH13) and the absence share; `versionOn` reused from `#lib/payroll/pay-rule.js`.
- `test-helpers.ts`: made-up rules and punches for the tests.

## 4. Tests (Vitest, made-up people only)

Cases written first, each with its expected figures:
1. 40 h/week, works Sun–Thu 8 h, Fri + Sat off → OT 0, shortage 0.
2. Floating: works 6 days × 9 h → 1 off-day day (9 h off-day OT), 45 − 40 = 5 h work-day OT.
3. Fixed Fri + Sat, works Saturday 6 h → 6 h off-day OT even if the week is short.
4. Period netting: week 1 is 4 h short, week 2 is 6 h over → 2 h OT (WH3).
5. Night split: the overtime minutes after the required time is reached, partly inside 22:00–06:00 (WH4).
6. Segment crossing midnight 20:00 → 04:00: date of the check-in, 6 h night with a 22:00–06:00 window.
7. Off-day night, toggle off vs on (WH6); each OT kind switched off → weighted 0, minutes still shown.
8. Absences by type: leave credited (paid), `other` excused (unpaid), `no_show` owed; on an off day nothing; punches on an absence day ignored; HR changes a type (WH13).
9. Partial edge week of 3 days → 1 floating off day (WH5).
10. Open check-in / 17 h segment → problem, counted 0 (WH9).
11. Correction and void of a punch (WH9).
12. A company version changing mid-period: each day takes the version in force on its date.

## 5. Tasks

### Phase 0 · Answers
- [x] 0.1 The user answers Q-WH1–Q-WH6 (or keeps the defaults). **Done when** each is recorded here and in `docs/decisions.html`.
      > note: 2026-11-16. Absences asked again and answered "a" (WH13 replaces WH10, so Q-WH6 is answered by WH13); "defaults for the rest" answers Q-WH1–Q-WH5.

### Phase 1 · The engine (pure)
- [ ] 1.1 `src/lib/hours/` (§3) with the tests of §4. **Done when** `pnpm test` passes all 12 cases and `pnpm check` is clean (run by the user: no `node_modules` in the cloud session).
      > note: 2026-11-16. Written: `dates.ts`, `rules.ts`, `segments.ts`, `off-days.ts`, `period.ts`, `test-helpers.ts`; tests `segments.test.ts` (11) and `period.test.ts` (16). All 27 pass under Node with a stand-in for Vitest; `pnpm check`, `pnpm test`, eslint and prettier wait for the user.

### Phase 2 · Settings
- [ ] 2.1 Tables `hours_rule`, `staff_hours` (§2), migration generated and read. **Done when** applied to `attendance_app_test` and `attendance_app_e2e`; `attendance_app` after the row count and the user's OK.
- [ ] 2.2 Services `weekly-hours.bl.ts` / `.crud.ts`, schema `#lib/schemas/weekly-hours.schema.ts`, permission checks, audit. **Done when** a version can be added and closed, and a person version set, with an audit row each.
- [ ] 2.3 Settings section "Weekly hours" (company versions: weekly hours, off days, week start, night window, four rates, four switches) and the employee card (weekly hours, fixed off weekdays); en + ar. **Done when** the user's manual check 6.1–6.3 holds.

### Phase 3 · Report
- [ ] 3.1 `/overtime` page and drawer (WH12), en + ar, RTL. **Done when** the user's manual check 6.4–6.8 holds.
- [ ] 3.2 Compare with the roster engine on one real month (counts only, outside the repo). **Done when** the user has seen the comparison.

### Phase 4 · Later (not started without the user's go)
- [ ] 4.1 Excel export of the report.
- [ ] 4.2 Holidays (WH7), rounding (WH11), team-level rates.

## 6. Manual checks (the user, on `http://127.0.0.1:5174`)

- [ ] 6.1 Settings → Weekly hours: add a version (40 h, 2 off days, Sunday, 22:00–06:00, rates); it appears with its dates.
- [ ] 6.2 Switch "Night on an off day has its own rate" on: the extra rate field appears; off: it disappears.
- [ ] 6.3 An employee page: set fixed off days Fri + Sat; choosing a third day is refused.
- [ ] 6.4 `/overtime` with a month: one row per person with the columns of WH12.
- [ ] 6.5 Open a person: the weeks show their off days (F on fixed ones) and the days add up to the row.
- [ ] 6.6 Turn off-day OT off in a new version: the row's weighted total drops, the minutes stay, marked "not paid".
- [ ] 6.7 A person with a missing check-out shows a problem.
- [ ] 6.8 `/ar/overtime`: right to left, all labels in Arabic.

## 7. Questions (defaults used until the user answers)

All answered 2026-11-16 ("defaults for the rest"; Q-WH6 by WH13).

| ID | Question | Answer |
|---|---|---|
| Q-WH1 | Floating off days: when two days have the same worked time (e.g. a leave day and an unworked day, both 0), which becomes the off day? | the day without an absence first, then the earlier date |
| Q-WH2 | Does a period shortage on work days eat off-day overtime? | no: off-day OT is always paid |
| Q-WH3 | With overtime over the whole period (2b), "after the required time is reached" means the last days of the period, so the night share depends only on those days. Keep 3a, or share the night minutes in proportion over the period? | keep 3a |
| Q-WH4 | Week start day; partial weeks at the period's edges get floating off days by share (round(2 × days ÷ 7)) | Sunday; by share |
| Q-WH5 | "A toggle for each one": an on/off switch per OT kind plus the "off-day night own rate" switch (WH6)? | yes |
| Q-WH6 | Do all absence types (leave, sick, mission, unpaid) lower the required time? | by type (WH13): leave, sick, mission paid; other unpaid; no_show not excused |
