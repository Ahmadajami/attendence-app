# Plans

Work plans for the Damascus Airport Operations app. Only **open work** lives here.

| File                                       | What it covers                                                         | Next                                 |
| ------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------ |
| [`TRACKING.md`](TRACKING.md)               | Every checkpoint's status, and a dated log of what landed              |                                      |
| [`ROSTER_PLAN.md`](ROSTER_PLAN.md)         | Team moves, attendance, overtime, daily attendance report, integration | RE (team moves with a date)          |
| [`OPERATIONS_PLAN.md`](OPERATIONS_PLAN.md) | Teams, employees, flights, imports, flight assignment and report       | X18 (staff service split), before RE |

## How the plans work

- One file per topic: `plans/<TOPIC>_PLAN.md`, with a status line, the owner's decisions, phases, and
  steps with IDs (`RE1`, `X18`, …) that commits and reviews point at.
- Every phase ends with a **checkpoint**: what must be true, checked by hand or in the database, before
  the next phase starts.
- When a step lands, tick it. When a checkpoint passes:
  1. add a dated entry to the log in `TRACKING.md` (what, commit, migrations applied) and update its
     row in the checkpoints table;
  2. remove the finished phase from its plan (the text stays in git);
  3. keep any decision or rule the remaining phases still need in the plan's Decisions or notes.
- A plan whose phases are all done is deleted; its leftovers go under "Carried over" in `TRACKING.md`.
- A new topic gets a new `<TOPIC>_PLAN.md` here and a row in the table above.
- Dates are Damascus dates (`YYYY-MM-DD`).
