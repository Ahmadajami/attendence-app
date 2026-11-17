# B2.3 — pure dated settings resolvers

**Status:** to do
**Date:** 2026-11-17
**Goal:** resolve the dated night-overtime factor and company off-day leave-conversion override using synthetic inputs only, without wiring either into calculations or storage.

## Read first

Read `CLAUDE.md`, `plans/2026-11-17-build-handoff.md`, the B2.1 design,
and TP33 in `plans/2026-11-17-team-policies-and-cancellation.md`.
Inspect the existing graph before broad exploration; confirm in source.
Use RTK explicitly. No external LLM backend.

B1 is accepted: 17 focused tests. B2.2 schema-only review passed: 612 total tests,
zero type errors, one existing stepper warning. Migrations 0029 and 0030 remain
unapplied. This task does not require a database or applying those migrations.

## Allowed files

- `src/lib/payroll/pay-rule.ts`
- `src/lib/payroll/pay-rule.test.ts`
- `src/lib/leave/conversion.ts` (new)
- `src/lib/leave/conversion.test.ts` (new)

Record starting status and branch. Work on existing `app/main`; report a different
branch instead of switching. Inspect/report existing new-file targets before
replacing them. Preserve unrelated edits, B1, and all B2.2 schema/migration files.

No changes to services, DB schemas, migrations/metadata, routes, UI, shared form
schemas, messages, settings, attendance/report engines, configuration, plans or
decision logs. If completion requires edits beyond these four files, stop and
report the exact incompatibility instead of broadening scope.

## Night-rate resolution

Extend `resolvePayRule` in the existing module; do not create a parallel engine.

1. The caller supplies an already-selected ISO shift-start date in the configured
   timezone. Do not resolve timezones, inspect instants or classify shifts here.
2. For dates **before 2026-10-25**, resolved `nightRate` is **null**, source
   `default`, even if a supplied pattern/company version has a night value.
3. From **2026-10-25**, resolve nightRate field by field: active pattern value,
   then active company value, then **1.50**. Null or absent input means inherit.
   Never inherit a value from an expired version at the same level.
4. Preserve inclusive effectiveFrom and exclusive effectiveTo, and reuse suitable
   existing helpers such as `versionOn`. Inputs are validated non-overlapping
   version arrays; do not invent conflict policy for corrupt/overlapping versions.
5. Return the existing rule/sources contract extended with an explicitly present
   `nightRate: number | null` and its pattern/company/default source.
6. Preserve all existing field values and sources for arbitrary historical company
   and pattern rates, including explicit `otEnabled: false`.
7. Keep the runtime value of `OVERTIME_DEFAULTS` unchanged. The 1.50 fallback is
   date-aware; do not put an unconditional night value into that object.
8. Define named constants for the night start date/default rather than repeating
   unexplained literals.
9. Leave `overtimePay` behavior unchanged. Do not apply night factors to daily
   results, select off-day vs night vs holiday, change rounding, multiply all
   night attendance hours, or implement hide-only overtime UI. Those are later work.

### Compatibility within this slice

Existing services and tests pass legacy version objects without nightRate, and
existing consumers use the four-field `PayRule`/`OVERTIME_DEFAULTS` shape. Keep
those callers compiling without edits or unsafe casts. A suitable minimal design
is an optional nullable night field on input versions, with an explicitly extended
resolved rule/source type; legacy base rule/default types may stay unchanged.
Explain the chosen contract in the final report. Do not make the resolved field
optional, use `any`, or weaken existing types merely to silence errors.

The B2.1 design's suggestion to make nightRate required on every legacy PayRule
is not a requirement for this compatibility-preserving slice. Storage/services
will load the new field in a later task; this task only handles supplied values.

## Off-day leave-conversion resolution

Create a small pure `resolveOffDayConversion(versions, date)` helper in
`src/lib/leave/conversion.ts` with exported input/result types.

Input versions contain id, minutes (number or null), effectiveFrom and exclusive
nullable effectiveTo. Caller supplies validated positive finite minutes, sorted
or unsorted non-overlapping valid date intervals; the resolver must work regardless
of input ordering. Do not import server/DB types or load settings.

Result, explicitly present fields:

- `minutes: number | null`
- `versionId: string | null`
- `source: 'default' | 'company'`

Behavior:

- No active version: null minutes, null versionId, default source.
- Active numeric version: exact supplied minutes, that version's id, company source.
- Active null/clear version: null minutes, THAT version's id, company source.
  Do not lose the explanation that HR explicitly cleared the override.
- Respect effectiveFrom inclusive/effectiveTo exclusive, unbounded null end,
  historical dates and future versions; no mutation or sorting the caller's array.
- No hardcoded eight hours, no rounding/cap, no conversion of credit minutes, no
  schedule lookup, no balance or ledger access, no posting/reversal/recompute.
- Do not add an unrelated date gate: this resolver looks up supplied versions.
  The later settings service enforces approved policy dates for writes.

## Synthetic tests

Add meaningful tests that assert outputs and provenance, not copies of loops.

Night resolver:

- 24 October: null night/default source, including stored night values.
- 25 October: 1.50/default with no versions; confirm it remains available on
  1 November and later dates.
- Pattern wins company; null/omitted pattern falls through to company; both
  null/omitted fall through to 1.50.
- A later company version editing only another field still inherits 1.50, not
  an expired previous company night rate and not null.
- Exact active-version boundaries on both company and pattern levels.
- Non-default historical work/off/holiday values and explicit false otEnabled
  remain unchanged before AND after the boundary.
- Existing overtimePay expectations still pass unchanged.
- Inputs are not mutated (frozen synthetic fixtures are useful).

Off-day resolver:

- Empty versions and gaps return default metadata.
- Before/start/end/after a numeric version; adjacent versions at their shared date.
- Explicit null version preserves its company provenance and id.
- Fractional minutes **660.125** remain unchanged; this tests resolver precision,
  not a database round-trip (database execution is still pending).
- Unsorted version arrays, future versions, open ends and immutable fixtures.

Update existing pay-rule test expectations only for the new resolved metadata;
retain all previous assertions about the existing fields/calculation results.
Do not edit other tests or fabricate ledger tests before a ledger exists.

## Verification

Run via RTK and report actual results:

```sh
pnpm exec vitest run src/lib/payroll/pay-rule.test.ts src/lib/leave/conversion.test.ts
pnpm check
pnpm test --maxWorkers=2
pnpm exec eslint src/lib/payroll/pay-rule.ts src/lib/payroll/pay-rule.test.ts src/lib/leave/conversion.ts src/lib/leave/conversion.test.ts
pnpm exec prettier --check src/lib/payroll/pay-rule.ts src/lib/payroll/pay-rule.test.ts src/lib/leave/conversion.ts src/lib/leave/conversion.test.ts
git diff --check
```

Format only these four files if needed. Refresh the local code graph without an
external LLM backend. Compare final status to the starting status. No Svelte
changes, so no autofixer; no browser/manual check is needed for this pure task.

## Safety and report

No .env/secrets/secure files, actual employee data, old-module files, database
connections, Docker, SQL/Odoo calls, migrations generated/applied, imports, dev
servers or browsers. No packages, provider/auth/config changes or delegation.
No staging, commits, pushes, resets, cleaning, stashing or branch switches.
Do not implement the next slice, services/UI, B3 or B4.

Report contracts, exact files, actual checks/test counts and existing warning,
compatibility choices, unresolved issues, and confirmation of no real data,
DB operations or commits/pushes. Note that 0029/0030 and their synthetic DB
checks remain pending; do not claim resolver tests validate database constraints.
Stop for local Codex review.
