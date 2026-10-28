# Tracking

What landed, when, and which checkpoints passed. Newest first. The plans in this folder hold only open
work; a phase is removed from its plan once its checkpoint passes and is logged here. The full text of a
removed phase stays in git (the `Plan text` column gives the command).

## Checkpoints

| Plan       | Checkpoint                         | Status                       | Date       | Commit              | Plan text                              |
| ---------- | ---------------------------------- | ---------------------------- | ---------- | ------------------- | -------------------------------------- |
| Roster     | RI Integration, import, hardening  | ⏳ not started               |            |                     | `plans/ROSTER_PLAN.md`                 |
| Roster     | RH Daily attendance report         | ⏳ not started               |            |                     | `plans/ROSTER_PLAN.md`                 |
| Roster     | RG Attendance & overtime recording | ⏳ not started               |            |                     | `plans/ROSTER_PLAN.md`                 |
| Roster     | RE Team moves with a date          | ⏳ next                      |            |                     | `plans/ROSTER_PLAN.md`                 |
| Roster     | RD Settings, cycles, supervisors   | ✅ passed                    | 2026-10-27 | `e47a970`           | `git show e47a970:ROSTER_PLAN.md`      |
| Roster     | RC Roster engine                   | ✅ passed                    | 2026-10-27 | `b14522f`           | `git show e47a970:ROSTER_PLAN.md`      |
| Roster     | RB Schema & migrations             | ✅ passed                    | 2026-10-27 | `0fb7f2e`           | `git show e47a970:ROSTER_PLAN.md`      |
| Roster     | RA Decisions & docs                | ✅ passed                    | 2026-10-27 | `5d5748b`           | `git show e47a970:ROSTER_PLAN.md`      |
| Operations | H Hardening & docs                 | ⏳ not started               |            |                     | `plans/OPERATIONS_PLAN.md`             |
| Operations | G Flight report                    | ⏳ not started               |            |                     | `plans/OPERATIONS_PLAN.md`             |
| Operations | F Team ↔ flight assignment         | ⏳ not started               |            |                     | `plans/OPERATIONS_PLAN.md`             |
| Operations | X Review fixes                     | ⏳ in progress, never run    |            |                     | `plans/OPERATIONS_PLAN.md`             |
| Operations | E Flights                          | ⏳ built, not run            |            | `b6bfc7d`           | `plans/OPERATIONS_PLAN.md`             |
| Operations | D Import engine                    | ⏸ built, paused (ROSTER RI2) |            | `b6bfc7d`           | `plans/OPERATIONS_PLAN.md`             |
| Operations | C Employees                        | ◐ partly run                 | 2026-10-26 | `b6bfc7d`           | `plans/OPERATIONS_PLAN.md`             |
| Operations | B Teams CRUD                       | ◐ partly run                 | 2026-10-26 | `b6bfc7d`           | `plans/OPERATIONS_PLAN.md`             |
| Operations | A Schema & migrations              | ✅ passed                    | 2026-10-26 | `b6bfc7d`           | `git show e47a970:OPERATIONS_PLAN.md`  |
| Auth       | A–H, R (all)                       | ✅ passed, plan complete     | 2026-10-26 | `2fb6890`…`e4a1453` | `git show e47a970:AUTH_PLAN.md`        |
| Sidebar    | RTL mirroring                      | ✅ done                      | 2026-10-26 | `2f4d7c2`           | `git show e47a970:SIDEBAR_RTL_PLAN.md` |

## Log

### 2026-10-27

- **History rewritten (owner's request):** the `Co-Authored-By: Claude` line removed from every commit
  on `main`, `neon-env` and `roster`; file contents unchanged, so every hash in this file is the new
  one. Old commits kept locally as `backup/*-before-rewrite` branches. `main` (PR #1 merge `3d012d5`)
  and `roster` need a force-push.
- **Plans moved to `plans/`.** Finished phases removed from the plans; `AUTH_PLAN.md` and
  `SIDEBAR_RTL_PLAN.md` removed (complete). Open items from them are under "Carried over" below.
- **Roster RD: Checkpoint passed** (owner, in the browser, EN + AR). Shift times in `/admin/settings`;
  team cycle editor with live 4-week preview, copy from a team, supervisors and history on
  `/teams/[id]`; personal cycles on `/employees/[id]`; cycle and supervisors on the teams list. RD1–RD7
  done. Commit `e47a970`. **OPERATIONS X17** (teams service split) done with it.
- **Roster RC: Checkpoint passed.** Roster engine in `src/lib/roster/` (cycle, roster, attendance,
  overtime, versions), 63 Vitest tests. Commit `b14522f`.
- **Roster RB: Checkpoint passed.** Tables `app_setting`, `shift_pattern`, `team_supervisor`,
  `roster_override`, `overtime_approval`, `attendance_event`, `absence`; 37 constraint checks in a
  rolled-back transaction. **Migrations `0010` / `0011` applied to the `.env` Neon database** (staging may
  share it). Commit `0fb7f2e`.
- **Roster RA: Checkpoint passed.** Owner decisions recorded (12 h Day / Night, admin-only roster and
  attendance, overtime rules); CLAUDE.md updated; Vitest added. Commit `5d5748b`.

### 2026-10-26

- **Roster plan written.** Commit `deeae72` (pushed to `origin/roster`).
- **PR #1 merged to `main`** (merge commit `3d012d5`, for the staging check): operations core `b6bfc7d`
  with Phases A–E as built, SvelteKit 3 error handling, X1–X6, X11, X12, X16, X13 / X14 for the flight
  sheet, the no-team employee hotfix. **Migrations `0006`–`0009` applied** to the `.env` Neon database.
- **Operations B / C: checkpoints partly run** by the owner (create, duplicate name, employee create /
  update / moves). Bug found and fixed: an employee with no team posted the `none` placeholder.
- **Operations A: Checkpoint passed.** Overlap `23P01`, one active team per flight `23505`, seeds present.
- **Auth plan complete.** A schema + RBAC seed `2fb6890`, B sessions + JWT `5938967`, C 6-digit codes +
  first admin `330a58d`, D web login `d29af18`, E + R protected pages and code-only sign-in `9eb4ca3`,
  F token API `6db57fa`, G account management `e5ff97c`, H hardening + security review `e4a1453`.
- **Sidebar RTL** mirroring done. Commit `2f4d7c2`.

## Carried over from finished plans

- **Auth, before real use:** admin `1234` still has the development code `123456`; replace it with
  `pnpm auth:issue-code 1234`.
- **Auth, accepted trade-offs:** anyone who knows an ID can lock that account with 5 wrong codes
  (recovery: `pnpm auth:issue-code`); "locked" tells that an ID exists; a shared airport NAT shares the
  20-per-IP budget. Open with the ops team: the default code validity (7 days).
- **Auth, only if employees get access:** create an account from a `staff` record (`login_id =
employee_no`); deactivating a staff member deactivates their account; managers issue codes for
  employees (`user.issue_code`, team-scoped).
- **Sidebar:** the RTL fixes are edits to generated files in `src/lib/components/ui/sidebar/`. Re-running
  `pnpm dlx shadcn-svelte add sidebar` overwrites them; redo the logical-utility swaps afterwards.
- **Lint:** the whole-repo `pnpm lint` fails on Prettier for about 150 files nobody touched; the owner
  hasn't decided whether to run `pnpm format` once.
