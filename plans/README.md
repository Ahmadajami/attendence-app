# Plans

One file per plan: `plans/YYYY-MM-DD-<slug>.md` with this header:

```markdown
# <Title>

**Status:** in progress | done | superseded
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
| 2026-11-01 | [Employee creation rebuilt: one page, required fields marked](2026-11-01-employee-create.md) | in progress (built 2026-11-01; manual check by the user pending) |
| 2026-11-01 | [Two-level management: department managers above team supervisors](2026-11-01-two-level-management.md) | in progress (approved 2026-11-01; Phase 1 written, migrations waiting for the user) |
| 2026-11-01 | [Management tree for each employee: who manages whom](2026-11-01-employee-management-tree.md) (after the two-level plan's Phases 1–2) | proposed (waiting for the user's approval) |
