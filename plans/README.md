# Plans

One file per plan: `plans/YYYY-MM-DD-<slug>.md` with this header:

```markdown
# <Title>

**Status:** to do | in progress | done | superseded
**Date:** YYYY-MM-DD
**Goal:** one or two sentences
```

- Tasks use exactly two states: `- [x]` done, `- [ ]` not done.
- Results or deviations go in an indented `> note:` under the task
  (counts and record IDs only, never personal data).
- Tick a box **as soon as** the task is done. A partly done task stays
  `[ ]` with a note. When every task is ticked, Status becomes `done`.
- Never delete a plan. A replaced plan gets `**Status:** superseded` and a
  pointer to its replacement.
- Commit the plan file together with the work it describes. If two lanes
  edit the same plan, keep both sets of ticks when merging.

## Index

Overview page with every plan, its progress and open tasks: `docs/plans-status.html`
(generated; rebuild with `node tools/plans-status.mjs` after a plan changes).

| Date | Plan | Status |
|---|---|---|
| 2026-10-28 | [Attendance App](2026-10-28-attendance-app.md) | in progress (approved, ready to implement) |
| 2026-10-28 | [Shifts, then manual punch entry](2026-10-28-shifts-and-manual-punches.md) (S2.1 → S2.2 → S1.4) | in progress |
| 2026-10-28 | [Pattern editor: drag and drop, state in sync](2026-10-28-cycle-editor-dnd.md) | done |
| 2026-10-29 | [Attendance builder: pattern library, assignment to teams, member rules](2026-10-29-attendance-builder.md) (S2.4, part of S3.6) | in progress (approved 2026-10-29) |
| 2026-11-01 | [Employee profile: names, contacts, experience, skills, documents, job, custody](2026-11-01-employee-profile.md) | in progress (approved 2026-11-01) |
| 2026-11-01 | [Employee page redesign: avatar header, tabs, sheets, new-employee page; lists managed where used](2026-11-01-employee-page-redesign.md) | in progress (built 2026-11-01; manual check by the user pending) |
| 2026-11-01 | [Employee creation rebuilt: one page, required fields marked](2026-11-01-employee-create.md) | in progress (manual check confirmed 2026-11-01; open: 2.6 clean-up) |
| 2026-11-01 | [Two-level management: department managers above team supervisors](2026-11-01-two-level-management.md) | in progress (approved 2026-11-01; built and confirmed by the user; open: `attendance_app` migration 1.2, Playwright 5.2; "view as" dropped) |
| 2026-11-01 | [Management tree for each employee: who manages whom; status filter on /employees](2026-11-01-employee-management-tree.md) (after the two-level plan's Phases 1–2) | in progress (approved 2026-11-01; built and confirmed by the user; open: Playwright 4.2) |
| 2026-11-01 | [Daily attendance: pattern pay rules, holidays, missions, swaps, leave balance, edit log](2026-11-01-pattern-pay-holidays-missions.md) | in progress (approved 2026-11-02, extended with swaps, leave, the edit log and company defaults; Phases 1–3 and 4.0–4.8 built, all three DBs migrated; 4.4 and 4.8 waiting for the user's check) |
| 2026-11-03 | [Aviation privilege per employee: number, dates, withdrawal and renewal](2026-11-03-aviation-privilege.md) | to do (approved 2026-11-03; a separate agent on `app/privilege` after the pay plan's Phase 4 commit) |
| 2026-11-03 | [E2E test data: the Operation team, September to November 2026](2026-11-03-e2e-operation-seed.md) | in progress (approved 2026-11-03; seeded, recomputed and verified; waiting for the user's manual check) |
| 2026-11-03 | [Day tags: an explanation on every tag, and one colour guide](2026-11-03-day-tags-colour-guide.md) | in progress (approved and built 2026-11-03; waiting for the user's check) |
| 2026-11-04 | [Swaps: self swap and employee swap, from request to roster](2026-11-04-swaps.md) (replaces the pay plan's Phase 6) | in progress (approved 2026-11-04; Phases 1–4 built, waiting for the manual check) |
| 2026-11-08 | [Employee import from HR's reconciled workbook into the local real-data DB](2026-11-08-production-employee-import.md) (part of S1.2) | in progress (imported 2026-11-08; clean slate + re-import 2026-11-09: only the 310 workbook people; waiting for the user's manual check) |
| 2026-11-09 | [Operations team follows the October and November 2026 rosters: one cycle, one pattern per month, a crew start per person, the Oct 1–4 swap, memberships from 2026-10-01, schedule history, month filter on pattern pages](2026-11-09-operations-roster-nov-2026.md) | done (2026-11-09; verify Oct 186/186, Nov 180/180; manual checks 4.3, 5.4, 6.4 confirmed by the user) |
| 2026-11-09 | [Jobs page: list, create, edit, deactivate job titles; who holds each](2026-11-09-jobs-page.md) | in progress (approved 2026-11-09 with every default; built, waiting for the user's manual check) |
| 2026-11-09 | [Hourly leave: paid and unpaid hours off inside a work day](2026-11-09-hourly-leave.md) | to do (proposed 2026-11-09; waiting for answers to Q-HL1–Q-HL9) |
| 2026-11-09 | [Leave and sick balances: opening balances from before the app, new year Hold or Reset](2026-11-09-leave-sick-balances.md) (takes over the pay plan's Phase 7) | to do (proposed 2026-11-09; waiting for approval and Q-LB1–Q-LB7) |
| 2026-11-09 | [Operations team: October 2026 punch history](2026-11-09-operations-october-punch-import.md) (6 people; filled template, Oct 1–20 from the October report) | superseded (2026-11-11) by the attendance import plan |
| 2026-11-09 | [Work outside the roster: day-off work without a shift, work on another shift needs a swap](2026-11-09-off-day-work-and-shift-changes.md) | superseded (2026-11-11) by punches without shifts |
| 2026-11-11 | [Engine v2: the discussed rules as settings, then hourly leave by kind (annual, sick, mission, unpaid), then balance carry (leave days and time balance)](2026-11-11-engine-v2-hourly-leave-carry.md) (after the off-day-work plan) | to do (proposed 2026-11-11; waiting for approval and Q-EN1–Q-EN10) |
| 2026-11-11 | [Attendance import: Odoo history first, then fingerprint device files, checked against Odoo inside the app](2026-11-11-attendance-import-odoo-and-devices.md) (replaces the October Operations import) | to do (proposed 2026-11-11; waiting for approval and Q-IM1–Q-IM7) |
| 2026-11-11 | [Punches without shifts: you type the date, in and out; the roster decides the rest](2026-11-11-punches-without-shifts.md) (then the Operations October import) | to do (user's rule 2026-11-11; waiting for "go") |
| 2026-11-11 | [Shift change request: one person, one date, another shift](2026-11-11-shift-change-request.md) | in progress (built 2026-11-11; all databases migrated; waiting for the user's check) |
