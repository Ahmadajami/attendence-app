# B2.1 — dated settings design checkpoint

**Status:** to do
**Date:** 2026-11-17
**Goal:** propose a concrete, bounded implementation for B2 using existing settings/pay-rule infrastructure; stop for review before changing production code.

## Read first

Read `CLAUDE.md`, `plans/2026-11-17-build-handoff.md`, and the approved
TP25–TP32 entries in `plans/2026-11-17-team-policies-and-cancellation.md`.
B1 has passed local Codex review: 17 focused tests, 612 total tests, zero type errors,
one existing stepper warning. Do not modify its two files.

Use RTK explicitly. Read the existing graph report before broad exploration, then
confirm findings in source. No external LLM backend.

## Task

Create only `plans/2026-11-17-b2-dated-settings-design.md`, as a proposed design
with a concrete file list and separately reviewable implementation steps.
Do not implement the design in this task. Do not start B3 or B4.

Inspect these source anchors and their direct callers/tests as needed:

- `src/lib/payroll/pay-rule.ts` and its tests: existing company/pattern inheritance,
  effective dates and default factors.
- `src/lib/schemas/pattern-pay.schema.ts` and its tests: rate validation and form contracts.
- `src/lib/server/db/schema/roster.ts`: `patternPayRule`, constraints and references.
- `src/lib/server/services/pattern-pay/pattern-pay.bl.ts` and `.crud.ts`:
  permission checks, version changes, audits and recomputation.
- `src/lib/server/db/schema/settings.ts`, `src/lib/schemas/settings.schema.ts`,
  `src/lib/server/services/settings/settings.crud.ts`: current general settings storage.
- `src/lib/roster/versions.ts`, `src/lib/server/services/effective-date.ts`:
  existing change planning and effective-date restrictions.
- `src/lib/server/pattern-pay-forms.ts`, settings page server/component and existing
  pay-rule form components: identify later UI touchpoints; do not edit them.
- Existing migration SQL relevant to pay-rule version overlap constraints.

The design must answer:

1. How to extend the existing dated factor system for night overtime, preserving
   current normal/off-day/holiday behavior and company/pattern inheritance.
   Identify existing consumers that would require compatibility changes.
2. Where to store the optional dated COMPANY off-day leave-conversion override,
   and why. Compare extending existing version infrastructure with a dedicated
   versioned setting. The existing single-value `app_setting` row alone must not
   silently discard dated history. Avoid a parallel payroll engine.
3. Precise schemas and TypeScript contracts, including null/unset semantics,
   positive finite override minutes, existing factor limits/precision, version ID,
   effective-from and exclusive effective-to, and explainable resolved values.
   Do not invent a new duration cap, rounding rule or entitlement policy.
4. How default normal/off/night factors 1.25/1.50/1.50 become applicable from
   2026-11-01 without backdating new policy into October or changing existing
   historical versions. Distinguish code defaults, display defaults and persisted
   initialization. Never seed an eight-hour conversion override.
5. How later edits, clearing an override, same-date changes, future versions,
   overlap and concurrent writes preserve history and audit. Flag existing
   hard-delete behavior in version services; do not copy it into new work or
   silently expand this task into a broad cleanup.
6. Permission and atomic audit boundaries, service BL/CRUD separation, shared zod
   schema, bilingual messages and settings UI integration. Identify existing
   permissions; propose a choice with its rationale rather than granting access.
7. Boundaries: B2 stores/resolves settings; B3 posts/reverses leave ledger entries;
   B4 integrates factor selection/display. Do not alter current engine outputs,
   stored attendance, `otEnabled` semantics, holiday precedence, or hide-only
   overtime behavior during B2. Callers later supply the shift-start date in the
   configured timezone; no guessed midnight split or highest/stacked rate.
8. Exact migration requirements and deployment compatibility. No migration
   generation/application in this design task. List synthetic validation needed
   before any real migration, and the production row-count/user-approval gate.
9. A synthetic test matrix: date boundaries, history preservation, inherited
   factors, invalid values, unset/cleared override, permissions, audit atomicity,
   concurrent/overlapping changes and unchanged October outputs. Identify which
   checks can be pure tests and which need a synthetic database later.

Use sections for observed existing behavior (with file/line references), proposed
changes, rejected alternatives/reasons, open questions, exact implementation file
list, implementation slices, and verification/manual review requirements.
Label all new architectural choices as proposed. Clearly separate existing
approved policy from proposed implementation. If existing precedence or history
requirements conflict, surface that conflict instead of choosing a new policy.
Do not mark B2 complete: this is only its design checkpoint.

## Safety and scope

Work on the current `app/main` branch; report if another branch is checked out.
Record starting/final working-tree status and preserve all unrelated changes.
If the target design file already exists, inspect/report it rather than overwriting.

Synthetic/source-only work: do not read `.env`, secure folders, employee files,
old-module code/tests or real identifiers. No Docker, SQL execution, Odoo calls,
extraction/import scripts, migrations, dev servers or browsers. Do not install
packages or change providers, authentication, configuration or permissions.

Do not edit source, messages, migrations, decision logs, handoff or other plans.
No staging, commits, pushes, resets, cleaning, stashing or branch changes.
No delegation or permission bypasses.

## Verification and report

Run via RTK:

- `pnpm exec prettier --check plans/2026-11-17-b2-dated-settings-design.md`
- `git diff --check`

Format only the new design file if required. No Svelte changes, so no autofixer
is needed. Do not claim implementation checks or database tests were run.

End with the proposed design summary, exact file created, actual checks/results,
open questions/approval points, and confirmation that no production code, real
data, database or B3/B4 work was touched. Stop for local Codex review.
