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
| 2026-11-08 | [Employee import from HR's reconciled workbook into the local real-data DB](2026-11-08-production-employee-import.md) (part of S1.2) | in progress (imported 2026-11-08: 310 people, re-run 0 changes; waiting for the user's manual check) |
| 2026-11-09 | [Operations team follows the October and November 2026 rosters: one cycle, one pattern per month, a crew start per person, the Oct 1–4 swap, memberships from 2026-10-01, schedule history, month filter on pattern pages](2026-11-09-operations-roster-nov-2026.md) | done (2026-11-09; verify Oct 186/186, Nov 180/180; manual checks 4.3, 5.4, 6.4 confirmed by the user) |
| 2026-11-09 | [Operations team: October 2026 punch history](2026-11-09-operations-october-punch-import.md) (6 people; filled template, Oct 1–20 from the October report) | in progress (approved 2026-11-09; dry run on `attendance_app` shown, waiting for the OK to commit) |
