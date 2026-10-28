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

The template's rules apply in full; read them in `docs/template/CLAUDE.md`
§3 ("Stack & conventions", "UI rules", "Forms", "Service layer", "Shared zod
schemas", "Backend typing", "Services, errors & types", "Error handling"),
§6 rules 1, 3, 4, 5, 6 (server-side permissions, audit every mutation, time
as `timestamptz`, en+ar strings with logical/RTL utilities, never
hard-delete) and §7 "Conventions". In short: SvelteKit 3 + Svelte 5 runes,
pnpm only, `#lib` imports (not `$lib`), env vars declared in `src/env.ts` and
read from `$app/env/private`, superforms v3 + zod 4 with one shared schema per
service, shadcn-svelte `lyra` + phosphor icons, `localizedHref()` for every
internal link, every string through `m.*()` in **both** `messages/en.json` and
`messages/ar.json`, services split into `<service>.bl.ts` (permission, rules,
audit, errors; the only thing routes import) and `<service>.crud.ts` (queries;
writes return unexecuted queries), `AppError` subclasses for expected
failures.

**Differences from the template (this app wins):**

| Topic | Here |
|---|---|
| Atomic writes | `batch([...writes, auditInsert(...)])` from `#lib/server/db/index.js` (postgres.js transaction; `src/lib/server/db/batch.ts`), not Neon's `db.batch` |
| Database | local PostgreSQL in Docker (`docker-compose.dev.yml`), `postgres.js` driver; interactive `db.transaction` is available when a BL really needs read-then-write |
| Deploy | `adapter-node` on a separate facility server (S8); no Vercel, no serverless limits |
| Auth | `AUTH_MODE=local_single_user` (no sign-in, loopback only, `src/lib/server/auth/local-mode.ts`); `login` returns before S8 |
| Scope | no flights/assignments; payroll **is** in scope (the template said "not payroll") |
| Timezone | template code shows `Asia/Damascus`; new code reads the timezone setting (default `Asia/Damascus`) |
| Migrations | `drizzle/0000_baseline` + `0001_constraints_seed` replace the template's history; keep editing the schema → `pnpm db:generate` → read the SQL → `pnpm db:migrate`; custom SQL via `drizzle-kit generate --custom` |

**Commands** (drizzle-kit needs the env loaded):

```sh
docker compose --env-file ~/secure/syravia/attendance_app.env -f docker-compose.dev.yml up -d
pnpm dev                     # http://127.0.0.1:5173 (pinned to loopback)
pnpm check && pnpm test      # types + Vitest (pure logic, Node, no DB)
pnpm exec eslint <files>     # whole-repo `pnpm lint` fails on ~160 untouched template files (mostly generated `ui/`)
set -a; . ./.env; set +a; pnpm db:generate   # / pnpm db:migrate
pnpm auth:create-admin <id> "<name>"         # first admin = the local-mode account
```

- Run the Svelte MCP `svelte-autofixer` on every `.svelte` / `.svelte.ts`
  file you touch until clean; use `get-documentation` for SvelteKit 3 /
  Svelte 5 APIs instead of guessing.
- `pnpm check`, eslint + prettier on touched files and `pnpm test` before
  declaring work done.

## 4. Environment (this laptop)

| Thing | Where |
|---|---|
| App dev server | `http://127.0.0.1:5173` |
| App DB | Docker container `attendance-app-db`, `127.0.0.1:5433`; DBs `attendance_app` (real data), `attendance_app_test` (synthetic, Playwright) and `attendance_app_e2e` (synthetic, manual testing) |
| Manual-test server | `pnpm exec vite dev --mode e2e --port 5174` → `http://127.0.0.1:5174` on `attendance_app_e2e` (gitignored `.env.e2e`, a copy of `.env` with that DB). Never point a dev server at another DB by exporting `DATABASE_URL`: after a reload it falls back to `.env` (real data) |
| Migrations | apply each new one to all three DBs: the two synthetic ones without asking, `attendance_app` after a row-count check and the user's OK |
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
