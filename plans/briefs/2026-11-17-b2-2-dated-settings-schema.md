# B2.2 — dated settings database structure only

**Status:** to do
**Date:** 2026-11-17
**Goal:** add the reviewed storage structure and generate reviewable migration SQL, without applying it or changing application behavior.

## Context

Read `CLAUDE.md`, `plans/2026-11-17-build-handoff.md`,
`plans/2026-11-17-b2-dated-settings-design.md`, and TP33 in
`plans/2026-11-17-team-policies-and-cancellation.md`.

B1 is accepted (17 focused tests, 612 total tests, zero type errors, one existing
stepper warning). B2.1's architecture is accepted for bounded implementation.
This brief overrides stale wording in the design:

- Only the new night-overtime factor starts **2026-10-25**, initially 1.50.
  Existing Guards and Operations night schedules retain their dates.
- Other new policies remain effective **2026-11-01**.
- The later resolver task will return no new night category before 25 October,
  then resolve pattern → company → 1.50. Do not implement that resolver now.
- Preserve arbitrary existing company/pattern rates, not merely built-in defaults.
- No seeded company pay-rule row and no seeded leave-conversion override.

## Scope and allowed files

Record initial status and branch. Work only on existing `app/main`; report any
other branch rather than switching. Preserve unrelated edits and the B1 files.
Use RTK explicitly and inspect the local graph before broad exploration; confirm
schema and SQL details in source. SQL is a known graph extraction gap.

Allowed production files:

1. `src/lib/server/db/schema/roster.ts` — `patternPayRule` only.
2. `src/lib/server/db/schema/leave-conversion.ts` — new table and inferred types.
3. `src/lib/server/db/schema/index.ts` — export the new schema.
4. New generated migration SQL and its generated Drizzle metadata/journal changes.
5. A new generated custom migration, if required for the EXCLUDE constraint.

Do not modify existing migration SQL or snapshots. Inspect the current journal
for the next number; do not assume it is still 0029. If any new target already
exists, inspect/report it rather than overwriting unrelated work.

Do not edit pure logic, shared form schemas, services, routes, UI, translations,
configuration, package files, plans or decision logs in this task. If the schema
change causes a compatibility failure outside the allowed files, report it and
stop rather than widening scope. Do not start another B2 slice, B3 or B4.

## Required schema changes

### Existing pay rules

Add `nightRate` / SQL `night_rate` to `patternPayRule`:

- Nullable `numeric(4,2)` using the existing rates' number mapping.
- No column default; existing rows receive null (inherit).
- Extend `pattern_pay_rule_has_value` to include nightRate so a night-only
  version can exist. Preserve all existing accepted rows.
- Extend `pattern_pay_rule_rate_range` to validate a non-null night rate in
  the existing 1–5 range, preserving all existing rate constraints.
- Preserve company/pattern overlap constraints, indexes, foreign keys and
  effective-date behavior. No row updates, seed rows or version-model changes.

### Company off-day leave conversion

Create `offDayLeaveConversion`, SQL `off_day_leave_conversion`:

- UUID primary key with the project's standard generated default.
- Nullable `minutes`: unconstrained-scale PostgreSQL `numeric`, mapped to a JS
  number. Null means no company override; use employee normal workday minutes.
- Non-null ISO date `effectiveFrom`; nullable `effectiveTo`, exclusive.
- Nonblank reason, createdBy user reference following the attendance-rule schema,
  createdAt/updatedAt as timestamptz using existing schema conventions.
- Unique effectiveFrom and date-order constraint (effectiveTo null or > from).
- Database constraint allowing null or a positive FINITE numeric value. Explicitly
  account for PostgreSQL numeric NaN/Infinity; `minutes > 0` alone is insufficient.
  Do not add a duration cap, integer restriction or decimal-rounding policy.
- EXCLUDE overlapping `daterange(effective_from, effective_to, '[)')` intervals
  across the whole company table. Adjacent versions must be allowed; null end
  is unbounded. Follow the existing custom EXCLUDE migration convention.
- Export useful inferred select/insert types consistent with neighboring schemas.

This stores already-representable JS number values without a forced SQL scale.
It does not promise arbitrary-precision decimal arithmetic in TypeScript.
The later service will close/insert history atomically with audit and never delete
these versions; do not implement that service or audit writes in this task.

## Migration generation and SQL review

Generate through Drizzle Kit; do not hand-author metadata or snapshots.
`drizzle.config.ts` requires DATABASE_URL even for offline generation. Do not
read/source `.env` or use a real connection string. Supply this literal inert URL
for generation only:

```sh
DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:1/synthetic pnpm db:generate
```

Use the same inert URL with `pnpm exec drizzle-kit generate --custom` if a
custom constraint migration is necessary. Never execute SQL against that URL
or any database. If the tool attempts a connection, stop and report it.

Read every new SQL statement and check:

- Only the intended column, updated check constraints, new table, indexes,
  foreign key and EXCLUDE are affected.
- No INSERT/UPDATE/DELETE/TRUNCATE, no destructive table/column changes, no
  unrelated schema drift, and no replacement of historical version rows.
- Dropping/recreating the two named check constraints is expected; retaining
  existing values and overlap constraints is mandatory.
- No default 480-minute override, no factor seed, no business date baked into SQL.
- Generated metadata matches the schema. Custom constraints follow existing
  migration conventions and won't be silently lost in later generation.

Report the exact migration names/order and expected schema effects. Migrations
must eventually be applied to both synthetic DBs and production, but **none are
authorized to run in this task**. Schema-dependent app queries will require the
new migrations before the corresponding application code is used. Production
application remains subject to a separate row-count check and user approval.

## Verification

Use RTK explicitly. Run and report actual outcomes:

```sh
pnpm check
pnpm test --maxWorkers=2
pnpm exec eslint src/lib/server/db/schema/roster.ts src/lib/server/db/schema/leave-conversion.ts src/lib/server/db/schema/index.ts
pnpm exec prettier --check src/lib/server/db/schema/roster.ts src/lib/server/db/schema/leave-conversion.ts src/lib/server/db/schema/index.ts
git diff --check
```

Format only touched schema
files if needed. Preserve generated metadata formatting conventions. Review new
untracked files directly because ordinary `git diff` does not include them.

No new DB tests in the Node-only unit suite. Constraint execution, migration
application, finite-value rejection, adjacent/overlapping ranges, and a fractional
value such as **660.125** round-tripping remain explicit synthetic-DB checks for
a later task. Do not claim these passed based on source review.

Refresh the local code graph without an external LLM backend. No Svelte changes,
so no Svelte autofixer. Compare final working-tree status with the initial status.

## Safety and final report

No secrets, real data, secure folders, old-module files, Docker/SQL/Odoo calls,
imports, database writes, migrations applied, dev servers or browsers. No package
installation or provider/auth/config changes. No delegation or approval bypasses.
No staging, commits, pushes, resets, cleaning, stashing or branch changes.

Report:

1. Exact schema changes and allowed files changed/created.
2. Migration filenames/order, reviewed SQL effects and any unexpected drift.
3. Actual checks/counts and the known pre-existing warning, if still present.
4. Pending synthetic database checks and unapplied migrations.
5. Any conflict, deviation or unresolved issue.
6. Confirmation: no real data, no database operations, no commits/pushes, no next slice.

Stop for local Codex review.
