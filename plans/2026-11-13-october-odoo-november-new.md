# One plan: October follows the Odoo add-on, November runs the new way

**Status:** superseded (2026-11-13) by [2026-11-13-follow-odoo-configurable.md](2026-11-13-follow-odoo-configurable.md): the user chose to follow Odoo with every rule a setting, instead of two rule sets split by a date
**Date:** 2026-11-13
> note: 2026-11-13 (later the same day) the user reported the app feels as complicated as Odoo and
> that HR's pay month runs 21 → 20. A simpler route is proposed in `docs/simple-plan.html` (EN/AR):
> pay months, old months kept with Odoo's own figures and locked, a month roster instead of monthly
> patterns, hour leave, a 5-entry menu. It would replace Phase A's comparison work and Q-RF6.
> Nothing here changes until the user answers its five questions.
> note: 2026-11-13 (version 2 of that page) the user: the new HR wants to change the old way, so
> calculate months normally and let HR shape the report freely. Proposed there: calendar months, one
> rule set for old and new days (no Odoo parity, no lock), a report page with free dates and columns.
> If confirmed (its question 1), RF2–RF4 and Phases A–B of this plan are replaced.
> note: 2026-11-13 (version 3) the user: the pattern builder stays, because each team has its own
> rules (one team earns no overtime, another has its own overtime rules); leave exists as annual, sick
> and by hours. Page corrected: one pattern per team for its rules, the month roster for the days;
> leave = kind × length (whole day or hours).
**Goal:** every day up to 2026-10-31 gives the figures of the Odoo add-on `roster_attendance`
(proven day by day, then locked). Every day from 2026-11-01 is calculated by the app's new rules.
Both run through **one engine**: the difference is a dated set of rule values, never a second code
path. This file replaces all 29 earlier plans.

Real data: CLAUDE.md §1. Counts, dates and record ids only.

## 0. What happened to the old plans

The 29 plan files were removed from `plans/` on 2026-11-13 (user's instruction). Nothing is lost:

- Their text is in git at commit `39b1bc5`: `git show 39b1bc5:plans/<file>.md`.
- Every decision they made (ids such as PR16, OC7, RI11, AR4, EN8) is still in
  `docs/decisions.html` with its reasons. A decision stays in force unless §2 below replaces it.
- Code comments that name an old plan file point to that commit.

## 1. Review of the 29 plans

| Area (old plans) | State on 2026-11-13 | What this plan does with it |
|---|---|---|
| Foundation: departments, teams, employees, profile, jobs, management tree, employee import (7 plans) | Built. 310 people + 22 Odoo-only people in `attendance_app`. Open: the user's browser checks, 4 Playwright specs, one clean-up | Kept as built. Checks listed in §7. No new work |
| Shifts, patterns, builder, pattern editor, Operations roster (4 plans) | Built and used. Open: roster grid export/import by workbook (builder Phase 6) | Kept. The grid import is covered by the roster import (already built) |
| Daily attendance: stored day, recompute, edit log, day tags, swaps, shift change, punches without shifts, daily page speed (6 plans) | Built. Open: browser checks | Kept. This is the engine §4 reorganises |
| October: roster import, punch import, rules as settings, October parity (4 plans) | Roster 7 976 / 7 976 planned days equal Odoo. Punches 3 945 / 3 945 person-days equal to the minute, states 346 / 346. Worked 3 632 / 3 632 equal. Overtime differs on 661 days by rounding only (fixed in code, recompute not yet run) and 11 others. Shortage differs on 134 days | Phase A finishes it |
| Engine v2, hourly leave, leave and sick balances (3 plans) | Not built, except rounding and Friday Prayer | Split: what October needs → Phase A; what November needs → Phase C; carry → Later |
| Main plan (1 plan): payroll exports, emails, sign-in, deployment | Not started | Exports → Phase C; the rest → Later |
| Superseded: off-day work, Operations punch import (2 plans) | Replaced earlier | Dropped |
| Aviation privilege, e2e seed (2 plans) | Privilege not built; seed built | Privilege → Later; seed kept |

Three problems the old plans had, which this one fixes:

1. **Three plans described the same October work** (roster import, attendance import, parity),
   and two more described the same engine change (engine v2, rules settings). One list now.
2. **Nothing protects October after it matches.** `DAY_RESULT_ENGINE` is part of every stored
   day's fingerprint, so the next engine change rewrites October on the next recompute. → RF3.
3. **"Wait for hourly leave, then convert Odoo's credits"** (IM7) left about 120 October days
   that can never match Odoo until a November feature exists. → RF4.

## 2. Decisions

| ID | Status | Decision | Why |
|---|---|---|---|
| RF1 | approved (user, 2026-11-13) | One plan. The 29 earlier files are removed from the folder and stay in git at `39b1bc5`. The "never delete a plan" rule restarts from this file | 29 overlapping files could no longer be followed |
| RF2 | approved (user, 2026-11-13) | **Two rule sets, one engine.** Days up to 2026-10-31 use the *Odoo rules* (what the add-on did). Days from 2026-11-01 use the *new rules*. Each is a dated row in `attendance_rule`; the engine reads the row of the day's shift date. No `if (date < …)` anywhere in code | The switch date and every value stay visible and editable; October cannot change when November's values do |
| RF3 | proposed | **A closed month is locked.** When October shows 0 unexplained days, the user closes it. A recompute, a rule change or an engine update then skips its days and reports them as "locked". Reopening needs a reason and is audited | Otherwise the proof is lost at the next engine change |
| RF4 | proposed (replaces IM7 when approved) | **Odoo's credit minutes are imported now** as day credits: person, date, kind (annual, sick, mission, training), minutes, no time range, source "Odoo". They reduce the shortage and never create overtime (BRIEF R8). November's hourly leave (EN8) uses the same table with a from/to time | October matches without waiting; one table for both months |
| RF5 | proposed | **The engine moves into one folder with one step per rule** (§4). Each step returns its figure and one explanation line. Template leftovers are removed. A fixture of made-up days is the permanent Odoo-parity test | Today the day's figures are spread over `roster/attendance.ts`, `roster/overtime.ts`, `attendance/day-result.ts` and `payroll/pay-rule.ts` |
| RF6 | default | **November's values** are the column "November" of §3 until the user answers Q-RF1–Q-RF6 | The user asked for a new way; the values are theirs to set |
| RF7 | proposed | **Order:** Phase A (close October) → Phase B (reorganise, figures unchanged) → Phase C (November). A step of B may run before A ends only if it changes no stored figure | One month at a time; nothing paid from unchecked figures (OC8) |

Decisions that stay as they are: OC1–OC10, RI1–RI11, AR1–AR6, IM1–IM6, IM8–IM9, IM17, PS1–PS3,
PR1–PR39, FP1, EN8, EN10 (`docs/decisions.html`).

## 3. The two rule sets

"Built" = in the code today. Odoo's column is the add-on's behaviour (BRIEF §4, R1–R15) as its
October data shows it.

| Rule | October (Odoo add-on) | November (new, default) | Built |
|---|---|---|---|
| Required minutes | the planned shift's length; 0 on a day off, holiday, full-day state | same | yes |
| Worked minutes | check-in → check-out of each part, added up (a break between two parts is not counted) | same | yes |
| Overtime | worked − required, **no rounding**; every minute on a day off or eligible holiday | rounded to the nearest 15 minutes (Q-RF1) | yes (setting) |
| Friday Prayer | +60 paid on a Friday work day with two parts; covers shortage, never overtime | same (Q-RF2) | yes (setting) |
| Credit minutes (leave, sick, mission, training during the day) | reduce the shortage, never overtime | hourly leave with a time range and a kind; same effect | **no** (RF4) |
| Lateness inside the grace time | forgiven: counted as paid, reduces the shortage | same (Q-RF3) | **no** |
| Lateness beyond grace | shown; charged on 0 October days | shown, not charged (Q-RF4) | shown only |
| Surplus on a late day | make-up time, not overtime (R8) | overtime as on any day (Q-RF4) | **no**; build for October only if the check page shows a day that needs it |
| Shift start hour | a placeholder (the group's median check-in, OC3) | HR's real start hour, so lateness is real | yes |
| Roster source | Odoo's day plan per department; Operations follows HR's workbook (OC10) | HR's monthly workbooks through the roster import, or patterns in the app; changes are requests (swap, shift change) | yes |
| Punch source | Odoo file for 1–20; typed for 21–31 | fingerprint device files (needs one sample, Q-RF5); typed until then | Odoo and typed: yes; device: no |
| People | 310 + the 22 Odoo-only people (OC9) | the 310; the 22 leave on 2026-11-01 | 22 created; leaving date not set |
| Day balance and month totals | Final − Required per day; shortage eats ×1.25 overtime first (R9–R11) | same formulas, November's values | **no** |
| Output | the check page (app next to Odoo) | month page, Payroll Period and Period Balance workbooks | **no** |

## 4. "Calculate days": what it does

On screen it is **Recompute these days** and **Recompute from a date** (Daily attendance page).
In code: `recomputeDays` in `src/lib/server/services/day-results/day-results.bl.ts`. Odoo's
equivalent was "Re-apply & Recompute Days".

The app stores one row per person per day (`day_result`). Calculate days rebuilds those rows from
their inputs. It never changes an input: no punch, roster, leave or setting is touched.

For each person and each date in the range (never later than today), 100 people at a time:

1. **Read the plan of the day** from the roster: pattern and crew start, the person's own off
   days, holidays, approved swaps and shift changes, full-day states (leave, sick, mission). The
   result is one planned shift, or a day off.
2. **Read the punches** counted for that shift date. A corrected punch is replaced by its
   correction; a voided one is ignored.
3. **Read the rules of that date**: the attendance rule version (rounding, Friday Prayer) and the
   pay rule (overtime on/off and the three rates: pattern, else company, else default).
4. **Work out the figures:**
   - *status*: day off, expected, missing, present, late, on break, done, unscheduled work, absent;
   - *required* = the shift's length (0 on a day off, a holiday or a full-day state);
   - *worked* = each check-in → check-out part, added up (empty until the last check-out);
   - *late* = first check-in − shift start;
   - *credit* = Friday Prayer minutes when the day qualifies;
   - *shortage* = required − worked − credit, never below 0;
   - *overtime* = worked − required, rounded by the rule; every minute on a day off or holiday;
   - *pay* = the rate for those minutes (work day, day off, holiday), or "not paid" with a reason.
5. **Compare with the stored row** by its fingerprint. Same and not flagged: nothing is written.
   Different, or new: the row is written, and the edit log gets one line per value that changed
   (old value, new value, the cause, who).

It reports: days written, days unchanged, log lines.

When it runs:

- **By itself**, after every save that changes an input (a punch, a day state, a swap, a roster or
  membership change, an import, a rule change). The save first flags the days, then recomputes
  them. If the recompute fails, the days stay flagged and are repaired the next time the Daily
  page opens.
- **Recompute these days**: the people and dates filtered on the page (at most 400 days).
- **Recompute from a date**: everyone active or with punches, from that date (at most 400 days
  back) to today, one audit
  row with the counts. This is the one October needs after a rule change.

Why a figure can change without anyone editing that day: the roster behind it changed, a rule
version now covers its date, or the engine itself was updated (its version number is part of the
fingerprint). The last case is what RF3 stops for a closed month.

## 5. Target structure (Phase B)

```
src/lib/engine/            pure, no DB, client-safe
  punches.ts               effective events, parts          (from roster/attendance.ts)
  rules.ts                 one DayRules per date: attendance rule + pay rule, with sources
                           (from roster/attendance-rules.ts, payroll/pay-rule.ts)
  steps/required.ts  worked.ts  late.ts  credit.ts  shortage.ts  overtime.ts  pay.ts  balance.ts
  day.ts                   runs the steps in order → figures + explanation lines
  day-result.ts            stored shape, fingerprint, edit-log diff   (from attendance/day-result.ts)
  month.ts                 month totals, netting, lock check
  odoo-compare.ts          app day next to Odoo day → cause
  fixtures/odoo-days.ts    made-up days with the figures Odoo gives
```

Rules of the reorganisation:

- A step reads `DayRules`; it never reads a date. A new behaviour is a new rule field whose
  built-in default is Odoo's value.
- Removed: `attributeEvent` (no caller since punches carry no shift), `approvalState` /
  `ApprovedOvertime` (template leftover), `shiftSummary`'s unused `approval` argument.
- `day-results.bl.ts` keeps the loading and writing; it calls `day.ts` and skips locked months.
- The stored fingerprint must not change by moving code: Phase B is done when a recompute of
  everything on `attendance_app_e2e` writes 0 days.

## 6. Tasks

### Phase A · Close October on the Odoo rules

- [ ] A1 The user: upload the roster file of the 22 people, upload the October punch file again
      (about 329 lines for them; saved lines skip).
- [ ] A2 The user's OK, then "Recompute from a date" 2026-10-01 on `attendance_app`. **Done
      when** the 661 rounding differences are gone and worked is still equal on every day.
- [ ] A3 Odoo day reference: table `odoo_day_reference`, import kind in `/imports` with preview,
      save and undo (IM5).
- [ ] A4 `odoo-compare.ts` and the check page `/imports/[id]/check`: app next to Odoo per day,
      a cause on every difference, counts per cause, accept a cause once (IM8, IM9).
- [ ] A5 Day credits (RF4): table, import from Odoo's credit minutes, `credit` and `shortage`
      steps read them. **Done when** the days with an Odoo credit match on shortage.
- [ ] A6 Grace inside the grace time (R5) as a rule field, Odoo's value in October. Then the 14
      days where the app's shortage is 3–13 minutes higher: find the cause on the check page;
      build it as a rule field or accept it as a named cause.
- [ ] A7 21–31 October: typed on the entry sheet, or device files if a sample arrives (OC6).
- [ ] A8 Month lock (RF3): close and reopen, recompute skips locked days.
- [ ] A9 The user closes October. **Done when** the check page shows 0 unexplained days and the
      month is locked.

### Phase B · One engine folder (no figure changes)

- [ ] B1 Fixture `odoo-days.ts`: one made-up day per rule R1–R15 and per golden number, with
      Odoo's figures; the test runs them under the Odoo rules.
- [ ] B2 Move the code into `src/lib/engine/` as in §5; old import paths removed; tests move too.
- [ ] B3 `rules.ts`: one `DayRules` from the attendance rule and the pay rule.
- [ ] B4 Remove the leftovers named in §5.
- [ ] B5 **Done when** `pnpm check && pnpm test` pass and a full recompute on
      `attendance_app_e2e` writes 0 days.

### Phase C · November on the new rules

- [ ] C1 The user answers Q-RF1–Q-RF6; the November row of `attendance_rule` is saved from
      2026-11-01 with those values.
- [ ] C2 The 22 Odoo-only people get a leaving date of 2026-11-01 (OC9); the November roster of
      every team from HR's workbooks through the roster import.
- [ ] C3 Hourly leave by kind with a time range (EN8) on the day-credit table; "Cover the gap"
      in the day editor (EN9).
- [ ] C4 Device file import, once a sample exists (IM10); typed entry until then.
- [ ] C5 Day balance and month totals (`balance.ts`, `month.ts`); month page with the totals per
      person; close November (same lock as October).
- [ ] C6 Payroll Period and Period Balance workbooks. October's are compared cell by cell with the
      golden workbooks in `~/secure/syravia/golden/`; November's come from the new rules.

### Later (kept, not scheduled)

Leave and sick balances with opening balance and new-year carry (LB1–LB23); time balance carried
between months (EN11–EN12); rules per department and per pattern (EN1); day actions "charge
lateness", "cancel overtime", "no prayer credit" (EN6); aviation privilege (AV decisions);
attendance emails through Odoo (S6); sign-in, roles and the facility server (S8); the Playwright
specs.

## 7. Checks the user still owes (from the old plans)

On `http://127.0.0.1:5174` (e2e database). Tick when the user reports the result.

- [ ] U1 Attendance rules: `/admin/settings` card, add a version, Friday tag on a two-part Friday,
      7 overtime minutes shown as 7 in October.
- [ ] U2 Daily page: first 100 rows at once; Previous / Next keep filters; recompute, edit day,
      history and shift change work from page 2; `/ar` right to left.
- [ ] U3 Imports: re-upload after undo; the roster of a team looks as if typed after the import.
- [ ] U4 Punches without shifts: a day-off punch, a normal day, a late day, a night.
- [ ] U5 Shift change for staff `4e26598d` on 13 and 14 October; those days no longer late.
- [ ] U6 Swaps: request, approve, reject, cancel; markers on the roster and the daily page.
- [ ] U7 Pattern pay tabs, company "Pay & holidays" card, day tags and the colour guide.
- [ ] U8 Employees: profile tabs and sheets, new-employee page, management tab, jobs page.
- [ ] U9 Builder: build a pattern, assign it to a team, member preview after a reload.
- [ ] U10 E2E Operation seed: September and October pages, typing November punches.
- [ ] U11 Real data: the employee import check on `http://127.0.0.1:5173`; move the source
      workbook into `~/secure/syravia/imports/`.

## 8. Questions (the default is used until answered)

| ID | Question | Default |
|---|---|---|
| Q-RF1 | November overtime rounding? | nearest 15 minutes |
| Q-RF2 | Friday Prayer in November: keep +60 on a two-part Friday? | yes |
| Q-RF3 | Lateness inside the grace time in November: forgiven and paid, as in Odoo? | yes |
| Q-RF4 | Lateness beyond grace in November: charge anything, and does the surplus still count as overtime? | nothing charged; surplus is overtime |
| Q-RF5 | Punches in November: which device software, and one sample export? | typed until a sample exists |
| Q-RF6 | Odoo's pay period ran 21 → 20, and its punches stop on 20 October. Does the new way start on 1 November (calendar months), or on 21 October? | 1 November; 21–31 October use the Odoo rules |
| Q-AR1 | A Friday credit needs exactly two parts? (carried over) | yes |
| Q-AR2 | Months before October keep the app's old rules? (carried over) | yes |
