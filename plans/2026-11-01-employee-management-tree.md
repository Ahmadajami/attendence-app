# Management tree for each employee: who manages whom

**Status:** in progress (approved 2026-11-01: M14–M22 as written, Q-T1–Q-T6 defaults kept)
**Date:** 2026-11-01
**Goal:** Every employee's profile gets a **Management** tab: the line **up** (their supervisor(s)
→ department manager → managers higher up the department tree → HR) and, for anyone who
supervises or manages, the people **below** them as a tree they can open level by level, on any
date. Assigning a manager to a department stays **optional** and stays on `/departments`. Once
any employee is deactivated, `/employees` shows a **status filter** (Active · Inactive · All).

**Lane:** A. Builds on the approved
[two-level management plan](2026-11-01-two-level-management.md): manager history (M3, Phase 1,
written), chain (M5), scope (M6) and the pure engine (Phase 2). Do that plan's Phases 1–2 first.
This plan **replaces its task 4.3** (the "Reports to" line becomes M20 below, plus the tab). Read
`CLAUDE.md` §1 (no personal data in tests, plans, commits), §3 (UI, Forms) and §8 (hand-off)
first. One commit per phase, plan file included.

---

## 0. Where a department's manager is set (the user's question, 2026-11-01)

- **Today:** `/departments` → a department's actions menu → **Edit** → **Manager** →
  pick an active employee or **"No manager"** → Save. It is **optional**: nothing requires it.
  > note (2026-11-01, two-level plan 4.2, M25): now `/departments` → actions menu → **Change
  > manager** (or the same button on `/management`): person or "No manager", start date, reason.
  > The department form no longer has a Manager field.
- Since Phase 1 of the two-level plan (`bd9cecd`), a new manager takes over **from today** and
  the old one stays in the history (M3, M13). Migrations `0012`–`0014` must be applied first, or
  `/departments` fails.
- **Later (two-level plan 4.1 / 4.2):** `/management` and `/departments` get a "Change manager
  from a date" sheet with a reason.
- A department **without** its own manager is covered by the **nearest manager up the tree**
  (M2). It is only flagged (a "gap", never an error) when **no** department above it has one.

## 1. Decisions (defaults; stop and ask before departing from one)

| # | Decision | Why |
|---|---|---|
| M14 | **A department's manager stays optional** (the user, 2026-11-01). The form keeps "No manager"; nothing refuses a save without one. A department without its own manager shows "Covered by *name* (*parent department*)" in muted text on `/departments` and in the tree; with nobody up the tree it is a gap (M8) | The user's answer; matches M2 and Q-M1 |
| M15 | **A "Management" tab on the employee profile** (`?tab=management`, after Overview; phosphor `TreeStructureIcon`), read-only. It holds a **date** field (GET `?on=yyyy-mm-dd`, default today; a filter form, not Superforms), a **"Reports to"** card and, when the person supervises or manages on that date, a **"Manages"** card | One place per person, where HR already looks (V2 tabs); the date shows the history M3 keeps |
| M16 | **Line up** = `ladderOf(person, date, org)`: the supervisors of their team that day → the nearest manager of the team's department (or of their own department when they have no team) → every manager **further up** the department tree, each once → HR. Never the person themself (M5). The first steps are exactly M5's chain (who approves); the higher managers are marked **"above"** (they see, Q-M4, but don't approve first) | A full ladder answers "who is their manager" at every level, without changing who approves |
| M17 | **Tree down** = `reportsOf(staffId, date, org)`, one level per node. **As a manager** of department D: the managers of D's sub-departments that have their own manager (each a node), the supervisors of the teams in D and in its sub-departments without their own manager (each a node), and the people there with no team or in a team without a supervisor (leaves). **As a supervisor:** their team's members that day (leaves). Someone appears once under the same parent; each node shows a count ("12 people") | Follows the same rules as scopes (M6), so the tree and "view as" (M9) always agree |
| M18 | **Built from one server load:** the service computes the person's whole scope for that date once and sends the tree; opening a node needs no new request. First level open, deeper levels closed. Inactive people are left out (Q-T4) | Hundreds of staff, not thousands: one load is simpler and fast |
| M19 | **Read-only, with links:** each person links to their profile (and their Management tab); a department links to `/departments`, a team to `/teams/[id]`. Gaps in the person's line (no manager up the tree, team without supervisor, inactive manager or supervisor) show as a `warning` notice with the link to fix it | Managers are set where they are today; the tree only shows |
| M20 | **Overview tab line** "Reports to: *supervisor* · *manager*" (first supervisor, "+1" when there are two), linking to the Management tab. Replaces task 4.3 of the two-level plan (M10) | The answer at a glance; details one click away |
| M21 | **UI:** a recursive `#lib/app/management/ReportTree.svelte` inside `Card`, each manager / supervisor with a disclosure `Button` (`aria-expanded`, `aria-controls`; changed 2026-11-01 from shadcn `Collapsible`, so nothing has to be added first — switch to `Collapsible` later if wanted); indentation with logical `ps-*`; caret icons `rtl:rotate-180`; initials `Avatar` as on the employee cards; strings `management_tree_*` in en + ar | The template's UI rules; reads right to left in `/ar` |
| M22 | **Status filter on `/employees`** (the user, 2026-11-01). As soon as **at least one employee is inactive**, the toolbar of both tabs (cards and "Move between teams") shows a `Select` beside the search: **Active (n) · Inactive (n) · All (n)**, default **Active** (Q-T6). It is a GET filter (`?status=active\|inactive\|all`, `name` on `Select.Root`, submits on change), so it stays in the URL with `?view=`; the page filters the list it already loads, counts come from the whole list, an unknown value falls back to the default. With no inactive employee the filter is hidden. Deactivating someone from the actions menu toasts "… was deactivated: shown under Inactive". The team cards of "Move between teams" keep listing active members only (unchanged). An inactive manager or supervisor still in place stays a gap in the tree (M19, Q-T4) | Deactivated people no longer clutter the daily list but are one click away; nothing to filter while everyone is active |

Questions for the user (answered 2026-11-01: **every default kept**):

| # | Question | Default |
|---|---|---|
| Q-T1 | Should the line up show the managers **above** the nearest one (up to the top department)? | Yes, marked "above" (M16) |
| Q-T2 | When a team has **two supervisors**, show both in the line up? | Yes, side by side |
| Q-T3 | Also a page with the **whole organisation** as one tree (top manager down)? | No: `/management` (M8) shows departments; the person tree starts from any employee |
| Q-T4 | Show **inactive** people in the tree? | No; an inactive manager or supervisor still in place shows as a gap |
| Q-T5 | May the date field show **past** dates? | Yes, to read the history; changes stay today or later (Q-M5) |
| Q-T6 | On `/employees`, which status does the filter show **by default**? (M22, added 2026-11-01) | Active |

---

## 2. Tasks

### Phase 0 · Agree the plan
- [x] 0.1 The user approves M14–M22 or changes them, and answers Q-T1–Q-T6 (or keeps the
      defaults). Update this plan, the two-level plan (task 4.3 pointer) and `docs/decisions.html`
      (`proposed` → `approved`).
  > note: approved 2026-11-01 unchanged, every Q-T default kept. M15–M22 `approved` in
  > `docs/decisions.html`; M10 `replaced` by M15 + M20; two-level task 4.3 points here.

### Phase 1 · Engine (in `src/lib/workforce/management.ts`, pure, Vitest)
Needs the two-level plan's Phase 2 (types, `managerOn`, `chainOf`, `scopeOf`).
- [x] 1.1 `ladderOf(person, date, org)` → `[{ level: 'supervisor' | 'manager' | 'hr', staffId?,
      teamId?, departmentId?, approves: boolean }]` (M16).
  > note: in `management.ts`: `chainOf` steps with `approves: true`, then every active manager
  > further up (each once) with `approves: false`, then HR.
- [x] 1.2 `reportsOf(staffId, date, org)` → `ReportNode[]` (`kind: 'manager' | 'supervisor' |
      'person'`, ids, `count`, `children`) (M17).
  > note: manager nodes carry `departmentIds`, supervisor nodes `teamIds`; one node per person
  > under a parent (a supervisor who also manages a sub-department is merged into that node); the
  > tree's owner never appears in it; `subtreePeople` lists everyone in a tree.
- [x] 1.3 Tests with a made-up organisation (a top department with a manager, a sub-department
      with its own manager, one without, three teams, one with two supervisors):
      - a member's ladder: supervisor → nearest manager → manager above (`approves: false`) → HR;
      - two supervisors both listed; a person without a team goes straight to their department's
        manager;
      - a manager's ladder starts at the parent's manager; nobody is ever in their own ladder;
      - a sub-department without a manager: its people climb to the parent's manager;
      - a team change on day 10 and a manager change on day 15 (M3): ladder before and after;
      - `reportsOf` a top manager: the sub-department manager is a node (its people under it,
        not repeated directly), supervisors are nodes with their members, people without a
        supervised team are leaves; counts add up; nobody appears twice under one parent;
      - `reportsOf` a supervisor: their members that day; someone who left on day 10 is gone on
        day 11.
      **Done when** `pnpm test` is green with these cases (on the user's laptop)
  > note: 15 new cases in `management.test.ts` (40 in the file), covering every line above plus:
  > the approving steps equal `chainOf`; the tree holds **exactly** `scopeOf(...).people` for
  > every person on days 1, 9, 10, 15 in three variants (base, inactive top manager, top manager
  > inside a sub-department team). All 40 passed in the cloud session under plain Node with
  > stand-ins for `expect` and `startOfDamascusDay`; tick when `pnpm test` is green.
  > note: confirmed by the user 2026-11-01 (checks and manual tests pass).

### Phase 2 · Service
- [x] 2.1 `management.bl.ts` `managementTreeFor(actor, staffId, date)` → `{ ladder, reports,
      gaps }` with names, initials, team and department names; `staff.write` (M12). Reads only,
      no audit. Uses the two-level plan's `management.crud.ts` loaders.
  > note: `managementTreeFor(actor, staffId, date)` → `{ date, ladder, ladderToday, reports,
  > reportCount, gaps, teamId, departmentId }`: names on every step and node (units = the
  > sub-departments / teams they lead, a leaf's team), sorted managers → supervisors → people,
  > then by name; gaps = those about the person's team or a department in their chain.
- [x] 2.2 `listDepartments` adds `coveredBy` (the nearest manager above when a department has
      none, M14).
  > note: `coveredBy` = the nearest **active** manager above when the department has no own active
  > manager (with that manager's department id).

### Phase 3 · UI
- [x] 3.1 Profile tab "Management" (`?tab=management`, M15): date filter form, "Reports to" card
      (ladder, "above" badge, HR at the end), "Manages" card with `ReportTree` (M17, M18), gap
      notices (M19). The load reads `?on=` only for this tab's data (V3: switching tabs doesn't
      refetch other data).
  > note: built 2026-11-01: `#lib/app/management/ManagementTab.svelte` (tab after Overview,
  > `TreeStructureIcon`): date filter (`?on=` + `tab=management`, "Today" link), "Gaps in this
  > line" card (team → "Open team", department → `/management`), "Reports to" (avatars, role,
  > "Above" badge, HR last), "Manages" (only when they lead someone). The load reads `?on=`
  > (`managementTreeFor`). Waiting for checks and the user's manual check.
  > note: confirmed by the user 2026-11-01 (checks and manual tests pass).
- [x] 3.2 `#lib/app/management/ReportTree.svelte` (recursive, `Collapsible`, M21). The user
      first runs `pnpm dlx shadcn-svelte@latest add collapsible`.
  > note: built 2026-11-01 without `Collapsible` (M21 changed): a disclosure button per manager /
  > supervisor (caret flips in RTL), initials avatar, role badge with their departments / teams,
  > people count; a person's link opens their Management tab on the same date; deeper levels
  > render once opened. No command needed.
  > note: confirmed by the user 2026-11-01 (checks and manual tests pass).
- [x] 3.3 Overview line "Reports to" (M20).
  > note: built: today's first supervisor ("(+1)" for more) · nearest manager, or "HR only"; the
  > label opens the Management tab.
  > note: confirmed by the user 2026-11-01 (checks and manual tests pass).
- [x] 3.4 `/departments`: "Covered by …" in muted text under an empty manager (M14).
  > note: built: the Manager column shows "No own manager · covered by *name* (*department*)".
  > note: confirmed by the user 2026-11-01 (checks and manual tests pass).
- [x] 3.5 en + ar strings (`management_tree_*`, `employees_status_*`); `svelte-autofixer` (on the
      user's laptop), eslint + prettier on touched files.
  > note: confirmed by the user 2026-11-01 (checks and manual tests pass).
- [x] 3.6 `/employees` status filter (M22): `EMPLOYEE_STATUSES` + `employeeStatus(value)` and
      `filterByStatus(employees, status)` in `employees/labels.ts` (pure, with Vitest cases:
      default, unknown value, counts); a shared `StatusFilter.svelte` in the toolbar of
      `EmployeeCards` and `EmployeesTable`, shown only when an inactive employee exists; the
      deactivate toast names the Inactive filter. No load or action change. This task does not
      need Phases 1–2 and can be built first.
  > note: built 2026-11-01 in a cloud session (no `node_modules`): `EMPLOYEE_STATUSES`,
  > `employeeStatus`, `filterByStatus`, `statusCounts` in `employees/labels.ts` with 4 Vitest
  > cases in `labels.test.ts`; `StatusFilter.svelte` (GET form keeping `?view=`, submits on
  > change, no reload of the page data) rendered through a `filter` snippet in `EmployeeCards` and
  > `EmployeesTable`; `+page.svelte` filters and counts; the `/employees` deactivate action toasts
  > `employees_deactivated` (the profile's toast is unchanged); 5 en + ar keys. Not ticked until
  > `pnpm check`, `pnpm test`, eslint and the Svelte autofixer pass on the user's laptop (prettier
  > ran on the `.ts` / `.json` files; the `.svelte` files were formatted by hand).
  > note: the user reported the status filter tested (2026-11-01); the filter lines of 4.1 hold.

### Phase 4 · Verify
- [x] 4.1 Manual check **by the user** on `attendance_app_e2e` with made-up people: a member's tab
      shows supervisor → manager → manager above → HR; a sub-department without a manager climbs
      to the parent's; a top manager's "Manages" tree opens level by level with the right counts;
      a supervisor sees their members; a past date shows the old manager after a change; the
      Overview line links to the tab; `/departments` shows "Covered by"; `/ar` reads right to
      left; on `/employees` with everyone active there is no status filter; deactivate one
      employee → the filter appears on Active, the person leaves the list and shows under
      Inactive, All shows everyone, the counts match, and the choice survives a reload and a
      switch to "Move between teams"; reactivating them brings them back to Active.
      **Done when** the user reports every line holds
  > note: confirmed by the user 2026-11-01 (checks and manual tests pass).
- [ ] 4.2 Playwright (written, the user runs it): open a member's Management tab, see their
      manager; open the manager's tab, expand to find the member.
- [ ] 4.3 Tick, README row, decisions statuses, commit.

---

## Risks

- **Two plans, one engine:** `ladderOf` / `reportsOf` must reuse `managerOn` and `scopeOf`, not
  copy them, or the tree and "view as" drift apart.
- **Mixed date kinds:** supervisors are dated by instant, managers and memberships by day; read
  all of them at 00:00 Damascus of the chosen date (as the two-level plan says), tested across a
  change.
- **Large departments:** the first level of a top manager can be long; the tree opens one level
  and shows counts, and each level is sorted by name.

## Verification (each phase)

`pnpm check`, eslint + prettier on touched files, `pnpm test`, `svelte-autofixer` clean (on the
user's laptop, CLAUDE.md §8), `git status` without data files, no real names in fixtures, tests,
plans or commits.
