# Attendance builder: pattern library, assignment to teams, member rules

**Status:** in progress (approved 2026-10-29)
**Date:** 2026-10-29
**Goal:** Turn today's per-owner pattern form into the builder of the brief
and the mockup: build a **named, reusable pattern** in three steps (name and
type → fill the days → assign), then **assign it to employees, teams or
departments** from a date. Every member of a team then follows it under clear
rules (own pattern wins, own off days, crew start in a cycle, membership
dates, manual days kept), with a preview of the effect before saving. This is
the detailed sub-plan of [the main plan](2026-10-28-attendance-app.md) S2.4
(F2–F5, F13) and part of S3.6 (F5). Tick the matching boxes there too.

**Lane:** A, branch `app/main`. One commit per phase (plan file included).
Read `CLAUDE.md` first: §3 "UI rules" and "Forms" apply to every `.svelte`
change. Resume point = the first unticked box.

**Explained with examples (EN/AR):** `docs/attendance-builder-plan.html`.
Keep it in step when this plan changes.

**Sources:** `docs/reference/BRIEF.md` §9.3–§9.6, §12.2, tests A1–A6 and N10;
the newer brief the user gave on 2026-10-29 (same text plus "Monthly grid
import / export" and test A6, kept outside the repo because its example
contains real first names: **never copy names from it**);
`docs/mockup/attendance-builder.html` "Pattern builder" and "Employee
schedules" views.

---

## 0. Starting point (checked 2026-10-29)

- **Patterns are not reusable today.** `shift_pattern` stores the slots
  **inside each owner's version** (one row = owner + type + `slots uuid[]` +
  anchor + `effective_from`/`effective_to`). Exactly one of
  `team_id` / `staff_id` / `department_id`. Two teams on the same cycle hold
  two copies; there is no name, no library, no "who follows this pattern".
- The engine (`src/lib/roster/roster.ts`) already resolves
  absence → override → personal → team → department (nearest first) → off,
  and `versions.ts` (`planVersionChange`) already closes the version in force
  and replaces later ones when a new one starts "from a date" (today or later
  only).
- The editing UI is `PatternForm.svelte` + `CycleEditor.svelte`, inline on
  `/teams/[id]` and `/employees/[id]`. There is no `/patterns` route and no
  `/departments/[id]` page.
- **Uncommitted work in the tree:** most of the
  [pattern editor drag-and-drop plan](2026-10-28-cycle-editor-dnd.md)
  (`slots.ts` + 13 tests, `SlotCell`, `PaletteChip`, `DropZone`, the S1/S2/S4
  sync fixes). It moved from `@dnd-kit-svelte/svelte` 0.1.6 to the official
  `@dnd-kit/svelte` 0.5.0, which departs from that plan's decision E3. Its
  boxes are not ticked. This builder reuses that editor, so it lands first
  (phase 0).
- Missing pieces the brief needs: `team` has **no department** (D22 says one
  department each); there is no "own off days" or "crew start" per person
  (old `day_off_1/2` and cycle anchors, BRIEF §9.4); no `period` table yet
  (S3.1), so "change from a past date inside an open period" can't be checked.
- Shifts in the DBs: D and N seeded (plus a made-up `E` in `attendance_app`,
  see the shifts sub-plan S2.2 note). The mockup's presets use codes M/E/O
  that don't exist here.
- Row counts of `shift_pattern` in each DB: **check before migrating** (they
  were 0 in `attendance_app` on 2026-10-28; `_e2e` has synthetic rows from the
  S2.1 manual check).

## 1. Decisions (defaults; stop and ask before departing from one)

| # | Decision | Why |
|---|---|---|
| B1 | **Split the pattern from its assignment.** New `pattern` (name en/ar, type, slots, default work shift, active) is the library item. New `pattern_assignment` (pattern, target, anchor, `effective_from`/`effective_to`, reason) says who follows it when. `shift_pattern` is migrated into both and dropped | Reusable patterns, saved cards with "N following", one place to change a team's schedule (BRIEF §9.3/§9.4, mockup F2/F4) |
| B2 | **"Apply to a team" means:** every member, on every date they are a member, follows the team's assignment, under these rules, applied in this order: (1) absence and day override win (as today); (2) a **personal assignment** wins over the team's; (3) the team's assignment wins over the department's; (4) the member's **own off days** (weekly patterns) and **crew start** (cycle patterns) adjust the day; (5) no team on a date → department chain → off | The user's "all team members can apply it with some rules"; BRIEF §9.4 resolution, steps 4–8 |
| B3 | A pattern **used by any assignment is read-only** in its days and type (name, Arabic name and active stay editable), like shift lock P1. Changing a used pattern = **"Edit from a date"**: the builder saves a copy and moves every current assignment of the old pattern to the copy from that date, in one batch | Past days never change silently; history reads "Day 1–14, Night from 15" (BRIEF §9.4 "Change from date") |
| B4 | The **cycle anchor lives on the assignment** (the date slot 1 falls on for that team), not on the pattern. Each person's **crew start** (0…length−1) shifts their slot inside it | One "4 on 4 off" pattern serves many teams with different start dates; staggered crews (BRIEF A6 "one crew start per employee") |
| B5 | **Own off days** (`staff_schedule.off_weekdays`, any set of Sun…Sat) apply to **weekly** patterns only: a listed weekday → off; a weekday the pattern has off but isn't listed → work with the pattern's `default_work_shift_id` (defaults to its most used shift). Crew start applies to **cycle** patterns only | BRIEF §9.4 "Employee off-day override", mockup "Employee schedules" |
| B6 | Department assignments always reach sub-departments; the nearest department wins (D10, as the engine does today). No `include_sub_departments` switch | Matches D10 and today's engine; one rule less for HR |
| B7 | **Dates:** an assignment starts today or later until the `period` table exists (S3.1). After S3.1, a past date is allowed only inside an **open** period, with a reason. Never inside a closed or locked period | Main plan §4 "backdating only inside an open period"; nothing to check it against yet |
| B8 | **Membership dates rule:** a member follows the team only on dates their membership covers (`teamOnDate`, unchanged). Joining mid-cycle keeps the team's anchor (+ their crew start); it does not restart the cycle | Crews stay aligned with the team |
| B9 | Assignments never touch punches, overrides or absences. A schedule change only changes what is **planned**; stored day results are marked for recompute once S4.2 exists | BRIEF R17, A3, A5 |
| B10 | **Rotations (BRIEF §9.5) are out of scope**: Q13 says rotation groups are unused (0 in the data). Crew start covers staggered crews | Smaller scope; revisit if HR asks |
| B11 | **Self-service requests by members** (swap, off-day change) are not part of this plan: there is no login yet (D17), so members can't request anything. They come with `/changes` (S3.5) and login (S8) | No way to identify a member today |
| B12 | **Presets** are shapes that use existing shift codes (D/N + Off; "weekly Sun–Thu" uses the brush shift). A preset whose codes don't exist is shown disabled with "create shift X first" | The mockup's M/E/O codes don't exist here |
| B13 | The **monthly Excel grid import/export** (newer brief, A6) is phase 6 and optional: only after phases 1–5 are approved, and only with a sample file in `~/secure/syravia/` | Large, needs real files; the builder is useful without it |
| B14 | Permissions: build and assign with `roster.manage`, view with `staff.write` (as `/shifts`). No new keys | Existing RBAC seed |

Questions answered by the user (2026-10-29):

| # | Question | Answer |
|---|---|---|
| Q-B1 | Does "team members can apply for it" mean the pattern **applies** to them (B2), or members **request** something (swaps, off-day changes) themselves? | **Applies** (B2). Member requests come with S3.5/S8 (B11) |
| Q-B2 | Editing a used pattern: copy + reassign from a date (B3), or edit it in place for everyone from a date (versions on the pattern itself)? | **Copy + reassign** (B3) |
| Q-B3 | Should team staffing per day (e.g. "2 D + 1 N every day") have a **minimum** that warns when a change breaks it? | **Counts only**, no minimum and no warning (B15) |

| # | Decision | Why |
|---|---|---|
| B15 | The team staffing strip shows counts per shift per day only; there is no minimum and no warning | User's answer to Q-B3; a minimum can be added later without rework |

---

## 2. Data model

```
pattern ──< pattern_assignment >── staff | team | department
                                   staff ──< staff_schedule (own off days, crew start; dated)
team ── department (new FK)
```

| Table | Columns |
|---|---|
| `pattern` | `id`, `name_en` (unique), `name_ar`, `type` (`weekly`/`cycle`), `slots uuid[]` (NULL = off; weekly 7, cycle 1–28, ≥ 1 work slot; slot-id trigger moved here), `default_work_shift_id` (FK `shift`, NULL → most used, set by the BL), `active`, `created_by`, timestamps |
| `pattern_assignment` | `id`, `pattern_id` (FK, restrict), exactly one of `staff_id` / `team_id` / `department_id`, `anchor_date` (required iff the pattern is a cycle: checked by the BL and a trigger), `effective_from`, `effective_to` (exclusive, NULL = open), `reason`, `created_by`, timestamps. **EXCLUDE** per target on `daterange(effective_from, effective_to)` (the three current ones move here) |
| `staff_schedule` | `id`, `staff_id`, `off_weekdays smallint[]` (0 = Sun … 6 = Sat, NULL = follow the pattern), `crew_start smallint` (NULL = 0), `effective_from`, `effective_to`, `reason`, `created_by`, timestamps. EXCLUDE per staff. (Main plan §7 `staff_schedule`; `ot_eligible` comes with S2.3) |
| `team` | + `department_id` (FK, nullable in the migration, required by the form from now on) |

## 3. Tasks

### Phase 0 · Land the drag-and-drop editor first
- [ ] 0.1 Finish [the DnD plan](2026-10-28-cycle-editor-dnd.md): add a
      `> note:` there recording the move to `@dnd-kit/svelte` 0.5.0 (E3
      departure, **approved by the user 2026-10-29**), then V1 (autofixer, check, eslint,
      prettier, test), V2 (checklist handed to the user, who tests in the
      browser), V3 (tick, README row, commit).
      **Done when** the DnD plan is `done` and committed on its own

### Phase 1 · Schema and migration
- [ ] 1.1 Schema: `pattern`, `pattern_assignment`, `staff_schedule`
      (`src/lib/server/db/schema/roster.ts`), `team.department_id`
      (`workforce.ts`), relations and types. Remove `shiftPattern`.
- [ ] 1.2 Migrations: `pnpm db:generate` (answer drizzle-kit's prompts as
      "create", never "rename") → read the SQL → a custom migration for:
      the slot-id trigger on `pattern.slots`, the cycle-anchor trigger on
      `pattern_assignment`, the three EXCLUDEs on `pattern_assignment` and
      one on `staff_schedule`, the shift delete guard updated to look at
      `pattern`, and **data conversion**: each `shift_pattern` row → one
      `pattern` (named `Pattern <first 8 chars of the old row id>`, never
      a person's or team's name; HR renames it later) + one `pattern_assignment` with the same
      dates, anchor and reason; then drop `shift_pattern`.
      Count rows first in all three DBs.
      **Done when** `\d pattern_assignment` shows the constraints, the
      converted counts equal the old `shift_pattern` counts per DB, and
      migrations ran on `_test` and `_e2e` (no need to ask) and on
      `attendance_app` after the row-count check **and the user's OK**

### Phase 2 · Engine (pure, Vitest; no DB or SvelteKit imports)
- [ ] 2.1 `src/lib/roster/roster.ts`: `RosterInput` takes assignments joined
      with their pattern (`personalAssignments`, `teamAssignments`,
      `departmentAssignments`) and the person's `schedules`
      (`staff_schedule` versions). `RosterDay` gets `assignmentId`,
      `patternId` and `adjustment: 'own_off' | 'own_work' | null`. `source`
      unchanged.
- [ ] 2.2 `cycle.ts` `patternSlot(pattern, anchor, date, crewStart)`: the
      cycle index is `slotIndex(...) + crewStart` modulo the length (correct
      for dates before the anchor). Weekly ignores `crewStart`.
- [ ] 2.3 Own off days (B5) after the pattern is chosen, before overrides:
      listed weekday → off; pattern off + weekday not listed → the
      `default_work_shift_id`. Weekly only.
- [ ] 2.4 `src/lib/roster/assignments.ts`: `planAssignmentChange` (the
      `versions.ts` logic, now per target, kept for previews), and
      `assignmentImpact(people, assignment, range)` → `{ applies, ownPattern,
      ownOffDays, notMembers, overrideDays, absenceDays, punchedDays }`
      (counts only) for the step-3 preview. `staffing(rosterDays)` → per date,
      count per shift (for the team strip, B15).
- [ ] 2.5 `src/lib/roster/presets.ts`: preset shapes (B12) →
      slots for the shifts that exist, or `{ missing: ['E'] }`.
- [ ] 2.6 Tests (made-up people and the fixture shifts in
      `test-shifts.ts`); port every current `roster.test.ts` case, plus:
      - A1: department pattern A, team B, personal C → C; end C → B; end
        B → A;
      - child department inherits its parent's assignment; nearer wins (B6);
      - A4: department Morning Sun–Thu (Fri + Sat off); one person's own off
        days Sat + Sun → Sun off, Mon–Fri work, Sat off; a colleague keeps
        Fri + Sat;
      - crew start: a `D D N N O O O O` team with crew starts 0/2/4/6 → every
        day exactly 1 D + 1 N + 2 off (staffing counts); same before the
        anchor;
      - N10: the `D D N N O O O O` cycle gives 36/48 h weeks with no fixed
        weekly target;
      - B8: a member joining mid-cycle on day 5 gets slot `(5 + crew start)`,
        not slot 0; leaving the team on day 10 → department pattern from
        day 10;
      - A5-light: "change from date 15" → days 1–14 unchanged, 15+ follow the
        new pattern; overrides and absences on days 15+ kept (A3);
      - impact counts for a team with one personal-pattern member and one
        with own off days.
      **Done when** `pnpm test` is green with every old case ported (none
      dropped without a `> note:`) plus these

### Phase 3 · Services and schemas
- [ ] 3.1 `src/lib/schemas/pattern.schema.ts`: pattern (names, type, slots,
      default work shift); assignment (pattern, target kind + ids[],
      `effectiveFrom`, `anchorDate` for cycles, reason); "edit from date"
      (B3); staff schedule (off weekdays, crew start, from, reason). Exported
      schema types beside each.
- [ ] 3.2 `services/patterns/patterns.{crud,bl}.ts`: list with usage
      (following count, targets), get, create, update (B3 lock:
      `ConflictError` when days/type change on a used pattern), copy,
      (de)activate (an inactive pattern can't be newly assigned; current
      assignments still resolve). Audit each write.
- [ ] 3.3 `services/assignments/assignments.{crud,bl}.ts`: `previewAssign`
      (dry run → `assignmentImpact` per target), `assign` (many targets in
      one `batch`: close / replace per target like `savePattern`, insert,
      one audit row per target), `endAssignment(target, from)`,
      `editFromDate(patternId, from, newSlots)` (B3, one batch). Dates per
      B7 (today or later; `InvalidInputError`). Refuse inactive teams,
      departments, staff and patterns.
- [ ] 3.4 `services/schedules/schedules.{crud,bl}.ts`: set / reset a person's
      own off days and crew start from a date (versioned like assignments,
      reason, audit).
- [ ] 3.5 `roster.bl.ts` `loadRosterData` reads assignments + schedules;
      previews, the entry sheet (`attendance.bl.ts`) and the team/employee
      pages keep working. Remove `setTeamPattern` / `setPersonalPattern` /
      `endPersonalPattern` once phase 4 replaces their UI.
- [ ] 3.6 `teams.bl.ts`: department on create/rename (required), shown in
      the list.

### Phase 4 · UI (mockup F2–F5, F13)
- [ ] 4.1 `/patterns` (sidebar entry, phosphor icon, `localizedHref`): saved
      pattern **cards** (name, Weekly / N-day cycle, avg h/week, N
      following, target chips 🏢/👥/👤, active), filter by department,
      "New pattern", per card Edit / Copy / Assign / Deactivate. Empty state
      via `#lib/app/state/`.
- [ ] 4.2 `/patterns/new` and `/patterns/[id]`: the **3-step builder** in one
      Superforms form (`dataType: 'json'`):
      1. names en/ar, Weekly/Cycle toggle, presets (B12);
      2. `CycleEditor` (tap-to-paint + drag and drop from phase 0), shift
         legend, "＋ New shift" opening the existing `ShiftFormSheet` (live
         "ends next day" hint, F3) and adding it to the palette, a 14-day
         preview strip, avg hours per week, default work shift (weekly);
      3. **assign (optional)**: target tabs Employees / Teams / Departments,
         multi-select filtered by department, from date, anchor date (cycle),
         reason, and the **impact preview** ("Applies to 12 of 14. 1 has an
         own pattern, which still wins. 2 keep their own off days.").
      A used pattern opens read-only with "Edit from a date" (B3).
- [ ] 4.3 `/teams/[id]` **Schedule card** (replaces `PatternForm` there):
      current pattern + history ("Day 2026-11-01 → 11-14, Night from 11-15"),
      "Change pattern from a date" sheet (pick from the library or build new
      → back here) with the impact preview; a **members table**: name, source
      (team / own pattern), crew start `Select` (cycle), own off-day chips
      (weekly), reset; a **staffing strip** (counts per shift per day, 28
      days, from `staffing`). Team create/edit gets the department `Select`.
- [ ] 4.4 `/employees/[id]` **Schedule card** (replaces `PatternForm`):
      "Follows team X: Night crew" / "Follows department Y" / "Own pattern
      Z", own off-day chips (weekly) or crew start (cycle), "Use an own
      pattern from…", "Reset to team/department". The day panel and preview
      keep working.
- [ ] 4.5 `/departments`: a "Default pattern" column + "Assign" (opens step 3
      prefilled with the department). The full `/departments/[id]` page stays
      in S2.3.
- [ ] 4.6 Remove `PatternForm.svelte` / `PatternHistory.svelte` (or reuse the
      history list in 4.3), dead messages; en + ar keys for everything new
      (`patterns_*`, `assign_*`, `schedule_*`), RTL checked in `/ar`.
- [ ] 4.7 `svelte-autofixer` on every touched `.svelte` until clean;
      `pnpm check`; eslint + prettier on touched files; `pnpm test`.

### Phase 5 · Verify
- [ ] 5.1 Manual check **by the user** (agents never test in a browser,
      CLAUDE.md §1). Hand over this list; the user runs it on
      `attendance_app_e2e` (port 5174, `--mode e2e`) with made-up people:
      - build `D D N N O O O O` from a preset, assign to a team of 4 from
        today with crew starts 0/2/4/6 → the staffing strip shows 1 D + 1 N
        every day;
      - give one member an own pattern → the impact preview counted them and
        their days follow it; reset → back to the team;
      - weekly Sun–Thu for a department; one person's own off days Sat + Sun
        → their week matches A4;
      - "Edit from a date" on the used pattern → old days unchanged, history
        shows two assignments, the copy is in the library;
      - entry sheet for that team lists the planned people with the right
        shift;
      - `audit_log` has a row per write.
      **Done when** the user reports every line holds
- [ ] 5.2 Playwright (written, the user runs it): build → assign to a team →
      member preview shows the codes after a reload.
- [ ] 5.3 Tick here and S2.4 in the main plan (S3.6 note: own off days and
      crew start done; day popup still open), README row, commit.

### Phase 6 · Monthly grid import / export (optional, after approval; B13)
- [ ] 6.1 Pure `src/lib/roster/grid.ts`: grid (rows × dates × codes) →
      shortest cycle ≤ 28 that reproduces every row with one crew start per
      row, else "day by day"; Vitest with a **made-up** grid
      (e.g. a 24-day `N×4 O×4 D×4 O×4 D×4 O×4` with 6 rows, 180 cells).
- [ ] 6.2 Export: team/department + month → xlsx in the same layout
      (ExcelJS, loaded with `import()`).
- [ ] 6.3 Import with preview (the `import_batch` machinery): map each row
      to an employee number once (remembered), map unknown letters to
      shifts, show "reproduces 180/180 cells", then create pattern +
      assignment + crew starts, or day overrides. Files read from
      `~/secure/syravia/`, never copied into the repo.
      **Done when** A6 holds on a made-up grid, and on the user's real file
      run by the user

---

## Risks

- **The migration replaces the table every roster read uses.** Keep
  `pnpm test` green after phase 2 before touching the UI; convert, don't
  wipe, rows in `_e2e`.
- **Crew start vs membership dates** (B8) is the easiest rule to get wrong:
  cover joins and leaves before and after the anchor in tests.
- **Own off days on a cycle** are refused, not silently ignored: the UI
  shows crew start instead (B5).
- ~~Phase 0 depends on the user's OK for the dnd-kit library change~~:
  approved 2026-10-29.
- **Scope creep:** rotations (B10), self-service requests (B11) and the
  grid import (B13) stay out unless the user asks.

## Verification (each phase)

`pnpm check`, eslint + prettier on touched files, `pnpm test`,
`svelte-autofixer` clean, `git status` without data files, no real names in
fixtures, tests, plans or commits. Agents don't start a dev server, open a
browser, run Playwright or install/remove packages: the user does, from the
checklist or command the agent gives (CLAUDE.md §1).
