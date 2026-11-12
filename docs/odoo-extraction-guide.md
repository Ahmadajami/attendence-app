# How the Operations October roster and punches got into the app (and how to repeat it)

For an agent that brings **another team or month** into the app. Written 2026-11-12 from what
was actually done for team Operations (6 people), October 2026. Read CLAUDE.md first; its §1
real-data rules apply to every step.

## 1. What really happened (the short version)

| Data | Where it came from | How it got in |
|---|---|---|
| Employees | HR's reconciled workbook (`~/secure/syravia/imports/2026-11-08/`) | `scripts/import-employees.ts` (plan `2026-11-08-production-employee-import.md`) |
| **Roster** (who works which shift each day) | **HR's monthly roster workbook**, not Odoo (`~/secure/syravia/imports/rosters/2026-10/`, one row per person, one column per day, codes `D` / `N` / `O`) | Entered by the user **in the app's forms** (one pattern per month, a crew start per person, swaps for days against the pattern), then checked by `scripts/check-team-roster.ts` (plan `2026-11-09-operations-roster-nov-2026.md`) |
| **Punches** (check-in / check-out) | **Odoo's October report** (`october_2026_no_roster.xlsx`, sheet `Daily`: one row per person and date, made by Odoo from its `roster_line` table) → turned into a Markdown table `operations_attendance_october_2026.md` | `scripts/import-october-punches.ts` (dry run, then `--commit`) (plan `2026-11-11-punches-without-shifts.md`) |
| Odoo's own figures (breaks, credits, balance) | The Odoo database `syravia_dev`, read-only | **Not imported.** Only read to compare and explain numbers |

Result on `attendance_app`: 58 punched days → 116 events; the roster check against HR's workbook
gave 186/186 days.

## 2. Rules for the agent (non-negotiable)

- **Real data never enters the repo.** Every extracted file goes to `~/secure/syravia/imports/…`
  (folders mode 700, files mode 600). The scripts refuse a file inside the repo.
- **Odoo is read-only.** Only `SELECT`. Never write to Odoo.
- **Console output and notes: record IDs, dates and counts only.** No names, no badge numbers in
  chat, plans or commits.
- **Writing to `attendance_app` (real data) needs the user's OK** after a dry run they have seen.
  The dev database `attendance_app_e2e` can be wiped or reseeded freely.
- **The user does browser testing.** The agent never opens the app.

## 3. Where things are

| Thing | Where |
|---|---|
| Odoo database | Docker container `odoo-db`, database `syravia_dev`, user `odoo`. It may be stopped: ask the user to start it. If `docker` says "permission denied", the user's shell must run it |
| Odoo tables used | `hr_employee` (`barcode` = the app's **`staff.legacy_badge_no`**, not `employee_no`: the two differ for 58 of the 302 people who have a badge; match on the badge, fall back to `employee_no` only when `legacy_badge_no` is empty. Never match by name), `hr_attendance` (**one row per person per day**: first check-in → last check-out, UTC), `roster_line` (Odoo's day: code, required, the **break** as `break_minutes`, `break_start`, `break_end`, credits, status, final, balance) |
| What Odoo holds (checked 2026-11-12) | Punches from 2026-05-21; **October is complete from 1 to 20** (about 290 people a day); 21–31 October is not in Odoo (11 stray punches on 21–22). The user updated Odoo on 2026-11-12, so it is the current source again (Q-IM1) |
| Odoo report workbooks | `~/secure/syravia/imports/rosters/<YYYY-MM>/…_no_roster.xlsx`, sheet `Daily` (columns `badge, employee, date, code, attendance_status, manual_state, check_in, check_out, required_minutes, actual_minutes, overtime_minutes, shortage_minutes, final_minutes, deduction_extra_pay, is_weekly_off, …`) |
| HR roster workbooks | the user's Desktop or `~/secure/syravia/imports/rosters/<YYYY-MM>/` |
| App team ids | `/teams` page, or the URL `/teams/<id>` |

## 4. Steps for another team and month

### Step 1 · The roster (from HR's workbook, not Odoo)

1. Get HR's roster workbook for the month into `~/secure/syravia/imports/rosters/<YYYY-MM>/`.
2. Find which crew start fits each person (read-only):
   ```sh
   pnpm exec tsx --env-file=.env scripts/check-team-roster.ts plan \
     --file ~/secure/syravia/imports/rosters/<YYYY-MM>/<file>.xlsx --month <YYYY-MM> \
     --team <team id> --pattern <pattern id> --anchor <anchor date> --code D=D8 --code N=N8
   ```
   It prints, per workbook row: the staff record id, the crew start, days that don't fit, and the
   swaps that explain them.
3. **The user** enters it in the app: Copy last month's pattern → rename → assign to the team
   from the 1st (same anchor) → crew starts on the Schedule tab → swaps on `/changes` for days
   against the pattern. (Decision RO7: entry through the app's forms, never a script.)
4. Check: same command with `verify`. **Done when** it says `mismatches: 0`.

**October 2026, teams other than Operations (decision IM13):** HR has no workbook for them, so
Odoo's day plan (`roster_line`: off days, required minutes; person found by `barcode` =
`legacy_badge_no`) is the roster until HR's workbooks arrive. Odoo's shift hours are placeholders
(every pattern starts at 10:00), so start times are proposed from median check-ins. Entry sheet and
one verify workbook per team: `~/secure/syravia/imports/rosters/2026-10/odoo/`. Check a weekly team
with `verify` (no `--anchor`), one `--pattern` for the team pattern plus one per personal pattern,
and the letter codes the entry sheet shows for that team:

```sh
pnpm exec tsx --env-file=.env scripts/check-team-roster.ts verify \
  --file ~/secure/syravia/imports/rosters/2026-10/odoo/<team>_2026-10_from_odoo.xlsx --month 2026-10 \
  --team <team id> --pattern <team pattern id> [--pattern <personal pattern id> …] --code A=<shift> …
```

`plan` stays for cycle patterns only (it fits crew starts).

### Step 2 · The punches (from Odoo)

Make one Markdown table per team and month in `~/secure/syravia/imports/punches/<YYYY-MM>/`,
in exactly this shape (the import reads columns by header name; `—` means no punch):

```
| ID | Name | Date | Day | Check In | Check Out | Status |
|---|---|---|---|---|---|---|
| <badge> | - | 2026-10-05 | Mon | 07:46 | 20:40 | overtime |
```

- `ID` = the app's **`staff.employee_no`** (the import matches on it). Find the person by Odoo
  `hr_employee.barcode` = `staff.legacy_badge_no`, then write their `employee_no`. For Operations the
  two are the same, so the October file looked as if the badge were the ID; for 58 people they differ.
  `Name` is never read: write `-`.
- Times are Damascus `HH:MM`. A check-out earlier than the check-in is the next morning.
- `Status` is only used to list full-day states (`sick`, `leave`, `mission`) for the day editor.

Two ways to fill it. Since 2026-11-12 the user says the **Odoo database is current** (Q-IM1):
**use B**; A is the cross-check.

**A · From Odoo's report workbook** (what was done for October). Read sheet `Daily` of the month's
`…_no_roster.xlsx` with Python's `zipfile` (no `openpyxl` on this machine; never install
packages) and write one table row per `badge` + `date` of the team's people, from the columns
`check_in`, `check_out`, `attendance_status`. Run Python with `-I`. Limit: the report has only
the **first check-in and last check-out**, so a Friday prayer break is lost.

**B · From the Odoo database** (the source since 2026-11-12). Read-only. Odoo keeps **one row per
day** (first check-in → last check-out); a break is only on `roster_line` (`break_start`,
`break_end`). For a day with a break, write **two table rows on the same date**: check-in →
break start, and break end → check-out (the app then leaves the gap unpaid). Without a break,
one row:

```sh
docker exec -i odoo-db psql -U odoo -d syravia_dev -At -F '|' -c "
  select e.barcode,
         to_char(a.check_in  at time zone 'UTC' at time zone 'Asia/Damascus', 'YYYY-MM-DD'),
         to_char(a.check_in  at time zone 'UTC' at time zone 'Asia/Damascus', 'HH24:MI'),
         to_char(a.check_out at time zone 'UTC' at time zone 'Asia/Damascus', 'HH24:MI')
  from hr_attendance a join hr_employee e on e.id = a.employee_id
  where e.barcode in (<the team's legacy_badge_no values>)
    and a.check_in >= '<month start>'::date - 1 and a.check_in < '<next month start>'
  order by 1, 2, 3" > ~/secure/syravia/imports/punches/<YYYY-MM>/odoo_segments.psv
chmod 600 ~/secure/syravia/imports/punches/<YYYY-MM>/odoo_segments.psv
```

Then replace each badge with the person's `employee_no` (app: `legacy_badge_no` → `employee_no`).
Add the break window from `roster_line` (same badge and date; `break_start` / `break_end` at time
zone 'UTC' → 'Asia/Damascus'), then turn the result into the Markdown table above. Check against
the report (A) for a few people: for Operations 1–20 October both give the same 58 days.

### Step 2b · Since 2026-11-12: one file for all teams, imported in the app

```sh
python3 -I tools/odoo/extract_punches.py <YYYY-MM> ~/secure/syravia/imports/odoo/<YYYY-MM>/punches_<YYYY-MM>.md
```

Read-only. Columns `Employee No | Date | Check in | Check out | State`: one line per punch part
(a break day is two lines) or per full-day state (`sick` / `leave` / `mission`), people matched by
badge and written with their app employee number, excluded people (`~/secure/syravia/imports/exclude.json`)
left out, Odoo people the app doesn't know kept under their badge so the preview refuses them
visibly. Upload it on `/imports` as **Punches and full-day states**: the preview gives every line one
outcome (import / skipped / refused, with the reason) and the counts must add up; **Save**, and
**Undo import** if needed. Test on the e2e server first; the real database only after the user's OK.
Steps 3 and 4 below describe the old Operations-only script.

### Step 3 · Dry run, then import

1. **The import script only allows Operations October on the real database.** Before another team
   or month, change the guard in `scripts/import-october-punches.ts` (`REAL_DB`, `OPS_TEAM`,
   `OPS_STAFF`, `OPS_FROM`, `OPS_TO`) into arguments, or build the in-app import (plan
   `2026-11-11-attendance-import-odoo-and-devices.md`, IM3). Don't just delete the guard.
2. Dry run (inserts run inside a transaction that is rolled back):
   ```sh
   pnpm exec tsx --env-file=.env scripts/import-october-punches.ts \
     --file ~/secure/syravia/imports/punches/<YYYY-MM>/<team>_<YYYY-MM>.md \
     --database attendance_app --team <team id> --from <first day> --to <last day>
   ```
3. Read the output: people matched, rows with times, **rejected rows by reason** (should be 0),
   pairs per planned day (shift codes / day off), **pairs with a warning** (day-off work, or times
   that don't fit the planned shift), full-day states to enter by hand.
4. Show it to the user. Only after their OK, run the same command with `--commit`.

### Step 4 · After the import (the user, in the app)

1. `/attendance/days` → the team, the month → **Recompute**.
2. Enter the full-day states the dry run listed (sick, leave) in the day editor.
3. For each warning:
   - **another shift on a planned day** (e.g. a night on a day-shift date) → **Shift change** button
     on that row (D8 → N8), save and approve;
   - **work on a day off** → day-off work is already counted (×1.5); if HR says it was a swap,
     record the swap.

## 5. Things that surprised us in October (check them every time)

- **Odoo's badge is not the app's employee number for everyone.** Match `barcode` to
  `staff.legacy_badge_no` (58 people differ). Matching on `employee_no` alone loses about 60 people
  and makes them look "not in the app".
- **The roster was right; the punches differed.** 6 of 58 rows didn't match HR's workbook (2 nights
  on planned day shifts, 4 days worked on a day off). That is information for HR, not an import error.
- **Work on a day off that a swap made** used to break the recompute (fixed 2026-11-11, commit
  `fbbca0e`).
- **Friday prayer:** a Friday with a break gets 60 paid minutes in Odoo (decision FP1). Only source B
  (with the break window from `roster_line`) keeps the break; the app's engine doesn't add the
  60 minutes yet (engine v2, EN5).
- **October 21–31 is not in Odoo.** Those days stay empty until another source (the fingerprint
  device files) covers them.
- **Odoo's own day settings can differ from HR's workbook** (some days required 540 minutes instead
  of 720). The app follows HR's workbook.
- **HR workbooks can repeat a person** in a short extra row (October row 7). The check script keeps
  the fuller row and reports the other.
- **Odoo's "OT" figure is a weighted balance**, not overtime minutes (it includes the ×1.25 premium
  and credits). Never compare it with the app's overtime minutes directly.
