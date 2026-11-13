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
  pointer to its replacement. (One reset, on the user's instruction, 2026-11-13: the 29 plans
  written before that date were removed and replaced by the single plan below. Their text is in
  git: `git show 39b1bc5:plans/<file>.md`. Their decisions stay in `docs/decisions.html`.)
- Commit the plan file together with the work it describes. If two lanes
  edit the same plan, keep both sets of ticks when merging.

## Index

Overview page with every plan, its progress and open tasks: `docs/plans-status.html`
(generated; rebuild with `node tools/plans-status.mjs` after a plan changes).

| Date | Plan | Status |
|---|---|---|
| 2026-11-13 | [One plan: October follows the Odoo add-on, November runs the new way](2026-11-13-october-odoo-november-new.md) (replaced the 29 earlier plans) | superseded (2026-11-13) by the plan below |
| 2026-11-13 | [Follow Odoo, keep every rule a setting, make the app easy](2026-11-13-follow-odoo-configurable.md) | in progress (SP1–SP6 approved by the user; SP7–SP9 proposed) |
