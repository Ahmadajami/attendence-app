# Roster plan: team moves, attendance, overtime, daily report

Open work on the attendance core: who works when, what actually happened, and how much overtime it
made. Each step has an ID (`RE1`, `RG2`, …) so commits and reviews can point at it. Tick a step when it
has landed. Start the next phase only after the previous checkpoint is verified, record the result in
[`TRACKING.md`](TRACKING.md) with the date and commit, then remove the finished phase from this file.

**Status:** RA–RD done (see `TRACKING.md`) · **next: RE** (with OPERATIONS X18 first) · RG, RH, RI ⏳.
Finished phases are in git: `git show e47a970:ROSTER_PLAN.md`.

## Goal

The app's core is attendance. For that it must know, for every employee and every day, whether they
should be working, when, and how long they actually worked.

- **Shift cycles** (built): every team, and some individuals (admin staff, supervisors), follow a
  repeating cycle of N days, each day **Day**, **Night** or **Off**, anchored to a start date. Every
  shift is 12 h.
- **Team moves:** when an employee changes team, the admin picks the effective date. Before it the old
  team's cycle applies, from it the new team's, so their shifts and off days change with the team.
- **Attendance:** the admin records check-in / check-out / breaks and absences against each person's
  rostered shift; the app shows who is late or missing, and each day's overtime; a daily report
  reconciles it.
- **Supervisors** (built): each team lists its supervisors (staff members). They have **no sign-in and
  no recording rights yet**; supervisor accounts are Later.

## Decisions (owner, 2026-10-26 / 27)

| Topic             | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope             | Recurring rosters were CLAUDE.md Phase 4 ("do not build yet"). **The owner moves them into the MVP**, because attendance needs to know who should be working. **Overtime hours** are calculated. Still out: overtime pay, automatic roster optimization, forecasting (CLAUDE.md §6.7).                                                                                                                                                                                                                        |
| Who does it       | **Only admin**: shift times, cycles, team moves, overrides, swaps, attendance, absences, overtime approval. No approval step; what the admin saves is live. Operations managers (and the dormant supervisor role) lose `attendance.record`; supervisors get a different job later.                                                                                                                                                                                                                            |
| Shift pattern     | **Repeating cycle** entered by the admin cell by cell (Day / Night / Off), 1–28 days, anchored to a Damascus date (cycle day 1). No built-in presets; the editor can copy another pattern's cycle to start from.                                                                                                                                                                                                                                                                                              |
| Pattern owner     | A pattern belongs to a **team**, or to **one person** (admin staff and supervisors follow their own). On a date where a person has a personal pattern, it wins over their team's.                                                                                                                                                                                                                                                                                                                             |
| Shift times       | **Only 12 h shifts.** The admin enters the Day start and Night start once, airport-wide (`app_setting`); each shift ends 12 h later (a night ends the next day). Each pattern version copies the times when saved, so a later change never rewrites history.                                                                                                                                                                                                                                                  |
| Shift date        | A shift belongs to the **date it starts**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Pattern changes   | Patterns are **versioned** (`effective_from` / `effective_to`), never edited in place, so past rosters and reports stay as they were (CLAUDE.md §6.6). Saving from a date closes the version in force there and **deletes** versions scheduled on or after it (they never took effect; the audit row keeps them). Effective dates are today or later.                                                                                                                                                         |
| Team moves        | **Admin picks the effective date**: today or later, **never backdated**. No minimum-rest check. `staff_team_membership` (OPERATIONS X6) becomes the **source of truth** for "which team, when"; `staff.team_id` is removed once nothing reads it. A pending future move shows on the employee.                                                                                                                                                                                                                |
| Swaps             | A swap between two people is **one linked action**: its overrides share a `swap_group_id`, are created in one batch, and are cancelled together.                                                                                                                                                                                                                                                                                                                                                              |
| Roster storage    | **Computed, not stored.** A person's roster for a day = personal pattern, else their team (membership on that date) → that pattern's version on that date → cycle day → shift window; then **overrides** and **absences** on top. Nothing to regenerate when patterns or teams change.                                                                                                                                                                                                                        |
| Attendance        | `attendance_event` is **append-only** (CLAUDE.md §7); corrections are new events with a `reason`. Each event stores the shift date and kind it was counted for, so reports never shift when patterns change later.                                                                                                                                                                                                                                                                                            |
| Attendance rules  | **Breaks are paid**: worked minutes = check-in → check-out, breaks not subtracted (break events only drive "on break"). **Late** after 15 min. An event belongs to the shift whose window runs from 2 h before its start to 7 h after its end (window chosen by Claude, so a long stay still attributes).                                                                                                                                                                                                     |
| Overtime          | **Per day**, no legal rules, no carry-over: on a rostered shift, overtime = worked minutes − 720 when positive (12 h 40 m worked = 40 m). On an **extra shift** (a Day / Night override on an off day that isn't a swap) or an unscheduled check-in on an off day, **all** worked minutes are overtime (a full extra shift = 12 h). **Rounded to the nearest 15 min** (half up: 7 m → 0, 8 m → 15, 40 m → 45). Shown as decimal hours and `h:mm`. Two categories, by the shift's kind: **Day** and **Night**. |
| Overtime approval | **Only admins** approve (`overtime.approve`, seeded for `admin` only). An approval stores the approved minutes; if later corrections change the computed overtime, the day shows "changed since approval".                                                                                                                                                                                                                                                                                                    |
| Overtime warning  | Warn (never block) when one shift date has more than **18 h worked** (12 h + a half shift). Chosen by Claude at the owner's request.                                                                                                                                                                                                                                                                                                                                                                          |
| Engine & tests    | The roster calculation is the pure, client-safe `src/lib/roster/` (built and tested), used by the server and for live previews. Every new rule it implements gets a Vitest case.                                                                                                                                                                                                                                                                                                                              |

## Open questions (ask the ops team; do not invent, CLAUDE.md §10)

None left for RE–RI. New questions go here before they are acted on.

## What the remaining phases build on

- **Tables** (migrations `0010` / `0011`, applied): `app_setting`, `shift_pattern`, `team_supervisor`,
  `roster_override`, `overtime_approval`, `attendance_event`, `absence`; columns and constraints in
  CLAUDE.md §7 and `src/lib/server/db/schema/{settings,roster,attendance}.ts`.
- **Services:** `services/settings/`, `services/roster/`, `services/teams/` (bl + crud);
  `services/membership.ts` (membership builders, OPERATIONS X6).
- **Engine rules** (`src/lib/roster/`):
  - **Team on a date** = the membership open at 00:00 Damascus that day; a night that starts the
    evening before a move stays with the old team.
  - **Attribution:** rostered shifts are tried first, then the airport Day / Night of the surrounding
    days (unscheduled); among fits, a check-in goes to the nearest start, a check-out to the nearest
    end, a break to the shift it falls in. A check-out or break stays with the open check-in's shift
    while in its window. The caller passes the roster days before, on and after the event's date.
  - **Corrections:** a corrected event is dropped and its correction used (`effectiveEvents`).
  - **Status:** expected until 15 min after the start, then missing; present / late (over 15 min) /
    on break while checked in; done once checked out; an absence with no events is absent.
  - **Worked time** is whole minutes (seconds dropped), summed over check-in → check-out pairs.
  - **Overtime** is computed only once checked out; an absence day with events counts as unscheduled.

---

## Phase RE — Team moves with an effective date ⏳

Do OPERATIONS X18 (staff service split) first: RE rewrites the same staff reads.

- [ ] **RE1** BL `moveStaff(actor, staffId, teamId | null, effectiveDate)`: closes the membership at the
      effective date, opens the next; replaces a pending future move; rejects dates before today
      (`InvalidInputError`); audit. `roster.manage`.
- [ ] **RE2** Move dialog on `/employees`: drag-and-drop and the row action open it with the date
      (default today, earlier dates disabled) and the old / new team.
- [ ] **RE3** Readers move from `staff.team_id` to the membership on a date: employees list, team member
      counts, flight crew lookups, team deactivation, staff import commit.
- [ ] **RE4** Employee row shows a pending move ("→ Team B from 3 Nov").
- [ ] **RE5** Migration: drop `staff.team_id` once nothing reads it (OPERATIONS X6 backfill guarantees
      every current team has an open membership).

**Checkpoint RE:** a move dated next week leaves this week's roster on the old team and next week's on
the new one; a move posted with yesterday's date gets 400; no code reads `staff.team_id`; the membership
consistency query returns no rows.

## Phase RG — Attendance & overtime recording ⏳

- [ ] **RG1** `services/attendance/attendance.{bl,crud}.ts`: record check-in / check-out / break start /
      end (append-only; stores `shift_date`, `shift_kind`, `team_id` from the engine), correction events
      with `reason`, absences (create / cancel with reason), roster overrides, swaps as one action (both
      sides' overrides with one `swap_group_id` in one batch; cancelling cancels the group); audit every
      write in the same batch. `attendance.record` / `roster.manage`.
- [ ] **RG2** `/attendance`: date (default today) and team; per shift, each rostered person with status,
      times and one-tap actions; unscheduled check-in on an off day allowed with a reason.
- [ ] **RG3** Late / missing / on-break indicators from the engine; refreshed with `invalidate()` polling
      (CLAUDE.md §6.8).
- [ ] **RG4** Per person per day: worked hours, short flag, overtime as decimal hours and `h:mm`,
      Day / Night category, over-18 h warning.
- [ ] **RG5** Overtime approval (`overtime.approve`): approve / revoke a person's day, storing the
      approved minutes; audit; "changed since approval" when corrections move the computed value.
- [ ] **RG6** EN + AR; all times Damascus in `<bdi>`.

**Checkpoint RG:** a night shift's check-in at 18:50 and check-out at 07:05 next day count for the
night's date; a person with no check-in 20 min after start shows missing; an absence hides them from
missing; a correction keeps the original event and shows the new one; a 07:00 check-in and 21:10
check-out (with a 1 h break) shows 2.25 h (2:15) of Day overtime; an extra Day shift on an off day
worked 07:00–19:00 shows 12 h; an approval followed by a correction shows "changed since approval"; an
operations manager posting attendance or an overtime approval gets 403.

## Phase RH — Daily attendance report ⏳

- [ ] **RH1** `/reports/attendance?date=&team=`: per team and shift: scheduled, present, late, missing,
      absent, off, unscheduled; per person worked hours and overtime (Day / Night, approved / pending).
      `report.read`.
- [ ] **RH2** Reconciliation: report totals equal the events and absences for that date (a query in the
      checkpoint); history stays the same after a later pattern change, shift-time change or team move.
- [ ] **RH3** Print stylesheet; EN + AR.

**Checkpoint RH:** the report for a test day matches the events entered in RG by hand; changing the
team's pattern or the shift times afterwards doesn't change that day's report.

## Phase RI — Integration, import & hardening ⏳

- [ ] **RI1** Flight assignment (OPERATIONS Phase F) pre-checks the team's roster: warn when the
      handling window falls on the team's off day or outside its shift.
- [ ] **RI2** Staff import: team column → membership effective on the commit date (or a date column);
      re-check the import against the new model, then resume OPERATIONS Checkpoint D.
- [ ] **RI3** Security pass: every roster, attendance, overtime and settings load / action checks its
      permission (a viewer gets 403), no `staff.team_id` left; CLAUDE.md §4 / §7 final; `pnpm check`,
      `pnpm lint`, `pnpm test`, Svelte autofixer, `pnpm build`.

**Checkpoint RI:** full flow in EN and AR: set shift times → set a team's cycle → add supervisors to the
list → move an employee with a date → record a day with overtime → approve it → the report reconciles;
then OPERATIONS Checkpoint D passes.

## Later (owner; not in RE–RI)

- Supervisor accounts and rights: sign-in (`ACCOUNT_ROLES`, CLAUDE.md §8), recording attendance for
  the teams they supervise only (`requireTeamAccess`), supervisor nav.
- Team alignment: staggering several teams' anchors on one cycle so every Day and Night is covered.
- Coverage targets per shift or function.
- Saved named rotations (presets), if copying patterns isn't enough.
- Public holidays as an overtime category.
- Overtime export to Odoo / payroll, and locking a period once exported.

## Order with `OPERATIONS_PLAN.md`

- X18 (staff service split) lands before RE. The other Phase X fixes may continue alongside.
- OPERATIONS Checkpoint D (upload & import) waits for RI2.
- OPERATIONS Phase F (team ↔ flight assignment) can start any time now; RI1 uses the roster engine.

## Reuse

- Membership history and its builders: `src/lib/server/services/membership.ts`, migrations `0008` / `0009`.
- Damascus time helpers: `src/lib/server/time.ts`, `src/lib/utils/datetime.ts`, `src/lib/roster/cycle.ts`.
- Errors and action helpers: `src/lib/server/errors.ts` (`AppError`, `failForm`, `failNotice`);
  `toastNotice` (`src/lib/utils/notice-toasts.ts`) for plain actions.
- Permission helper: `requireActorPermission` in `src/lib/server/services/common.ts`.
- Cycle editor, preview and pattern form: `src/lib/app/roster/`.
- Sheets, Formsnap fields, `Select` wiring (incl. the placeholder-item exception): CLAUDE.md §3 Forms.
