# Two-level management: department managers above team supervisors

**Status:** proposed (2026-11-01; waiting for the user's approval and answers to Q-M1–Q-M6)
**Date:** 2026-11-01
**Goal:** Give the organisation two management levels under HR: **department managers** (level 1)
over **team supervisors** (level 2). Each one has a clear **scope** (who they are responsible
for, on which dates), and every employee has a clear **chain** (supervisor → manager → HR) that
later approvals and sign-in will use. For now **HR still does everything on the one local
computer** (D17): this plan builds the structure, the scopes and a "view as" preview; accounts
for managers come with sign-in (S8).

**Lane:** A. Builds on D22 (teams: one department, a supervisor, dated members; approver =
supervisor, else department manager, else HR), D10 (sub-departments inherit) and builder plan B6
(nearest department wins). Read `CLAUDE.md` §1 (no personal data in tests, plans, commits) and §3
(UI, Forms) first. One commit per phase, plan file included.

---

## 0. Starting point (checked 2026-11-01)

- `department.manager_staff_id`: **one** manager per department, optional, an active employee
  (`departments.bl.ts`). **No history**: changing it overwrites the old value (only the audit log
  remembers). The `/departments` tree shows the manager's name.
- `team_supervisor`: any number of supervisors per team, **dated** (`added_at` / `removed_at`),
  edited on `/teams/[id]` (`SupervisorsCard`). "Information only" today.
- `team.department_id`: each team sits in one department (builder 3.6).
- RBAC roles `admin`, `operations_manager`, `supervisor`, `dispatcher`, `viewer` exist from the
  template; only `admin` is used (single local user). `staff.user_id` can link a person to an
  account later.
- Nothing yet answers "who is responsible for this employee on date D?" or "whom does this
  manager cover?". Approvals (swaps, S3.5) and per-manager views (S8) both need it.

## 1. Decisions (defaults; stop and ask before departing from one)

| # | Decision | Why |
|---|---|---|
| M1 | **Two levels under HR:** level 1 = **department manager**, level 2 = **team supervisor**. HR (admin) stays above both and can do everything | The user's request (2026-11-01); matches D22 and D5's supervisor level |
| M2 | **One manager per department** (optional). A department without its own manager is covered by the **nearest manager up the tree** (D10, B6). A parent's manager also *sees* sub-departments that have their own manager, but the **nearest** one comes first in the chain (Q-M4) | One responsible person per place; sub-departments without a manager are never orphaned |
| M3 | **Manager history:** a new table `department_manager` (department, staff, `valid_from`, `valid_to` exclusive, reason), **dated like team membership** and never overlapping per department (EXCLUDE). It replaces `department.manager_staff_id`; the migration turns today's values into open rows from their department's creation date | "Who was the manager on the 15th?" must be answerable for approvals and payroll questions; overwriting loses it |
| M4 | **Supervisors** keep `team_supervisor` (any number per team, dated). A person can supervise several teams and manage several departments. A supervisor **need not be a member** of the team (Q-M2), but must work in the team's department or one of its sub-departments (Q-M3) | Uses what exists; keeps the chain inside one department branch |
| M5 | **Chain of an employee on date D:** the supervisors of their team that day → the nearest manager of the team's department (or the person's own department when they have no team) → HR. A person is **never in their own chain**: a supervisor's chain starts at their manager; a manager's chain starts at the manager of the parent department | The approver order of D22, made exact per date; no self-approval (DIFF §5) |
| M6 | **Scope on date D:** a supervisor covers the members of their teams that day; a manager covers everyone in their department(s) **and sub-departments** that day, including the teams there and their supervisors. Computed from dated membership, never stored | Membership already moves by date; a stored copy would drift |
| M7 | **Pure engine** `src/lib/workforce/management.ts` (no DB, no SvelteKit), Vitest with a made-up organisation: `chainOf`, `scopeOf`, `gaps` | Same pattern as `src/lib/roster/`: the rules are tested before any UI |
| M8 | **Now (no sign-in): a `/management` page** for HR: the tree Department → manager → teams → supervisors → member counts, the **gaps** (department without a manager in its chain, team without a supervisor, inactive manager/supervisor, supervisor outside the team's department), and "change manager from a date" / add-remove supervisor | HR sets up and checks the structure before anyone signs in |
| M9 | **"View as"** (HR only): a GET filter `?as=<staffId>` on `/employees`, `/teams` and `/attendance/entry` that limits the list to that manager's or supervisor's scope, with a banner "Viewing as X (department manager)". **Read-only preview: it changes no permission** | HR can check exactly what each manager will see once sign-in returns |
| M10 | **The employee profile** shows "Reports to: supervisor(s) · manager" (Overview tab) | The chain is visible where HR looks for a person |
| M11 | **Out of scope here:** manager/supervisor **accounts and sign-in** (S8: roles with permission keys, every BL checks the actor's scope server-side), and the **approval workflow** itself (S3.5 `/changes` will use M5). This plan only provides the chain and the scopes they will use | No login yet (D17); approvals need `/changes` first |
| M12 | **Permissions now:** viewing `/management` needs `staff.write`; changing managers and supervisors needs `staff.write` (as departments and teams today). No new keys until S8 | Single local user; keys come with the roles in S8 |

Questions for the user (each default above is used until answered):

| # | Question | Default |
|---|---|---|
| Q-M1 | Can a department have **more than one manager** (e.g. a deputy who acts when the manager is away)? | No: one manager; a deputy can come later as a second, lower row |
| Q-M2 | Must a supervisor be a **member of the team** they supervise? | No (they may oversee several teams from outside) |
| Q-M3 | May a supervisor come from **another department** than the team's? | No: same department or a sub-department of it (shown as a gap otherwise, not refused, so existing data still loads) |
| Q-M4 | When a sub-department has its own manager, does the **parent's manager** still see it? | Yes, they see it; the nearest manager is first in the chain |
| Q-M5 | Should a **change of manager** be allowed from a past date? | Only today or later until payroll periods exist (as B7); then inside an open period with a reason |
| Q-M6 | Is **HR** the last level after the manager (approves anything), or a parallel path? | Last level, and can always act directly |

---

## 2. Data model

| Table / column | Change |
|---|---|
| `department_manager` (new) | `id`, `department_id` (FK, restrict), `staff_id` (FK, restrict), `valid_from` (date), `valid_to` (date, exclusive, null = open), `reason`, `created_by`, timestamps. `EXCLUDE` per department on `daterange(valid_from, valid_to)` (btree_gist, as `staff_schedule`); check `valid_to > valid_from` |
| `department.manager_staff_id` | Converted into `department_manager` rows (open, from the department's `created_at` date), then **dropped** in a later migration of the same phase once every reader uses the new table |
| `team_supervisor` | Unchanged (dated with `added_at` / `removed_at` instants; the engine reads them at 00:00 Damascus of D, like `teamOnDate`) |

## 3. Tasks

### Phase 0 · Agree the plan
- [ ] 0.1 The user approves M1–M12 or changes them, and answers Q-M1–Q-M6 (or keeps the
      defaults). Update this plan and `docs/decisions.html` (status `proposed` → `approved`).

### Phase 1 · Schema and migration
- [ ] 1.1 `department_manager` in `src/lib/server/db/schema/workforce.ts`, relations, types.
- [ ] 1.2 `pnpm db:generate` → read the SQL → custom migration: EXCLUDE, data conversion from
      `manager_staff_id` with a count check that aborts on mismatch. Count departments with a
      manager in all three DBs first.
      **Done when** the converted counts equal the old ones per DB; migrations ran on `_test` and
      `_e2e`, and on `attendance_app` after the count and **the user's OK**
- [ ] 1.3 Readers moved to the new table (`departments.bl/crud`, `/departments`), then a migration
      drops `department.manager_staff_id`. `pnpm check`, `pnpm test` green.

### Phase 2 · Engine (`src/lib/workforce/management.ts`, pure, Vitest)
- [ ] 2.1 Types: `OrgDepartment` (id, parentId, active), `ManagerVersion`, `SupervisorVersion`,
      `Membership`, `OrgPerson` (staffId, departmentId, active).
- [ ] 2.2 `managerOn(departmentChain, managers, date)` → nearest manager (M2).
- [ ] 2.3 `chainOf(person, date, org)` → `[{ level: 'supervisor' | 'manager' | 'hr', staffId? }]`
      (M5), never containing the person.
- [ ] 2.4 `scopeOf(staffId, date, org)` → `{ asManager: departmentIds, asSupervisor: teamIds,
      people: staffIds }` (M6).
- [ ] 2.5 `gaps(org, date)` → the four gap kinds of M8, with record IDs only.
- [ ] 2.6 Tests with a made-up organisation (two departments, one sub-department with and one
      without its own manager, three teams):
      - nearest manager, and the parent's manager when the sub-department has none;
      - a member's chain: supervisor → manager → HR; a team with two supervisors lists both;
      - a supervisor's own chain skips them; a manager's own chain goes to the parent's manager,
        then HR; nobody is in their own chain;
      - a person who changes team on day 10: chain before and after;
      - a manager change from day 15 (M3): days 1–14 the old manager, 15+ the new one;
      - scopes: supervisor = their team members that day; manager = department + sub-departments;
      - gaps: department without any manager up the tree, team without supervisor, inactive
        supervisor, supervisor from another department branch.
      **Done when** `pnpm test` is green with these cases

### Phase 3 · Services and schemas
- [ ] 3.1 `src/lib/schemas/management.schema.ts`: change manager from a date (department, staff or
      none, `validFrom`, reason). Exported schema type.
- [ ] 3.2 `services/management/management.{crud,bl}.ts`: `getManagementTree(date)`,
      `setDepartmentManager` (close the open row at the date, open the next; dates per Q-M5;
      audit), `chainFor(staffId, date)`, `scopeFor(staffId, date)`, `listGaps(date)`. Supervisors
      keep their existing team service. `staff.write`; `batch([...writes, auditInsert])`.

### Phase 4 · UI
- [ ] 4.1 `/management` (sidebar entry, phosphor icon, `localizedHref`): the tree with managers
      and supervisors, member counts, gap badges and a "Gaps" card; "Change manager from a date"
      sheet; links to the team page for supervisors. `Empty` state when nothing is set.
- [ ] 4.2 `/departments`: the manager column reads the new table; editing the manager opens the
      same dated sheet.
- [ ] 4.3 Employee profile Overview: "Reports to" line (M10), linking to the people.
- [ ] 4.4 "View as" (M9): a GET `Select` (managers and supervisors) on `/employees`, `/teams` and
      `/attendance/entry`; `?as=` limits the lists to `scopeFor`; a banner with "Stop viewing as".
- [ ] 4.5 en + ar strings (`management_*`), RTL in `/ar`; `svelte-autofixer`, `pnpm check`,
      eslint + prettier on touched files, `pnpm test`.

### Phase 5 · Verify
- [ ] 5.1 Manual check **by the user** on `attendance_app_e2e` with made-up people: set a manager
      on a department and on one sub-department; add supervisors to two teams; the tree and the
      gaps match; "view as" each of them shows only their people; a member's profile shows the
      right chain; a manager change from a later date shows both in the history; `audit_log` has a
      row per change. **Done when** the user reports every line holds
- [ ] 5.2 Playwright (written, the user runs it): set a manager, view as them, see only their
      department's people.
- [ ] 5.3 Tick, README row, decisions statuses, commit.

### Later · With sign-in (S8), not part of this plan
- Accounts linked to staff (`staff.user_id`), roles `department_manager` and `supervisor` with
  permission keys, every BL limited to `scopeFor(actor)` server-side, the sidebar showing only
  what the role may use; approvals in `/changes` (S3.5) routed by `chainOf`.

---

## Risks

- **Replacing `manager_staff_id`** touches the departments list and form: convert, check counts,
  move the readers, then drop (three steps, `pnpm test` green between them).
- **Dates:** supervisors are dated by instant, managers and memberships by day. The engine reads
  all of them at 00:00 Damascus of D (as `teamOnDate`), tested across a change.
- **"View as" is not security.** It is a filter for HR; real limits come with S8 and are checked
  in every BL, never in the UI alone.
- **Scope creep:** approvals (S3.5) and sign-in (S8) stay out unless the user asks.

## Verification (each phase)

`pnpm check`, eslint + prettier on touched files, `pnpm test`, `svelte-autofixer` clean, `git
status` without data files, no real names in fixtures, tests, plans or commits. Agents don't
start a dev server, open a browser, run Playwright or install packages (CLAUDE.md §1).
