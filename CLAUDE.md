# CLAUDE.md — Attendance App

Monthly rosters, attendance calculation and payroll exports for the
airport's HR, as a standalone **SvelteKit** app. It replaces the Odoo module
`roster_attendance`. **All data lives in this app** (seeded once from Odoo;
punches entered by hand now, file import later; new hires get an
app-generated employee number). Odoo **only sends the attendance emails**.

**Start here:** `plans/2026-10-28-attendance-app.md` (decisions, lanes,
tasks with "done when"). Plain-language overview with diagrams (EN/AR):
`docs/architecture-guide.html`. UI reference: `docs/mockup/attendance-builder.html`.

## 1. Real data rules (non-negotiable)

This app holds **real personal data** of airport staff (names, badges,
punches, sick days = health information).

- **Never write personal data** in code, tests, fixtures, commit messages,
  plans, docs or chat answers: no names, badges, phone numbers, emails,
  leave reasons. Use counts, aggregates and record IDs. Tests and fixtures
  use **made-up people** only.
- **Data files never enter this repo.** Exports from Odoo, punch files,
  Excel outputs, DB dumps and logs with data live in `~/secure/syravia/`
  (mode 700; files 600). The versioned pre-commit hook (`tools/hooks/`)
  blocks the usual file types.
- **No cloud.** No Neon, Vercel, CDN, analytics, error-reporting SaaS or
  any external service receives data. Runtime network calls go only to the
  local PostgreSQL and to Odoo (emails).
- **Local only while there is no login:** the dev server and the app DB
  listen on `127.0.0.1` only. Never `0.0.0.0`, tunnels or port forwarding.
- Ask the user before dropping or overwriting a database, deleting anything
  in `~/secure/syravia/`, or exposing anything on the network.

## 2. Reference material (read-only)

- `docs/reference/BRIEF.md` — business rules: §4 (R1–R18, golden numbers
  G1–G8), §9 (data model ideas), §10 (engine, overnight matching), §11
  (test cases N/A/S/O/H).
- `docs/reference/DIFF_OLD_VS_NEW.md` — §4 how the Payroll and Period
  Balance reports differ; §8 recompute check; P1–P25 known problems.
- `docs/reference/OPEN_QUESTIONS.md` (Q1–Q18), `DATA_PROFILE.md` (counts),
  `OLD_MODULE_INVENTORY.md`, `DECISIONS_PHASE0_1.md` (D0–D22).
- `docs/reference/schedule_spec/` — the overnight-shift and cycle maths in
  Python with 11 tests: port them 1:1 to TypeScript.
- The old Odoo module (for line references only):
  `/home/xxskullxx/Documents/Syravia-projects/Roster/custom_addons/roster_attendance/`.
  ⚠️ Its tests and some comments contain **real employee names and badges**
  (`tests/test_biotime_sync.py`, `test_night_shift_import.py`,
  `test_period_balance_day_hours.py`, `models/period_balance_report.py`
  :14,85,478,807, `models/raw_attendance_log.py`:279). Port **logic only**;
  never copy their comments, docstrings or example values.
- Golden numbers (real data, outside any repo): `~/secure/syravia/golden/`.

## 3. Conventions

Until task S0.6 merges them here, the coding conventions are the
template's: `docs/template/CLAUDE.md` (created in S0.2) — SvelteKit 3 +
Svelte 5 runes, pnpm only, `#lib` imports, service layer `<x>.bl.ts` +
`<x>.crud.ts`, superforms + zod 4, shadcn-svelte `lyra`, phosphor icons,
every string in `messages/en.json` **and** `messages/ar.json`, logical
(RTL-safe) Tailwind utilities, every mutation writes `audit_log` in the
same transaction, never hard-delete. Ignore its flight, Neon and Vercel
parts (removed in this app).

- Run the Svelte MCP `svelte-autofixer` on every `.svelte` / `.svelte.ts`
  file you touch until clean; use `get-documentation` for SvelteKit 3 /
  Svelte 5 APIs instead of guessing.
- `pnpm check`, `pnpm lint` (touched files) and `pnpm test` before
  declaring work done.
- Timezone: never hard-code; use the setting (default `Asia/Damascus`).

## 4. Environment (this laptop)

| Thing | Where |
|---|---|
| App dev server | `http://127.0.0.1:5173` |
| App DB | Docker container `attendance-app-db`, `127.0.0.1:5433`; DBs `attendance_app` (real data) and `attendance_app_test` (synthetic) |
| Odoo (emails only) | `http://127.0.0.1:8069`, DB `syravia_night_shift`, module `attendance_app_connector`, MailHog `http://127.0.0.1:8025` |
| Secrets | `~/secure/syravia/attendance_app.env` (DB password, Odoo API key) |
| Seed files from Odoo (one-time) | `~/secure/syravia/imports/` |
| Golden snapshot | `~/secure/syravia/golden/` |

The Odoo side (connector module, extraction tool) lives in the Roster repo:
`/home/xxskullxx/Documents/Syravia-projects/Roster`, plan
`plans/2026-10-28-attendance-app-odoo-side.md` there, under that repo's own
CLAUDE.md.

## 5. Plans

Every plan lives in `plans/` (convention in `plans/README.md`). Tick a box
as soon as its "done when" is true, add `> note:` lines with results
(counts and IDs only), commit the plan with the work. Never delete a plan;
a replaced one becomes `**Status:** superseded` with a pointer.
