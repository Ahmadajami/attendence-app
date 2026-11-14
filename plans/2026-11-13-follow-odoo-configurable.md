# Follow Odoo, keep every rule a setting, make the app easy

**Status:** in progress (direction decided by the user 2026-11-13: SP1–SP6 and SP10–SP14 approved; SP7, SP9, SP15 proposed)
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
| SP11 | approved (user, 2026-11-14) | **Overtime stays rounded to the nearest 15 minutes**, from 2026-10-01 too. This is a chosen difference from Odoo, which does not round (an exception to SP1; replaces the October value of AR4) | The user's choice |
| SP12 | approved (user, 2026-11-14) | **The local Claude Code session does the Odoo inserts**, not the user by hand: it runs the extraction and calls the app's import services from a script (same plan, counts, audit and undo as the import pages). On `attendance_app`: counts shown first, then the user's OK (CLAUDE.md §4) | The work moves to the user's machine, where the database and the secure folder are |
| SP13 | approved (user, 2026-11-14) | **Reception Excel files find the roster differences first.** A read-only script compares the reception files with the app's roster and lists, per team and date, where the worked hours do not fit the planned shift (the Fly Dubai nights from 2026-10-28 among them). Shifts and patterns are fixed from that list, not by guessing | Several teams may have changed, not one |
| SP14 | approved (user, 2026-11-14) | **All 22 Odoo-only people are kept.** Their October roster and punches are imported (L3). Whether they leave the app from November (OC9) is still open | The user looked at the list and decided |
| SP15 | proposed | **The local agent is OpenCode v2 (Go plan), not Claude Code** (amends SP12). Because its models are hosted by outside providers with no published retention policy found, the agent writes the scripts for tasks on real data and **the user runs them and reads the output**; the agent never opens `~/secure/syravia/` or runs a query that returns names | CLAUDE.md §1: no outside service receives staff data |

Still in force from `docs/decisions.html`: OC2–OC10, RI1–RI11, AR1–AR6, IM1–IM4, IM6, IM17,
PS1–PS3, PR1–PR39, FP1, EN8.

## 2. The settings (Odoo's value is the default)

| Setting | Odoo's value | BRIEF | State |
|---|---|---|---|
| Overtime on / off | on | R8 | built, per pattern |
| Overtime rates | work day 1.25, day off 1.5, holiday 1.5 | R8 | built, per pattern |
| Overtime rounding | none | R8 | built, company. **Value here: nearest 15 (SP11)**; the rule version from 2026-10-01 holds 0 and must be set to 15 |
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

### First, on the user's machine (local OpenCode v2 session; SP11–SP15)

Start state of `attendance_app` (2026-11-12 notes): 28 migrations; 310 + 22 people; October roster
and punches of the 310 imported; the 22 have no roster or punches yet; rule version from 2026-10-01
holds rounding 0; stored days were computed before engine 2 and have not been recomputed.

- [ ] L0 OpenCode v2 set-up (check each key against the v2 docs; v2 renamed several):
      `CLAUDE.md` is read as the rules file when no `AGENTS.md` exists, so do not run `/init`;
      permissions set to ask for shell commands and file edits (v2 keys `permissions` / `shell`,
      not v1's `permission` / `bash`); the Svelte MCP server added under `mcp.servers` (CLAUDE.md
      §3 needs its autofixer); the RTK hook of CLAUDE.md §7 is a Claude Code hook and does not run
      here. **Done when** the agent answers "which plan file do I start from" correctly and a
      `.svelte` autofixer call works.
- [ ] L1 Merge branch `ccr-c38cc2fe-mnmw85` into `app/main`; `pnpm check && pnpm test`.
- [ ] L2 Rounding (SP11): set the attendance rule version that starts 2026-10-01 to step 15,
      nearest, on `_e2e` and `_test`, then on `attendance_app` after the row count and the user's
      OK (audited; a data change, not a new version, because a version may not start on an
      existing start date, AR5). Update `attendance-rules.test.ts` if a test pins October to 0.
- [ ] L3 The 22 Odoo-only people, **all kept (SP14)**: their October roster (`extract_roster.py --only-new`,
      RI11) and their punches (about 329 lines of the October file; saved lines skip), through a
      script that calls the roster-import and punch-import services. Dry counts first, user's OK,
      commit. Under SP15 the user runs the script; the agent sees counts only. **Done when** the counts equal the file and 0 lines are refused as unknown person.
- [ ] L4 Recompute from 2026-10-01 on `attendance_app` after the user's OK. **Done when** every
      stored day is on engine 2, overtime is still in steps of 15, and the Friday credit shows on
      the qualifying Fridays (counts in a note).
- [ ] L5 Reception files (SP13): the user puts them in `~/secure/syravia/imports/reception/`; a
      read-only script lists team, date and count where the worked hours do not fit the planned
      shift (ids, dates and counts only). The user decides per row: new shift and pattern from a
      date (Fly Dubai, night from 2026-10-28), a shift change for single days, or leave as is.
- [ ] L6 Attendance from 2026-10-21 onward: by the user's own plan (to be told to the local
      session). Not typed by default.

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
