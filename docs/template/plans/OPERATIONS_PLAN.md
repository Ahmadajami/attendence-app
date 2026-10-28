# Operations plan: teams, employees, flights, imports, flight report

Open work on the operational core (CLAUDE.md Phases 1–2). Each step has an ID (`E1`, `X18`, …) so
commits and reviews can point at it. Tick a step when it has landed. Start the next phase only after the
previous checkpoint is verified, record the result in [`TRACKING.md`](TRACKING.md) with the date and
commit, then remove the finished phase from this file.

**Status:** A done · B, C built, checkpoints partly run · **D built, NOT TESTED, paused until
`ROSTER_PLAN.md` RI2** · E built except the checkpoint · **X in progress** (next: X18, before ROSTER RE)
· F–H ⏳. Finished steps are in git: `git show e47a970:OPERATIONS_PLAN.md`.

## Goal

- **Teams CRUD**: create, name (English + Arabic), rename, deactivate teams.
- **Employees** in the database, added by hand or **imported from `.xlsx` or a Markdown table**.
- **Flights**, entered by hand or imported the same way, each with an **image link** shown on the report.
- **Every flight gets a team.** A team can work many flights a day, never two overlapping ones.
- **Flight report** with Qatar-Airways-style cards: image, flight number, route, times, status, team.

Users: the admin and operations managers. Both hold `staff.write`, `flight.write`, `assignment.write`,
`import.run`, `flight.read` and `report.read`. Employees don't sign in.

## Decisions

| Topic             | Decision                                                                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Staff ↔ team      | A staff member belongs to **at most one team at a time**. History in `staff_team_membership` (X6), which becomes the only source once `ROSTER_PLAN.md` RE drops `staff.team_id`.                                                           |
| Team ↔ flight     | Assignments are per **team** (`team_flight_assignment`), one active team per flight. Because a person is in one team, "a team never overlaps" also means "a person never overlaps".                                                        |
| No double-booking | Postgres **exclusion constraint** on a team's active assignment windows (CLAUDE.md §6.2). The app pre-checks for a friendly message; SQLSTATE `23P01` maps to a localized conflict error.                                                  |
| Uncovered flight  | A non-cancelled flight with no active team assignment. Highlighted on the flights table and the report.                                                                                                                                    |
| Handling window   | Per flight `handling_starts_at` / `handling_ends_at`, prefilled from `DEFAULT_HANDLING_MINUTES` (arrival −30 / +60 min, departure −90 / +15 min). **Provisional**: open question in CLAUDE.md §10. Editable per flight; overrides audited. |
| Image link        | Optional `flight.image_url`, `https://` only, shown as `<img loading="lazy" referrerpolicy="no-referrer">` with the airline code as fallback text.                                                                                         |
| No hard deletes   | Teams → `active = false` (blocked while they have future active assignments; members are unassigned). Staff → `active = false`. Flights → `status = 'cancelled'` (cancels their assignment). Assignments → `status = 'cancelled'`.         |
| Import flow       | Upload → server parses → rows stored in `import_batch` / `import_row` → preview with per-row errors and create / update / skip → confirm → one `db.batch` upsert + audit. Max **2 MB / 2 000 rows**.                                       |
| Import keys       | Staff: `employee_no`. Flights: (`airline_code`, `flight_no`, Damascus date of `scheduled_at`).                                                                                                                                             |
| Column mapping    | One file, `src/lib/server/imports/columns.ts`: field → header aliases for our template, typical **Odoo** exports and Arabic headers. Adapting to a real Odoo file means editing only that file.                                            |
| Libraries         | `read-excel-file` (parse `.xlsx`, server only) and `write-excel-file` (template download). Markdown tables: small in-house GFM table parser, no dependency.                                                                                |
| Time              | Stored as `timestamptz` (UTC); entered and shown in Asia/Damascus (`@internationalized/date`, `formatDateTime`).                                                                                                                           |

### Import columns (defaults, edit in `columns.ts`)

| Field          | Template header | Odoo-style aliases                    | Arabic aliases |
| -------------- | --------------- | ------------------------------------- | -------------- |
| `employee_no`  | `employee_no`   | Badge ID, Barcode, Employee ID        | الرقم الوظيفي  |
| `full_name`    | `full_name`     | Employee Name, Name                   | الاسم          |
| `full_name_ar` | `full_name_ar`  | Arabic Name                           | الاسم بالعربية |
| `phone`        | `phone`         | Work Mobile, Mobile Phone, Work Phone | الهاتف، الجوال |
| `function`     | `function`      | Job Position, Job Title, Department   | الوظيفة، القسم |
| `team`         | `team`          | Team                                  | الفريق         |

Flights: `airline_code`, `flight_no`, `direction` (`arrival` / `departure`, or `A` / `D`), `origin`,
`destination`, `scheduled_at` (Damascus date + time), `aircraft_type`, `stand`, `gate`, `image_url`,
optional `team`.

---

## Checkpoints still to run (phases B–E built)

**Checkpoint B (teams):** create / rename / deactivate in EN and AR; duplicate name rejected; a request
without `staff.write` → 403. _Run so far (2026-10-26):_ create and duplicate name pass. **Still to run:**
rename, deactivate + reactivate, the same in Arabic. The 403 item is covered by review only (both
account roles hold `staff.write`).

**Checkpoint C (employees):** team moves survive a reload; audit rows written; EN + AR. _Run so far
(2026-10-26):_ create (with and without a team), update and moves pass, memberships match. **Still to
run:** deactivate an employee, the same in Arabic. (Moves change in `ROSTER_PLAN.md` RE; re-run them
there.)

**Checkpoint D (import, paused until ROSTER RI2):** a sample `.xlsx` with Odoo-style headers and a `.md`
with Arabic headers preview correctly; bad rows are flagged and skipped; commit creates / updates staff;
re-importing the same file changes nothing; a file over 2 MB is rejected. Never run yet. Before testing:
re-check the staff import against the membership model, regenerate the QA files (Odoo `.xlsx`, Arabic
`.md`, > 2 MB).

## Phase E — Flights ⏳ checkpoint pending

E3 (flight import) is done. E1, E2, E4 are built and get ticked when Checkpoint E passes.

- [ ] **E1** `services/flights.ts`: list by Damascus day, create, update / reschedule (moves the active
      assignment window in the same batch; `23P01` → conflict message), cancel.
- [ ] **E2** `(dashboard)/flights/`: day picker, table (image, flight, direction, route, STA / STD, status,
      team), create / edit sheet with `image_url` and the handling window.
- [ ] **E4** Sidebar link (`flight.read`); EN + AR messages.

**Checkpoint E:** CRUD and import of a sample schedule; times entered and shown in Damascus time, stored
in UTC; cancelling keeps the row with `status = 'cancelled'`.

## Phase X — Review fixes ⏳ (land before F)

From the 2026-10-26 review of A–E against CLAUDE.md. X1–X6, X11, X12, X16, X17 are done.

### Medium

- [ ] **X7** Import never touches a cancelled flight's assignment. Matching (`imports/flight-import.ts`)
      includes cancelled flights; an update keeps `status = 'cancelled'` but can insert an active team
      assignment (`services/imports.ts`). Flag such rows `flight_cancelled` (skip) with an EN + AR label.
- [ ] **X8** Commit re-checks what preview resolved. A team or function deactivated (or a staff number
      taken) between preview and commit must not be written: re-load active teams / functions in
      `commitImport` and refuse with `ConflictError('stale_preview')` asking for a re-upload.
- [ ] **X9** Flight import pre-checks team overlaps. In `buildFlightRows`, a row whose team already has an
      overlapping active assignment, or overlaps another row of the same file for that team, gets a
      `team_overlap` issue naming the other flight. The exclusion constraint stays the real guard.
- [ ] **X10** Cancelling a flight asks for confirmation (it also cancels the team assignment). Add the
      shadcn `alert-dialog` and confirm before `?/cancel` (`flights/+page.svelte`).

### Low

- [ ] **X13** _(flight sheet done)_ `imports/+page.svelte`: replace the native `<select>` with shadcn
      `Select` wired through Formsnap.
- [ ] **X14** _(flight sheet done)_ No `$effect` writing form data in `TeamFormSheet` and
      `StaffFormSheet`: reset the form in `openCreate` / `openEdit` (`form.reset({ data, … })`).
- [ ] **X15** Staff import validates rows with zod, using the shared staff schema.

### Rules alignment (CLAUDE.md §3)

- [ ] **X18** Split `services/staff.ts` into `services/staff/staff.{bl,crud}.ts`; remove `StaffRow` /
      `TeamOption` / `StaffFunctionOption` from `src/lib/types/workforce.ts`. **Next, before ROSTER RE.**
- [ ] **X19** Same split for `services/flights.ts`; remove `src/lib/types/flights.ts`.
- [ ] **X20** Same split for `services/imports.ts`; the DB reads in `server/imports/staff-import.ts` and
      `flight-import.ts` move into `imports.crud.ts` (the builders stay pure helpers).
- [ ] **X21** Same split for `services/users.ts`; move `BatchQuery` into `services/common.ts`.
- [ ] **X22** _(teams done)_ Shared schemas: move `flights/`, `employees/`, `admin/users/` `schema.ts` to
      `src/lib/schemas/<service>.schema.ts`; add the flight enums to `src/lib/schemas/enums.ts` feeding
      the `pgEnum`s, `z.enum` and labels (replaces `flightStatusValues`, `DIRECTIONS`, `STATUSES`).
- [ ] **X23** UI rules in the plan's pages: `space-y-*` → `flex flex-col gap-*`, `{@const}` →
      declaration tags; the remaining copies of the notice handler (`teams`, `employees`, `admin/users`,
      `flights`, `imports/[id]`) use `toastNotice`; use `formToasts` in the sheets; drop the extra
      `invalidateAll()` after Superforms / `update()` already invalidated.

**Checkpoint X** (never run; covers the done fixes too):

- An import that moves an assigned flight without a team column moves the assignment too; an overlap
  with that team's other flight is rejected.
- A file with `2026-02-30 10:00` previews with that row flagged; `/flights?day=2026-02-30` shows today;
  `/imports/abc` is a 404. No 500s in the server log.
- A session without `flight.write` (or `staff.write`) gets 403 committing a flights (staff) batch.
- Changing a flight's window without a reason shows a field error; with one, the audit row has `reason`.
- Cancelled flights, stale previews and overlapping team rows are flagged in the preview, not at commit.
- Cancelling a flight asks first. Moving a staff member between teams writes a closed and an open
  `staff_team_membership` row; two open rows for one person are rejected by the constraint.
- `pnpm check`, `pnpm lint`, `pnpm test`, Svelte autofixer on touched `.svelte` files, `pnpm build`;
  flows re-tested in EN and AR.

## Phase F — Team ↔ flight assignment ⏳

- [ ] **F1** `services/assignments/assignments.{bl,crud}.ts`: assign team (pre-check overlap; the DB
      constraint is the real guard; map `23P01`), change team, unassign (cancel); `assignment.write`;
      audit.
- [ ] **F2** Flights table: team select per row and an "uncovered" badge.
- [ ] **F3** Teams page: each team's flights for the day.

**Checkpoint F:** an overlapping assignment is rejected by the backend with a localized error; a team on
back-to-back, non-overlapping flights works; cancelling a flight frees its team.

## Phase G — Flight report ⏳

- [ ] **G1** `(dashboard)/reports/flights/` (`?date=`): Qatar-style card per flight: image (`image_url`,
      fallback airline code), flight number, origin → destination, scheduled / estimated time
      (`formatDateTime`), status badge, team name + member count.
- [ ] **G2** Uncovered flights listed first and highlighted; print stylesheet; `report.read`.
- [ ] **G3** Sidebar link; EN + AR (RTL layout; times and flight numbers stay LTR).

**Checkpoint G:** the report matches the flights table for the same day in EN and AR.

## Phase H — Hardening & docs ⏳

- [ ] **H1** 403 sweep: every load and action guarded; a request without the permission gets 403.
- [ ] **H2** Security review of uploads (size / row limits, server-only parsing) and image URLs (https only).
      Includes `.xlsx` decompression: a 2 MB file can inflate far beyond that, and `read-excel-file` has
      no visible decompressed-size limit (unverified).
- [ ] **H3** CLAUDE.md §4 / §7 updated; plan marked complete.

**Checkpoint H:** `pnpm check`, `pnpm lint`, `pnpm test`, Svelte autofixer on touched `.svelte` files,
`pnpm build`; full flow re-tested in EN and AR.

## Reuse

- Actor / `AppError` (`#lib/server/errors.ts`) / `pgErrorCode` and audit-in-batch: `services/teams/`,
  `services/roster/` (bl + crud examples).
- `auditInsert`: `src/lib/server/audit.ts`. `requirePermission`: `src/lib/server/rbac/guard.ts`.
- `formatDateTime`: `src/lib/utils/datetime.ts`. `toAsciiDigits` / `ID_DIGITS`: `src/lib/schemas/auth.schema.ts`.
- Sheets, forms, tables and `endSide` / `personName` helpers: `src/routes/(dashboard)/admin/users/`.
- Drag-and-drop components: `src/routes/(dashboard)/employees/`.

## Later

- [ ] **L1** Expand team assignments into per-person `assignment` rows (CLAUDE.md §7) when individuals
      need to be assigned outside their team.
- [ ] **L2** `handling_window_rule` table once the ops team confirms the minutes per direction / aircraft.
- [ ] **L3** Link `staff` to Odoo (`odoo_id`) and reconcile against a real Odoo export.
