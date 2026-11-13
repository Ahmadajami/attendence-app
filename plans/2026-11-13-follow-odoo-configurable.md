# Follow Odoo, keep every rule a setting, make the app easy

**Status:** in progress (direction decided by the user 2026-11-13: SP1–SP6 and SP10 approved; SP7, SP9 proposed)
**Date:** 2026-11-13
**Goal:** with the same punches, roster and leave, the app gives the figures the Odoo add-on
`roster_attendance` gives. Every rule is a setting (company, or one team's pattern) that changes
from a date, so HR can change it later without touching earlier days or the code. The user sees
each employee's totals for any dates and compares them with Odoo himself. The screens get simpler:
one pattern per team for its rules, a month roster for the days, leave by day or by hours.

Replaces `2026-11-13-october-odoo-november-new.md` (superseded). Plain-language version with
pictures (EN/AR): `docs/simple-plan.html`. Real data: CLAUDE.md §1; counts, dates and ids only.

## 1. Decisions

| ID | Status | Decision | Why |
|---|---|---|---|
| SP1 | approved (user) | **Odoo's rules are the app's default calculation**, for old and new days. No rule set split by a date, no "new way from November" (replaces RF2, RF6) | The new HR has not fixed its own rules yet; equal figures give trust |
| SP2 | approved (user) | **Everything configurable:** each rule is a setting with Odoo's value as the default, at company level and replaceable per team pattern, in dated versions. A change applies from its date; earlier days keep their figures | "When we need to change something, everything works with no issues" |
| SP3 | approved (user) | **A totals page per employee comes first:** any two dates, a team or department, one row per person, a click opens the days, chosen columns, Excel. **No Odoo column and no comparison screen**: the user opens Odoo himself (replaces OC1's check page, IM5, IM8, IM9) | Today the app shows days only; nothing tells the user a person's totals |
| SP4 | approved (user) | **The pattern builder stays, one pattern per team.** The pattern holds the team's rules (overtime on/off, rates, other settings, holidays, usual shift). The days of each month go in a month roster, so no pattern is made per month | Teams work under different rules (one earns no overtime, another has its own) |
| SP5 | approved (user); kinds default | **Leave = kind × length.** Kinds: annual, sick, mission (paid), unpaid. Length: whole day or hours (from, to). Leave by hours covers the shortage and never becomes overtime (BRIEF R8). Odoo's credit minutes for old days are imported as leave by hours (replaces RF4, IM7) | The app only knows whole days today |
| SP6 | approved (user) | **No fixed pay month.** The calculation is per day; the totals page takes any dates, with a quick 21 → 20 button | HR may change the period; nothing in the calculation depends on it |
| SP7 | proposed | Sidebar of 6 entries: Employees, Teams & patterns, Month roster, Attendance, Totals & reports, Settings (with Advanced) | 14 entries today |
| SP8 | replaced by SP10 | ~~Old months before October come in as inputs through the import pages~~ | — |
| SP9 | proposed | Not built now: month lock (RF3), engine reorganisation (RF5), balances carry, sign-in. A made-up day fixture with Odoo's results is added with each rule of §2 | Fast route; the tests are the guard |
| SP10 | approved (user, 2026-11-13) | **The app's data starts on 2026-10-01.** Old data = 1–20 October from Odoo (already imported). September and earlier are not imported: the pay period 21 Sep → 20 Oct stays Odoo's. **Teams differ only by overtime on or off** (answers Q-SP1), so settings per pattern beyond that are not built now | September has its own roster per team and a holiday; importing it costs more than it gives |

Still in force from `docs/decisions.html`: OC2–OC10, RI1–RI11, AR1–AR6, IM1–IM4, IM6, IM17,
PS1–PS3, PR1–PR39, FP1, EN8.

## 2. The settings (Odoo's value is the default)

| Setting | Odoo's value | BRIEF | State |
|---|---|---|---|
| Overtime on / off | on | R8 | built, per pattern |
| Overtime rates | work day 1.25, day off 1.5, holiday 1.5 | R8 | built, per pattern |
| Overtime rounding | none | R8 | built, company; October recompute not run on `attendance_app` |
| Friday Prayer | +60 on a Friday work day with two parts | R15 | built, company |
| Grace time | 15 minutes; lateness inside it is paid and reduces shortage, never overtime | R4, R5 | to build |
| Late minutes | after the grace time | R5 | to build (today: raw, from the shift start) |
| Surplus on a late day | make-up time (paid flat), not overtime | R8 | to build |
| Lateness deduction | 30 → 60, 60 → 120, 120 → 240, more → 540; only when HR ticks the day | R6 | to build |
| Leave by hours | covers shortage, never overtime | R8 | to build (SP5) |
| Final and balance of a day | Final − Required | R9, R10 | to build |
| Shortage against overtime over the chosen dates | from ×1.25 overtime first, then ×1.5 | R11 | to build, in the totals page |
| Any other company setting replaced for one pattern | — | — | later (SP10: teams differ only by overtime on/off, which is built) |

Known from the earlier checks on 1–20 October (script notes, not visible in the app): inputs and
worked time equal Odoo; overtime differed on 661 days by rounding only and on 11 others (7 are
Operations, OC10); shortage differed on 134 days (about 120 leave by hours, about 10 Friday days,
14 with a cause still to find).

## 3. Tasks

### Only the user can do (left from earlier work)

- [ ] T0a Upload the roster file of the 22 Odoo-only people and the October punch file again.
- [ ] T0b OK the "Recompute from a date" 2026-10-01 on `attendance_app` (removes the rounding).

### Build, in this order

- [ ] T1 **Totals page** `/reports` (SP3, SP6): GET filters (from, to, scope, quick ranges), one
      row per person summed from `day_result` in SQL, columns chosen in the URL, click → the daily
      page filtered to that person and dates, Excel export, saved column sets. **Done when** a
      made-up team's totals equal the sum of its days in a test, and the user reports the page.
- [ ] T2 **Leave by hours and unpaid leave** (SP5): table, one Leave form (kind, whole day or
      hours), credit and shortage read it, day tag, import of Odoo's credit minutes for October.
      **Done when** fixture days with a credit give Odoo's shortage.
- [ ] T3 **Odoo's missing rules as settings** (§2): grace, late after grace, make-up time,
      lateness deduction with its day tick, Final and balance, shortage against overtime in the
      totals. One fixture day per rule with Odoo's figures. Then the 14 unexplained days.
- [ ] T4 **Pattern page made easy** (SP4): three cards (usual shift, overtime, holidays); rotation
      closed by default; copy from another pattern. No new settings per pattern (SP10).
- [ ] T5 **Month roster page** (SP4): people × days of a calendar month, click to edit, upload
      (the roster import), copy last month; a cell edit of a past day asks for a reason.
- [ ] T6 **Sidebar** of 6 entries (SP7).
- [ ] T7 **Fingerprint file import**, once a sample exists (IM10).

### Later (kept, not scheduled)

Other settings per pattern; months before October; leave and sick balances; carry between periods; month lock; day actions other than the lateness
tick; aviation privilege; attendance emails through Odoo; sign-in, roles and the facility server;
Playwright specs.

## 4. Checks the user still owes (carried over)

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

## 5. Questions (the default is used until answered; none blocks T1)

| ID | Question | Default |
|---|---|---|
| Q-SP1 | answered 2026-11-13 (SP10): teams differ only by overtime on or off | — |
| Q-SP2 | Leave kinds: annual, sick, mission, unpaid: the full list? | these four |
| Q-SP3 | answered 2026-11-13 (SP10): from 2026-10-01; September is not imported | — |
| Q-SP4 | Fingerprint software, and one sample export in `~/secure/syravia/imports/`? | typed until a sample exists |
| Q-AR1 | A Friday credit needs exactly two parts? (carried over) | yes |
