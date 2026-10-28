# Shifts, then manual punch entry (S2.1 → S2.2 → S1.4)

**Status:** in progress
**Date:** 2026-10-28
**Goal:** Replace the template's fixed 12 h Day/Night/Off kinds with a real
`shift` table across schema, engine, services and UI (S2.1). Add the `/shifts`
screen with a live "ends next day" hint (S2.2). Then build manual punch entry
on top of real planned shifts (S1.4). This is the detailed sub-plan of
[the main plan](2026-10-28-attendance-app.md) §12. Tick the matching boxes
there too.

**Lane:** A, branch `app/main`. Commit after each of S2.1, S2.2 and S1.4
(plan file included). Resume point = the first unticked box below.

---

## 0. Starting point (checked 2026-10-28)

- `shift_kind` enum (`day | night | off`) is used by `shift_pattern.cycle`,
  `roster_override.kind` and `attendance_event.shift_kind`, plus 18 source
  files (schema, `src/lib/roster/*`, `src/lib/app/roster/*`, roster/teams
  services, `/teams` page).
- Shift times come from `app_setting` `roster.shift_starts` (day/night start)
  and are copied into each pattern version (`day_start`, `night_start`). Every
  shift is `SHIFT_MINUTES = 720` (`src/lib/roster/rules.ts`).
- Row counts in `shift_pattern`, `roster_override` and `attendance_event` are
  **0 in all three DBs** (`attendance_app`, `_test`, `_e2e`). The migration
  can therefore replace columns with no data conversion. Check again before
  migrating; if any count is above 0, stop and ask.
- There is **no attendance service yet**, only the `attendance_event` schema
  and the pure helpers in `src/lib/roster/attendance.ts`.
- `src/lib/payroll/` does not exist (Lane C has not started).
- Playwright is **not installed** (only Vitest).
- Permissions available: `roster.manage`, `attendance.record`, `staff.write`,
  `settings.manage`.

## 1. Decisions for this plan (defaults; the user can override)

| # | Decision | Why |
|---|---|---|
| P1 | **A shift's times, break and required minutes are locked once it is used** (by any pattern version, override or punch). After that, only name, colour, grace and active can change. To change the times, create a new shift. | Stored plans and punches never shift silently, and no versioning table is needed |
| P2 | Shifts are deactivated, never deleted. An inactive shift cannot go into new patterns or overrides, but existing ones still resolve | CLAUDE.md "never hard-delete" |
| P3 | Pattern slots stay an array: `slots uuid[]`, where `NULL` means off. Weekly = exactly 7 slots (Sun→Sat). Cycle = 1–28 slots plus an anchor. Slot ids are checked by the BL and by a constraint trigger (custom SQL), because Postgres cannot put an FK on array elements | Keeps the engine's array shape and the template's version logic |
| P4 | `app_setting` `roster.shift_starts`, `ShiftStartsForm` and the pattern columns `day_start`/`night_start` are **removed**. The migration seeds **D** 07:00→19:00 and **N** 19:00→07:00 | The times now live on the shift |
| P5 | Lane A writes `src/lib/payroll/schedule.ts` (the 1:1 port of `schedule_spec`) **now**, in S2.1. Lane C builds on it in S4.1 | Shifts need span, next-day and night maths today; one copy only |
| P6 | Night uses the default 22:00→06:00 window until `night_rule` exists (S2.3/S4) | BRIEF default |
| P7 | Shifts are managed with `roster.manage` and punches with `attendance.record`. No new permission keys | Existing RBAC seed |
| P8 | The timezone stays `AIRPORT_TIME_ZONE` in this plan. **New** pure functions take `timeZone` as a parameter that defaults to it, so the later timezone setting is a small change | CLAUDE.md timezone row, without widening scope |
| P9 | Department-owned patterns work in schema and engine now (nearest department up the tree wins). The UI to assign them comes in S2.3/S2.4 | Main plan S2.1 says "department as pattern owner" |

Stop and ask before departing from any of these.

---

## S2.1 · `shift` table; engine and services on shifts

### Schema and migration
- [x] **Shift table** `src/lib/server/db/schema/roster.ts` → `shift`:
      `id`, `code` (1–3 chars `[A-Z0-9]`, unique, CHECK `code <> 'OFF'`),
      `name_en`, `name_ar`, `colour` (`#RRGGBB` CHECK), `start_time`,
      `end_time` (`time`), `ends_next_day` (generated: `end_time <= start_time`),
      `break_minutes` (≥ 0, default 0), `required_minutes` (nullable override;
      `null` = span − break), `window_before_minutes` (default 180),
      `window_after_minutes` (default 360), `grace_minutes` (0 = not set, D12),
      `active`, `created_by`, timestamps. `span` and `night` are **computed in
      TS** (`schedule.ts`), not stored.
- [x] **shift_pattern**: replace `cycle shift_kind[]` + `day_start`/`night_start`
      with `type` (`weekly | cycle`, new enum `pattern_type`) and `slots uuid[]`
      (NULL = off). `anchor_date` is nullable and required only for `cycle`.
      Add owner `department_id`, and change the owner CHECK to
      `num_nonnulls(team_id, staff_id, department_id) = 1`. Shape CHECKs:
      weekly → cardinality 7; cycle → 1–28; at least one non-null slot.
- [x] **roster_override**: `kind` → `shift_id uuid NULL` (FK `shift`,
      NULL = off).
- [x] **attendance_event**: `shift_kind` → `shift_id uuid NOT NULL` (FK
      `shift`); drop the `attendance_event_worked_kind` CHECK.
- [x] Drop the `shift_kind` enum and remove `SHIFT_KINDS`/`ShiftKind` from
      `src/lib/schemas/enums.ts`. Add `PATTERN_TYPES`.
- [x] Migrations: `pnpm db:generate` → read the SQL → custom migration
      (`drizzle-kit generate --custom`) for: the slot-id constraint trigger
      (P3), a third `EXCLUDE` (per `department_id`, next to the two in
      `0001_constraints_seed.sql`), seed shifts D and N, and
      `DELETE FROM app_setting WHERE key = 'roster.shift_starts'`. Before
      running on `attendance_app`, re-check the counts from §0, then
      `pnpm db:migrate` on all three DBs.
      **Done when** `\d shift_pattern` shows the new columns and constraints,
      and `select code from shift` returns D and N in every DB
      > note: three migrations; two generate passes avoid drizzle-kit's
      > interactive rename prompts: `0003_drop_shift_kind`, `0004_shifts`,
      > `0005_shift_constraints_seed` (slot trigger plus a delete guard on
      > `shift`, department `EXCLUDE`, D/N seed, setting removed). Counts
      > re-checked first: 0/0/0 in all three DBs. `attendance_app_test` was
      > dropped and recreated first (user OK 2026-10-28; it still had the old
      > template schema), then migrated from `0000`. `shift` = D, N in all
      > three DBs; trigger and shape CHECKs tried in a rolled-back transaction.

### Pure engine (no DB, no SvelteKit)
- [x] `src/lib/payroll/schedule.ts` + `schedule.test.ts`: a 1:1 port of
      `docs/reference/schedule_spec/schedule.py` and its **11 tests**. Times
      are minutes of the day (convert `HH:mm` at the edges): `crossesMidnight`,
      `spanMinutes`, `requiredMinutes`, `overlapMinutes`, `isNight`,
      `sundayIndex`, `slotIndex`.
- [x] `src/lib/roster/shift.ts` (new): a `RosterShift` type (the engine's view
      of a shift row), `shiftWindow(date, shift, tz)` (start = wall clock on
      the shift date; end = start + span, so it lands on the next day when
      `ends_next_day`), `attributionWindow(...)` (start − before, end + after)
      and `requiredOf(shift)`. This replaces `shiftWindow`/`WorkKind`/`ShiftTimes`
      in `cycle.ts`.
- [x] `cycle.ts` → slot resolution through `slotIndex` (weekly + cycle).
      Keep `addDays`, `daysBetween`, `damascusDate`, `startOfDamascusDay`.
- [x] `roster.ts`: `RosterDay.kind` becomes `shiftId: string | null` plus
      `shift: RosterShift | null`, and `plannedShiftId` replaces `plannedKind`.
      `RosterInput` gets `shifts: ReadonlyMap<string, RosterShift>`,
      `departmentPatterns` and `departmentChain` (the person's department, then
      its ancestors). Precedence: absence → override → personal → team →
      department (nearest first) → off. `fallbackTimes` goes away. `extra`
      stays (a shift override on a planned off day that is not part of a swap).
      Source adds `'department'`.
- [x] `rules.ts`: remove `SHIFT_MINUTES`, `ATTRIBUTION_BEFORE/AFTER_MINUTES`
      (per-shift now). Keep the rest.
- [x] `overtime.ts`: `computeOvertime(worked, required, allOvertime)`, so
      required comes from the shift, not 720.
- [x] `attendance.ts`: `Attribution = { shiftDate, shiftId, scheduled }`.
      `attributeEvent(at, type, days, candidates, open?)` uses the rostered
      shifts of the days before, of and after the event. The unscheduled
      fallback uses the `candidates` passed in (active shifts). Windows come
      from each shift. `shiftSummary` uses the shift's required minutes and
      grace (grace 0 → `LATE_GRACE_MINUTES`).
- [x] `versions.ts`: unchanged logic, with the owner widened to department.
- [x] Tests: rewrite `roster.test.ts`, `cycle.test.ts`, `attendance.test.ts`,
      `overtime.test.ts` and `versions.test.ts` around D (07→19), N (19→07)
      and one **non-12 h shift** (e.g. 16:00→04:00, break 30). Keep every
      existing case's meaning, and add:
      - a weekly pattern (Sun→Sat) and a cycle pattern before and after the
        anchor;
      - department pattern used when no team/personal pattern; child
        department inherits parent's; nearer one wins;
      - a 16→04 shift's window ends 04:00 next day; a 03:30 check-out
        attributes to the previous shift date;
      - a 07:00 check-out after an N shift is attributed to the previous day;
      - overtime on a 480-min required shift.
      **Done when** `pnpm test` is green with all old roster cases ported (no
      case dropped without a `> note:` why) plus the new ones, and
      `src/lib/payroll/` has no DB/SvelteKit import
      > note: 107/107 (76 before). Every old case of `cycle`, `roster`,
      > `attendance`, `overtime` ported; the three `shiftWindow` cases moved to
      > the new `shift.test.ts`. Two attendance cases keep their meaning with
      > the per-shift windows (3 h before / 6 h after instead of 2 h / 7 h),
      > and one boundary check-in now lands on E (nearest active shift).
      > `versions.test.ts` unchanged (owner-agnostic logic). New: 11 spec
      > cases in `schedule.test.ts`, weekly and cycle around the anchor,
      > department precedence (4 cases), 16→04 window and 03:30 check-out,
      > 07:00 after N, grace per shift, required 690/480 overtime.
      > Fixture shifts in `src/lib/roster/test-shifts.ts` (made-up).

### Services, schemas and UI kept working
- [x] `src/lib/server/services/shifts/shifts.crud.ts` (list active/all, find,
      `isShiftUsed`) and a read-only `shifts.bl.ts` (`listShifts`). Writes
      come in S2.2.
- [x] `roster.crud.ts` / `roster.bl.ts`: read/write `type` + `slots`, load the
      shifts map into `RosterPreviewData`, load the department chain and
      department patterns, and validate every slot id against active shifts
      (`InvalidInputError`). Drop `loadShiftStarts` and the `shiftStarts`
      fields. `teams.bl.ts` follows.
      > note: department chain from the new pure `ancestorChain`
      > (`src/lib/workforce/departments.ts`, 2 more Vitest cases → 109).
- [x] `src/lib/schemas/roster.schema.ts`: `patternSchema` with `type`,
      `slots: (uuid | null)[]` (7 for weekly, 1–28 for cycle), and `anchorDate`
      required for cycle.
- [x] `src/lib/app/roster/`: `CycleEditor` palette = active shifts (code +
      colour) + Off; `labels.ts` `shiftKindLabel/Letter` → shift code/name
      helpers; `RosterPreview` cells show the shift code + colour and 🌙 when
      `isNight`; `PatternForm`/`PatternHistory`/`preview.ts` follow. The weekly
      toggle in the form is enough here; the full builder is S2.4.
      > note: new `ShiftChip.svelte`. The pattern form posts JSON (Superforms
      > `dataType: 'json'`) so `null` off-slots survive. Fixed a template
      > quirk found in the manual check: the untouched form previewed as a new
      > version from today and hid scheduled versions; the draft now applies
      > only once the form is edited (`isTainted`).
- [x] Remove `ShiftStartsForm.svelte`, `roster.shift_starts` from
      `settings.schema.ts`, `loadShiftStarts`/`setShiftStarts`, and their
      messages. The settings page shows a link to `/shifts` instead.
      > note: `settings.bl.ts` removed (it only held shift starts). The
      > settings page says shift times live on each shift; the link itself
      > comes with the `/shifts` route in S2.2 (typed hrefs).
- [x] en + ar messages for everything new or renamed; delete the unused
      `roster_kind_*` / `roster_letter_*` / `settings_shift_starts_*` keys.
      > note: 20 keys removed; `roster_kind_off`, `roster_letter_off`,
      > `roster_letter_absent` stay (still used for Off / Absent).
- [x] `svelte-autofixer` on every touched `.svelte`; `pnpm check`; eslint +
      prettier on touched files; `pnpm test`.
- [x] Manual check on `attendance_app_e2e` (synthetic): a team with a
      `D D N N O O O O` cycle and a person with a weekly pattern. The `/teams/[id]`
      and `/employees/[id]` previews show the codes, and a cycle edit closes
      the old version.
      **Done when** both previews match a hand count for 28 days, and
      `audit_log` has the version rows
      > note: dev server on 127.0.0.1:5174 against `_e2e`, driven through the
      > real form actions (script in the session scratchpad, not committed).
      > Team (2 made-up members) with `D D N N O O O O` anchored today, a third
      > made-up person with weekly `O D D D D D O`: both 28-day previews equal
      > the hand count. Edit from today+7 to `D N O` closed the old version
      > (`effective_to` = today+7) and the preview switches on that day.
      > Refused: weekly with 6 days (field error), unknown shift id (`Use
      > active shifts only.`). `audit_log`: 3 `shift_pattern.set` rows.
- [x] Tick S2.1 in the main plan with a note (tests count, migration names);
      commit.

## S2.2 · `/shifts` (F12) + editor with live hint (F3)

- [x] `src/lib/schemas/shift.schema.ts` (shared zod): code `^[A-Z0-9]{1,3}$`,
      not `OFF`; names en/ar required; times `HH:mm`; break 0–720; required
      (optional) 1–1440; windows 0–720; grace 0–120; colour from the palette.
      > note: the schema doesn't upper-case (so `ab` is refused); the code
      > input upper-cases while typing.
- [x] `shifts.bl.ts`: `createShift`, `updateShift` (P1: refuse a change to
      times/break/required when `isShiftUsed`, `ConflictError` with a clear
      message), `setShiftActive`. Duplicate code → `ConflictError` (catch the
      unique-violation code via `pgErrorCode`). Each write is
      `batch([write, auditInsert(...)])`, permission `roster.manage`.
      > note: the lock follows P1 as written: code, times, break, required
      > and windows are locked once used; names, colour and grace stay
      > editable (`ConflictError` on the first changed field). The page lists
      > shifts with `listShiftsWithUsage` (pattern count + used flag).
- [x] Route `src/routes/(dashboard)/shifts/`: table (code chip in its colour,
      name, start → end, "ends next day" badge, span, required, break, night
      🌙, grace, active, used-by count) + create/edit sheet (superforms).
      **Live hint** under the times, from `schedule.ts` on the client:
      "Ends next day · 12 h (720 min) · required 690 min · night". Times are
      locked with an explanation when the shift is used. Sidebar entry with a
      phosphor icon; `localizedHref()`; RTL-safe (logical utilities, `<bdi>`
      around times).
      > note: view with `staff.write`, writes with `roster.manage`. The hint is
      > `#lib/app/shifts/hint.ts` + `ShiftHintText.svelte` (reused by S2.4's
      > new-shift dialog). Settings page links to `/shifts`.
- [x] Colour palette: 8 swatches defined as tokens that read well in light and
      dark (no free hex input).
      > note: `SHIFT_COLOURS` in `src/lib/schemas/enums.ts` (mid-dark tones,
      > white text); D = amber, N = indigo as seeded.
- [x] Vitest: schema cases (OFF, `ab`, `ABCD`, valid `N2`), and the hint
      formatter (16:00→04:00 → next day, 720; 08:00→08:00 → 1440;
      00:00→08:00 → same day, 480).
      > note: `shift.schema.test.ts` (3 cases) + `hint.test.ts` (6 cases);
      > `pnpm test` 118/118.
- [ ] Manual check on `_e2e`: create `E` 16:00→04:00 → the hint says ends next
      day, 720. Creating `OFF` or a second `E` is refused with a field error.
      Editing D's times is refused once D is in a pattern. Deactivate `E` →
      it disappears from the cycle editor palette.
      **Done when** all four checks hold and each write has an `audit_log` row
      > note: NOT done. The check script's dev server (127.0.0.1:5174, DB set
      > by env override to `_e2e`) fell back to `.env` after a vite reload,
      > so its first write landed in the real-data DB `attendance_app`: one
      > made-up shift `E` (Evening 16:00→04:00) + its `shift.create` audit
      > row. The user chose to leave both rows, and no more runtime checks.
      > Seen before stopping: create `E` succeeded with an audit row; `OFF` →
      > 400 field error on `code`; second `E` → 409 field error on `code`.
      > Not checked at runtime: D's time lock and E leaving the palette. The
      > user tests the UI.
- [x] Tick S2.2 in the main plan; commit.

## S1.4 · Manual punch entry

### Data
- [x] Migration: add `attendance_event.source` (`manual | seed | import`,
      enum `punch_source`, NOT NULL default `manual`). `recorded_by` already
      exists. Add an index on `(staff_id, shift_date)`.
      > note: `0006_punch_source`; also `is_void` (CHECK: only on a
      > correction) so a void correction needs no time while `occurred_at`
      > stays NOT NULL; `effectiveEvents` drops voided events. Migrated on
      > `attendance_app` and `attendance_app_test` (roster tables 0/0/0).
      > `attendance_app_e2e` migrated afterwards (user OK 2026-10-28; from now
      > on the two synthetic DBs are migrated without asking, see CLAUDE.md §4).
- [x] Absence quick actions use the existing types (`no_show` = absent,
      `leave`, `sick`). Widening to the §7 list (mission, training, …) is left
      to S3/S4.
      > note: `absence.reason` is free text and may hold health details, so
      > keep it optional and never log it.

### Pure helpers (`src/lib/attendance/entry.ts` + tests)
- [x] `resolvePair(shiftDate, shift, inHHmm, outHHmm, tz)` → `{ checkIn, checkOut }`
      instants. Check-in = the wall-clock time on the shift date. If the shift
      ends the next day and the time is before `start − window_before`, it is
      the next day instead. Check-out = the first instant at that time after
      the check-in, so **a check-out earlier than the check-in means the next
      day**. A missing check-out stays missing (never invented).
- [x] `validatePair(pair, ctx)` → `{ errors[], warnings[] }`. Errors: span over
      16 h, overlap with the person's other effective pairs (any shift date),
      a time in the future. Warnings: check-in or check-out outside the shift's
      attribution window, and a punch on an unplanned day (a reason is
      required then).
- [x] `pairsOf(events)`: effective events → pairs. Reuse `effectiveEvents`;
      R16 (two segments → break) stays in the payroll engine.
- [x] Vitest: 19:00 → 07:00 on N = next-day check-out, 720 min; 07:00 → 19:00
      on D; 16:00 → 03:30 on the 16→04 shift; 19:00 → 19:30 = 30 min, not
      next day; a 17 h span refused; overlap refused; a future time refused;
      a check-in at 02:00 typed for N belongs to the next calendar day; a
      missing check-out kept open.
      > note: `src/lib/attendance/entry.test.ts` (20 cases incl.
      > `normalizeClock` shorthand `1900` → `19:00`, `punchDays`); `pnpm test`
      > 137/137. `clockOf`, `calendarDate`, `punchDays` helpers added.

### Service (`src/lib/server/services/attendance/`)
- [x] `attendance.schema.ts` (shared zod): an entry-sheet batch
      `{ shiftDate, rows: [{ staffId, shiftId, in?, out?, absence? }] }`, a
      single pair, and a correction `{ eventId, newTime | void, reason }`.
- [x] `attendance.crud.ts`: events for staff × date range, insert events
      (unexecuted queries), and people planned for a date + department/team.
- [x] `attendance.bl.ts` (`attendance.record`): `getEntrySheet(date, scope)`
      returns the people (their roster day via `rosterDay`, existing pairs,
      absences); `saveEntrySheet(batch)` validates every row server-side with
      the same helpers, refuses the whole batch on any error (row-indexed
      `InvalidInputError`), otherwise does one `batch([...events, ...absences,
      audit])` with `source = manual` and `team_id` = team on date;
      `correctEvent` writes a new event with `corrects_event_id` and a
      required reason (a void correction = a correction with no new time);
      `addPair` handles a single day from the employee page. The audit stores
      event ids and counts only.
      > note: the shared schema lives in `src/lib/schemas/attendance.schema.ts`.
      > A refused batch throws `EntrySheetError` (row index + field), and the
      > action maps it to Superforms field errors. `roster.bl`'s loader is now
      > the exported `loadRosterData`; `src/lib/roster/input.ts`
      > (`rosterInputOf`) is shared by previews and the service. An absence
      > reason is stored on `absence` only, never in the audit.

### UI
- [x] `/attendance/entry`: pick a date (default today) and a department or
      team. Rows are the people planned that day (shift chip, planned
      start → end); "+ add person" adds someone unplanned, with a shift and a
      reason. Check-in/out inputs are typed `HH:mm` with fast Tab order and
      Enter = next row. A "+1 day" marker appears next to an out-time that
      lands on the next day. Each row has absent / leave / sick toggles,
      inline warnings and errors, and one Save for the batch. Rows that
      already have punches show them read-only with "correct…".
      > note: GET filter (date + department/team) keeps the sheet in the URL;
      > `1900` / `7` shorthand normalised on blur. "Correct…" opens the
      > employee page's day panel for that date. Live checks in the browser
      > use the same `validatePair` as the service. Sidebar: "Punch entry".
      > note (user test, 2026-10-28): the sheet crashed on load
      > (`bind:ref={undefined}` on the check-in inputs); fixed with an
      > `{@attach}`. The UI of S2.1–S1.4 was then brought in line with the
      > template's UI + Forms rules, now copied into CLAUDE.md §3: Formsnap
      > fields everywhere, shadcn `Select` (no native `<select>`), the
      > correction and add-pair forms as Superforms components, theme tokens
      > `warning` and `shift-1`…`8` instead of raw colours, all strings `m.*()`.
- [x] `/employees/[id]`: a day panel (click a preview day) lists the effective
      events and the corrected ones (struck through, with the reason), with
      "add pair" and "correct". The preview cells show a punch dot + worked
      time.
      > note: `src/lib/app/attendance/DayPanel.svelte` (reused by S3.2). The
      > team preview shows the same dot + worked time (server sends only a
      > per-day summary).
- [x] Day popup: the roster grid comes in S3.2, so it reuses this day panel
      component then. Nothing to build now.
      > note: "shows on the roster" in the main plan's done-when = the
      > `/teams/[id]` and `/employees/[id]` previews until S3.2 exists.
      > note: nothing built, as planned.
- [x] en + ar strings, `svelte-autofixer`, eslint + prettier, `pnpm check`.

### Playwright (first e2e in this repo)
- [x] Add `@playwright/test`, `playwright.config.ts` (webServer = `pnpm dev`
      on 127.0.0.1 with `DATABASE_URL` → `attendance_app_test`, made-up people
      seeded by a `tests/e2e/seed.ts`), and a `pnpm test:e2e` script. Ask the
      user before installing the browser binaries if the download needs
      network access beyond npm.
      > note: `@playwright/test` 1.64.1 added with browser downloads off.
      > The user chose: never run e2e here, they run it themselves. The
      > config uses the installed Chrome (`channel: 'chrome'`) and refuses
      > unless `E2E_DATABASE_URL` points at `attendance_app_test`. It runs a
      > production build (`node build`), so the server can't fall back to
      > `.env` (see the S2.2 note). `tests/e2e/seed.ts` = made-up admin,
      > person and N-every-day team, guarded the same way. Type-checked and
      > linted; seed and spec not executed.
- [ ] `tests/e2e/manual-entry.spec.ts`: a made-up person on N for a date
      enters 19:00 → 07:00 → after a reload, the pair shows on that shift date
      (not the next) with 12:00 worked; a correction to 07:30 with a reason
      keeps the original struck through.
      **Done when** punches entered by hand show on the employee page and the
      team preview and survive a reload; a correction keeps the history;
      `pnpm test` + `pnpm test:e2e` green
      > note: NOT done. The spec is written; the user runs
      > `E2E_DATABASE_URL=… pnpm test:e2e`. `pnpm test` is green (137/137).
      > No runtime check of the entry sheet or day panel was made here (user's
      > choice after the S2.2 incident).
- [ ] Tick S1.4 in the main plan with notes (test counts); commit.
      > note: committed, but the main-plan box stays open until the user's
      > e2e run (or their manual test) confirms the done-when.

---

## Risks

- **The engine rewrite touches about 70 template test cases.** Port them file
  by file and keep `pnpm test` green between files. Do not delete a case to
  make the suite pass.
- **Overnight edge cases** (DST in `Asia/Damascus`, which has had no DST since
  2022 but the zone database still holds history; check-ins after midnight
  for a night shift). Cover both with tests that use fixed instants.
- **Lane C overlap** on `src/lib/payroll/schedule.ts` (P5). Note it in the
  main plan §10 so S4.1 starts from it.

## Verification (each task)

`pnpm check`, eslint + prettier on touched files, `pnpm test` (and
`pnpm test:e2e` from S1.4), `svelte-autofixer` clean, `git status` shows no
data files, and there are no real names in fixtures, tests or commit
messages. Dev server and DB on 127.0.0.1 only.
