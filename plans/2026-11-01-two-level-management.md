# Two-level management: department managers above team supervisors

**Status:** in progress (approved 2026-11-01: M1–M12 as written, Q-M1–Q-M6 defaults kept)
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
| M9 | ~~dropped by the user (2026-11-01): not built; the employee Management tab (tree plan) is used instead~~ **"View as"** (HR only): a GET filter `?as=<staffId>` on `/employees`, `/teams` and `/attendance/entry` that limits the list to that manager's or supervisor's scope, with a banner "Viewing as X (department manager)". **Read-only preview: it changes no permission** | HR can check exactly what each manager will see once sign-in returns |
| M10 | **The employee profile** shows "Reports to: supervisor(s) · manager" (Overview tab) | The chain is visible where HR looks for a person |
| M11 | **Out of scope here:** manager/supervisor **accounts and sign-in** (S8: roles with permission keys, every BL checks the actor's scope server-side), and the **approval workflow** itself (S3.5 `/changes` will use M5). This plan only provides the chain and the scopes they will use | No login yet (D17); approvals need `/changes` first |
| M12 | **Permissions now:** viewing `/management` needs `staff.write`; changing managers and supervisors needs `staff.write` (as departments and teams today). No new keys until S8 | Single local user; keys come with the roles in S8 |
| M13 | ~~replaced by M25 (2026-11-01, Phase 4)~~ **Until the dated sheet (4.2), the department form changes the manager from today** (default, 2026-11-01, task 1.3): the row in force ends today and stays in the history, a row that started today is replaced; the form has no reason field, so the row stores the fixed reason "Set on the departments page" | HR keeps editing managers where they do today, and the history starts at once; the reason field comes with the 4.2 sheet so the form isn't built twice |
| M23 | **When the engine reads the organisation** (default, 2026-11-01, Phase 2): an `OrgMoment` = the **date** for day-dated manager rows and an **instant** for memberships and supervisors (dated by instant). `momentOf(date)` uses 00:00 Damascus of the date, like `teamOnDate`; the management service reads **today** at the current instant (Phase 3), so a supervisor added at 10:00 counts at once | One rule for every date, as the risks section asks, without hiding today's changes until tomorrow |
| M24 | **Inactive leaders are skipped in the chain** (default, 2026-11-01, Phase 2): an inactive supervisor is left out, an inactive manager is passed over to the next manager up (or HR). `gaps` still reports both. Scopes list active people only | An inactive person can't approve; the chain must still reach someone who can |
| M25 | **The manager changes only through the dated sheet** (default, 2026-11-01, task 4.2; replaces M13): the department form keeps name and parent; "Change manager" (in the `/departments` actions menu and on `/management`) asks for the person or "No manager", the start date (today or later) and a reason, and shows the department's history. A new department gets its manager the same way, after it is created | One way to change a manager, always with a date and a reason; the fixed reason of M13 goes away |

Questions for the user (answered 2026-11-01: **every default kept**):

| # | Question | Default |
|---|---|---|
| Q-M1 | Can a department have **more than one manager** (e.g. a deputy who acts when the manager is away)? | No: one manager; a deputy can come later as a second, lower row |
| Q-M2 | Must a supervisor be a **member of the team** they supervise? | No (they may oversee several teams from outside) |
| Q-M3 | May a supervisor come from **another department** than the team's? | No: same department or a sub-department of it (shown as a gap otherwise, not refused, so existing data still loads) |
| Q-M4 | When a sub-department has its own manager, does the **parent's manager** still see it? | Yes, they see it; the nearest manager is first in the chain |
| Q-M5 | Should a **change of manager** be allowed from a past date? | Only today or later until payroll periods exist (as B7); then inside an open period with a reason |
| Q-M6 | Is **HR** the last level after the manager (approves anything), or a parallel path? | Last level, and can always act directly |
| Q-M7 | Until the dated sheet (4.2), may the department form change the manager **from today** with a fixed reason? (added 2026-11-01, task 1.3; **obsolete** since M25) | Yes (M13) |
| Q-M8 | Should the engine read memberships and supervisors at **00:00 of the day**, and **today** at the current instant? (added 2026-11-01, Phase 2; today = now since Phase 3) | Yes (M23) |
| Q-M9 | Should an **inactive** supervisor or manager still in place be **skipped** in a person's chain? (added 2026-11-01, Phase 2) | Yes, falling through to the next one up (M24) |
| Q-M10 | Should **creating** a department also let HR pick its manager, or only "Change manager" afterwards? (added 2026-11-01, task 4.2) | Only afterwards (M25) |

---

## 2. Data model

| Table / column | Change |
|---|---|
| `department_manager` (new) | `id`, `department_id` (FK, restrict), `staff_id` (FK, restrict), `valid_from` (date), `valid_to` (date, exclusive, null = open), `reason`, `created_by`, timestamps. `EXCLUDE` per department on `daterange(valid_from, valid_to)` (btree_gist, as `staff_schedule`); check `valid_to > valid_from` |
| `department.manager_staff_id` | Converted into `department_manager` rows (open, from the department's `created_at` date), then **dropped** in a later migration of the same phase once every reader uses the new table |
| `team_supervisor` | Unchanged (dated with `added_at` / `removed_at` instants; the engine reads them at 00:00 Damascus of D, like `teamOnDate`) |

## 3. Tasks

### Phase 0 · Agree the plan
- [x] 0.1 The user approves M1–M12 or changes them, and answers Q-M1–Q-M6 (or keeps the
      defaults). Update this plan and `docs/decisions.html` (status `proposed` → `approved`).
  > note: approved 2026-11-01 unchanged; Q-M1–Q-M6 keep their defaults. M1–M12 are `approved`
  > in `docs/decisions.html`, the six Q-M rows say "answered: default kept".

### Phase 1 · Schema and migration
- [x] 1.1 `department_manager` in `src/lib/server/db/schema/workforce.ts`, relations, types.
  > note: columns as §2 (`valid_from` / `valid_to` dates, `reason` required, `created_by`), FKs
  > `restrict` (`created_by` set null), indexes on (department, from) and (staff, from), check
  > `department_manager_valid_order`. Relations `department.managers`, `staff.managedDepartments`.
- [ ] 1.2 `pnpm db:generate` → read the SQL → custom migration: EXCLUDE, data conversion from
      `manager_staff_id` with a count check that aborts on mismatch. Count departments with a
      manager in all three DBs first.
      **Done when** the converted counts equal the old ones per DB; migrations ran on `_test` and
      `_e2e`, and on `attendance_app` after the count and **the user's OK**
  > note: written in a cloud session without `node_modules`, so drizzle-kit could not run there:
  > `0012_department_manager` (table, FKs, indexes; written as drizzle-kit would) and
  > `0013_department_manager_constraints` (custom: `department_manager_no_overlap` EXCLUDE, one
  > open row per department with a manager from its creation day in Damascus, and a `DO` block
  > that aborts unless rows = departments with a manager = matching open rows), snapshots
  > `0012`–`0014` and the journal by hand. **Waiting for the user:** count first, in each DB:
  > `SELECT count(*) FROM department WHERE manager_staff_id IS NOT NULL;` then
  > `pnpm db:generate` must say "No schema changes", then `pnpm db:migrate` (`_test`, `_e2e`,
  > then `attendance_app` after the OK), then `SELECT count(*) FROM department_manager;` must equal
  > the first count.
  > note: the user reported the `/departments` manager check passed on `attendance_app_e2e`
  > (2026-11-01), so `0012`–`0014` are applied there. Still to confirm: `_test`, and
  > `attendance_app` (count + OK).
- [x] 1.3 Readers moved to the new table (`departments.bl/crud`, `/departments`), then a migration
      drops `department.manager_staff_id`. `pnpm check`, `pnpm test` green.
  > note: readers moved: `listDepartments` reads today's manager from `department_manager`
  > (`listManagersOn`); create / edit write manager rows **from today** through
  > `planVersionChange` (the row in force ends today, a row that started today is replaced),
  > audited as `department.manager.set` beside `department.update` (default M13, until the dated
  > sheet of 4.2). The manager is checked as an active employee only when it changes. EXCLUDE
  > clash → `ConflictError` `departments_error_manager_overlap` (en + ar). `/departments` and its
  > sheet are unchanged (the list item still carries `managerStaffId`, now today's).
  > `0014_drop_department_manager_staff_id` drops the column and its FK. Not ticked: `pnpm check`
  > and `pnpm test` run on the user's laptop (prettier was run on the touched `.ts` files).
  > note: Phase 4 (M25) removed the manager field from the department form again: the form keeps
  > name and parent; the manager changes only through the dated sheet.
  > note: confirmed by the user 2026-11-01 (checks and manual tests pass).

### Phase 2 · Engine (`src/lib/workforce/management.ts`, pure, Vitest)
- [x] 2.1 Types: `OrgDepartment` (id, parentId, active), `ManagerVersion`, `SupervisorVersion`,
      `Membership`, `OrgPerson` (staffId, departmentId, active).
  > note: also `OrgTeam` (id, departmentId, active: a team's department is needed for the chain),
  > `Org` (all six lists), `OrgMoment` + `momentOf` (M23), `ChainStep`, `Scope`, `Gap`; helpers
  > `teamAt`, `departmentOf` (the team's department, else the person's own).
- [x] 2.2 `managerOn(departmentChain, managers, date)` → nearest manager (M2).
  > note: optional 4th argument `skip(staffId)` (the person themself, M5; inactive managers, M24).
- [x] 2.3 `chainOf(person, date, org)` → `[{ level: 'supervisor' | 'manager' | 'hr', staffId? }]`
      (M5), never containing the person.
  > note: signature `chainOf(staffId, moment, org)`; steps also carry `teamId` / `departmentId`.
  > Anyone who supervises a team that day skips the supervisor level (M5 "a supervisor's chain
  > starts at their manager"); supervisors are sorted by id.
- [x] 2.4 `scopeOf(staffId, date, org)` → `{ asManager: departmentIds, asSupervisor: teamIds,
      people: staffIds }` (M6).
  > note: people = those working in the managed departments and every sub-department (Q-M4), the
  > supervisors of the teams there (also from outside), and the members of supervised teams;
  > active only, never the person, sorted.
- [x] 2.5 `gaps(org, date)` → the four gap kinds of M8, with record IDs only.
  > note: five `kind`s, because "inactive manager/supervisor" is split by role:
  > `department_without_manager`, `team_without_supervisor`, `inactive_manager`,
  > `inactive_supervisor`, `supervisor_outside_branch`; sorted; inactive departments and teams
  > are ignored.
- [x] 2.6 Tests with a made-up organisation (two departments, one sub-department with and one
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
  > note: `src/lib/workforce/management.test.ts`, 25 cases covering every line above (plus an
  > inactive manager skipped in the chain, an unknown person, a supervisor removed before the
  > day). Not run with Vitest here (no `node_modules`); all 25 passed in the cloud session under
  > plain Node with a stand-in for `expect` and for `startOfDamascusDay` (UTC+3), and a broken
  > expectation failed as it should. Tick when `pnpm test` is green on the user's laptop.
  > note: confirmed by the user 2026-11-01 (checks and manual tests pass).

### Phase 3 · Services and schemas
- [x] 3.1 `src/lib/schemas/management.schema.ts`: change manager from a date (department, staff or
      none, `validFrom`, reason). Exported schema type.
  > note: `departmentManagerFormSchema` (`staffId` '' = nobody), `DepartmentManagerFormSchema`,
  > `DepartmentManagerInput`, `DepartmentManagerMessage`; 3 Vitest cases in
  > `management.schema.test.ts` (not run here).
- [x] 3.2 `services/management/management.{crud,bl}.ts`: `getManagementTree(date)`,
      `setDepartmentManager` (close the open row at the date, open the next; dates per Q-M5;
      audit), `chainFor(staffId, date)`, `scopeFor(staffId, date)`, `listGaps(date)`. Supervisors
      keep their existing team service. `staff.write`; `batch([...writes, auditInsert])`.
  > note: `management.crud.ts` loads the whole organisation in one go (`loadOrgRows`: departments,
  > teams, people with names, manager rows, supervisor rows, memberships) and owns the manager-row
  > reads and writes (moved from `departments.crud.ts`). `management.bl.ts`: `getManagementTree`
  > (flattened departments with own manager, `coveredBy` = nearest active manager above when there
  > is no own active one, direct people count, teams with supervisors and member counts, teams
  > without a department, gaps with the person), `chainFor`, `scopeFor`, `listGaps`,
  > `listManagerHistory` (for the 4.2 sheet), `setDepartmentManager` (today or later, active
  > department and employee, refused when nothing changes: `management_error_unchanged`; EXCLUDE
  > clash → `departments_error_manager_overlap`; audited `department.manager.set` with the reason).
  > `managerChange` / `managerRowOn` / `managerConflict` are exported and reused by the department
  > form (M13), so there is one write path. Today is read at the current instant (M23). 2 en + ar
  > keys. Not type-checked here (no `node_modules`).

### Phase 4 · UI
- [x] 4.1 `/management` (sidebar entry, phosphor icon, `localizedHref`): the tree with managers
      and supervisors, member counts, gap badges and a "Gaps" card; "Change manager from a date"
      sheet; links to the team page for supervisors. `Empty` state when nothing is set.
  > note: built 2026-11-01 (cloud session, no `node_modules`): sidebar "Management"
  > (`TreeStructureIcon`, `staff.write`) after Departments; GET date filter `?on=` (default
  > today, "Today" link); "Gaps" card (five kinds with names, "Set a manager" or "Open team");
  > "Structure" card (active departments indented by depth: own manager with "since", or
  > "covered by …", or "No manager"; people count; "Change manager"; active teams with member
  > count and supervisors linking to their profiles, "No supervisor"); teams without a department;
  > `Empty` state linking to `/departments`. Shared `#lib/app/management/ManagerSheet.svelte`
  > (person or "No manager", date ≥ today, reason, the department's history with Current /
  > Scheduled) and `#lib/server/management-forms.ts`. BL additions `listManagerHistories`,
  > `listManagerOptions`. 40 en + ar keys. Waiting for `pnpm check`, eslint, prettier, the Svelte
  > autofixer and the user's manual check.
  > note: confirmed by the user 2026-11-01 (checks and manual tests pass).
- [x] 4.2 `/departments`: the manager column reads the new table; editing the manager opens the
      same dated sheet.
  > note: built 2026-11-01: the actions menu has "Change manager" (active departments) opening
  > `ManagerSheet` (`?/setManager`); the department form lost its manager field (M25) and moved
  > to `statusToasts` without the deprecated `invalidateAll()`. `departments.bl` no longer writes
  > managers. Waiting for the same checks.
  > note: confirmed by the user 2026-11-01 (checks and manual tests pass).
- [x] 4.3 Employee profile Overview: "Reports to" line (M10), linking to the people.
  > note: replaced (2026-11-01) by the [employee management tree plan](2026-11-01-employee-management-tree.md)
  > (M15–M20: a Management tab plus this Overview line), approved 2026-11-01; done there.
  > note: confirmed by the user 2026-11-01 (checks and manual tests pass).
- [ ] 4.4 "View as" (M9): a GET `Select` (managers and supervisors) on `/employees`, `/teams` and
      `/attendance/entry`; `?as=` limits the lists to `scopeFor`; a banner with "Stop viewing as".
  > note: **not built** — the user decided against it (2026-11-01). Each employee's profile has a
  > Management tab instead ([tree plan](2026-11-01-employee-management-tree.md)); `/management`
  > stays as built in 4.1. `scopeFor` stays for sign-in (S8).
- [x] 4.5 en + ar strings (`management_*`), RTL in `/ar`; `svelte-autofixer`, `pnpm check`,
      eslint + prettier on touched files, `pnpm test`.
  > note: confirmed by the user 2026-11-01 (checks and manual tests pass).

### Phase 5 · Verify
- [x] 5.1 Manual check **by the user** on `attendance_app_e2e` with made-up people: set a manager
      on a department and on one sub-department; add supervisors to two teams; the tree and the
      gaps match; each manager's and supervisor's Management tab shows only their people; a member's profile shows the
      right chain; a manager change from a later date shows both in the history; `audit_log` has a
      row per change. **Done when** the user reports every line holds
  > note: confirmed by the user 2026-11-01 (checks and manual tests pass).
- [ ] 5.2 Playwright (written, the user runs it): set a manager on `/management`, then their
      profile's Management tab lists their department's people (was: "view as", dropped with M9).
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
