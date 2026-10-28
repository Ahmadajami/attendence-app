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
