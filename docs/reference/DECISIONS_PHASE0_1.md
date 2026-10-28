# Attendance Builder: decisions

Decisions taken for the rebuild of `roster_attendance` as
`hr_attendance_builder`. Newest last. Each entry says what was decided, why,
and where it came from.

## D0. The brief supersedes the bilingual HTML guide (2026-10-27)

`enhancement/attendance-builder-guide-bilingual (1).html` is **superseded by
`BRIEF.md`**. The HTML is older: it lacks P17, P18, "change pattern from
date", the employee off-day override, tests N8–N12 and A4–A5. The HTML file
is kept unchanged for reference; when it disagrees with `BRIEF.md`, the
brief wins.

## D1. Database roles on the dev laptop (2026-10-27)

The brief's database names map to this laptop as follows:

| Brief | Laptop | Use |
|---|---|---|
| `prod_copy` | `syravia_night_shift` (origin) | Hardened real-data copy |
| `prod_ref` | `syravia_ref` | Duplicate of `syravia_night_shift`, created once (2026-10-27), **never written to**. Golden numbers are read from it; scripts roll back |
| `prod_work` | `syravia_night_shift` | Recompute checks, new-module installs, manual testing |
| `legacy_test` | `legacy_test` | Empty DB for the old module's tests |
| `builder_dev_test` | `builder_test` | Empty DB for the new module's tests |
| — | `syravia_test` | New module's tests on real data (collision check) |

## D2. CLAUDE.md wins over the brief where they conflict (2026-10-27)

Docker option used: the **existing** compose stack (`docker-compose.yml`,
project `roster`: `odoo-app`, `odoo-db`, `odoo-mailhog`, ports on 127.0.0.1
only). The brief's compose file, `backups/` folder, `neutralise.sql`,
Makefile and "use the brief as CLAUDE.md" are **not** used:
- neutralisation = `odoo db load/duplicate --neutralize` + `tools/dev_harden.py`
  (crons off except autovacuum, mail to MailHog only, credentials cleared);
- data exports and logs go to `~/secure/syravia/` (golden: `golden/`, logs:
  `logs/`), never into the project;
- commands are the ones in CLAUDE.md; `CLAUDE.md` has a pointer section to
  the brief.

The brief's `legacy/roster_attendance/` means `custom_addons/roster_attendance/`.

## D3. Docs location (2026-10-27)

All rebuild docs live in `docs/attendance_builder/` (the brief says `docs/`).

## D4. Module location (2026-10-27)

`custom_addons/hr_attendance_builder/`, already on the addons path
(`/mnt/extra-addons`). The brief's `addons/` folder is not created.

## D5. Four access levels, not three (2026-10-27)

Brief §13 plus one level for HR's second person:
Supervisor → HR Officer (enters data) → **HR Approver** (approves; cannot
approve own submissions; no configuration) → HR Manager (administration).
Each implies the previous one. Deviation from the brief; scope of the
approver is Q10.

## D6. Every pay-affecting change needs approval (2026-10-27)

No "small correction" bypass until HR says otherwise (Q11).

## D7. Golden master compares money against stored values, display fields against recomputed ones (2026-10-27)

The A10 recompute check reproduced every stored money figure (OT, shortage,
Final, Deduction) for 2026-09-21 → 2026-10-20, but `payable_minutes` (9 rows)
and `missing_punch` (125 rows) are stale in storage (DIFF P21). The golden
master therefore compares Final/Deduction/OT/shortage/status with the stored
snapshot, and `payable_minutes`/`missing_punch` with the recomputed one.

## D8. BioTime: port, but rebuild the pairing (2026-10-27)

Pairing moves from calendar day to planned shift window (P18). 7 BioTime
tests are rewritten, 6 re-keyed to the shift date, 44 ported as they are
(DIFF §6).

## D9. Department rules override by section, not field by field (2026-10-27)

Brief §9.7 says an empty field on a department rule falls back to the
company default. Odoo numbers and booleans cannot be empty (0 and False are
real values, e.g. a grace of 0 or "OT off"). A department rule therefore has
three tick boxes, **Override Overtime / Lateness / Credits**; a section that
is not ticked falls back. The night rule is a link and falls back when
empty. The payroll period start day is set on the company rule only.
`attendance.builder.rule._effective_values()` returns the merged values.

## D10. A department without a rule follows its parent department (2026-10-27)

Resolution: the department's own rule → the nearest parent department with
a rule → the company default (same "nearest department first" idea as
assignments, brief §9.4). Sub-departments used as teams therefore inherit
their parent's rule.

## D11. Shift overrides use explicit tick boxes (2026-10-27)

"Required minutes" and "Night shift" are computed but overridable (brief
§9.1). An override is stored with a tick box (`required_manual`,
`night_manual`) so it survives later changes of the hours. A shift's own
night flag uses the shift's night rule, else the company rule's (a shift has
no department).

## D12. Shift grace 0 means "not set" (2026-10-27)

`attendance.builder.shift.grace_minutes` = 0 falls back to the
department/company grace. A zero grace for a department is set on its rule
(Lateness section), where 0 is a real value.

## D13. Deferred to later phases (2026-10-27)

- `hr.employee.primary_team_id`: added with teams in Phase 3.
- Supervisor record rules (team scope): Phase 3. In Phase 1 the Supervisor
  group can read configuration only.
- The "Attendance Builder" menu has only Configuration in Phase 1.

## D14–D22. Pivot to a standalone SvelteKit app (2026-10-28, with the user)

Full text and consequences: `plans/2026-10-28-sveltekit-attendance-app.md` §1.

- **D14 Pivot.** The new UI and logic live in a SvelteKit app
  (`attendance-app/`), not in Odoo. `hr_attendance_builder` (Phase 1) is
  frozen and not delivered; its maths and tests are the spec for the app's
  `src/lib/payroll/schedule.ts`. The plans for the Odoo engine (Phase 2) and
  for Svelte inside Odoo are superseded.
- **D15 Split data.** Odoo = master of employees, departments, punches,
  leaves; sends the emails. The app = own PostgreSQL for planning, results,
  exports.
- **D16 Template.** The app starts from a copy of Airport-Staff (branch
  `roster`, commit `a99e348`), code only. Airport-Staff is not modified.
- **D17 No sign-in for now.** Single user; loopback-only mode. Code login is
  switched on before the facility server.
- **D18 Local database.** Docker `postgres:16` on `127.0.0.1:5433`; no Neon,
  no Vercel for this app.
- **D19 Odoo payroll rules win** over the template's and the mockup's
  simplified rules, so the Payroll and Period Balance files match Odoo.
- **D20 Facility hosting** on a separate server next to Odoo, internal
  network only.
- **D21 Departments stay in Odoo**; the app controls each department's
  scheduling and pay settings, no write-back.
- **D22 Teams are app-owned**, inside one department, with a supervisor and
  dated members; approver = supervisor, else Odoo department manager, else HR.
