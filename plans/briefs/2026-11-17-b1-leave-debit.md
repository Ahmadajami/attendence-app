# B1 — pure annual-leave debit conversion

Paste the short launch prompt from the handoff into a fresh interactive OpenCode session.
Read this entire brief before implementation. This task uses synthetic inputs only.

<task>
Add a small, pure TypeScript helper that plans the conversion of approved attendance-credit
minutes into an annual-leave debit. No database, UI, routing or current-engine integration.

Read CLAUDE.md and plans/2026-11-17-build-handoff.md. Inspect src/lib/leave/balance.ts and its tests
for local conventions. Use the existing graph before broader exploration.

Create exactly these task files:

- src/lib/leave/credit-debit.ts
- src/lib/leave/credit-debit.test.ts

Export a typed helper named planLeaveDebit (or explain a necessary naming conflict). Inputs describe:

- positive attendance-credit minutes HR intends to debit;
- whether the affected day is a weekly off day;
- scheduled required minutes for a working day;
- employee normal-workday required minutes, when known;
- optional company off-day conversion override in minutes (null/absent means unset).

Required behavior:

1. Working day: divisor = that day's scheduled required minutes. An off-day override must not
   change workday conversion.
2. Weekly off day: use the explicit company override if supplied; otherwise use the employee's
   normal-workday required minutes. Zero scheduled off-day required minutes are not a divisor.
3. Return the credit minutes, applied divisor, unrounded day fraction, and which source selected
   the divisor. Example: 21 / 660 days. Preserve the inputs needed to explain/reverse a future debit.
4. Validate positive finite minute inputs for the selected calculation. Zero, negative, NaN,
   Infinity, or a missing selected divisor must return a typed failure/unresolved result. Do not
   silently choose eight hours, round values, or fall back from a supplied invalid override.
5. Do not cap a result based on remaining entitlement: negative balances are approved. This helper
   neither loads nor mutates a balance. HR debit posting remains a separate future service action.
6. Do not mutate inputs, read environment/settings, access storage, resolve dates, or post/reverse
   ledger entries. Callers will supply the already-selected dated rule values in a later task.

Use a discriminated result with internal reason codes for errors, not user-facing English error
messages. Keep the API minimal. Reuse existing suitable helpers if discovered, but stop and report
if completion requires touching production code outside the two allowed new files.
</task>

<acceptance_examples>
Use made-up people only. Include meaningful behavior tests covering:

- Working day: 21 credit minutes / 660 scheduled minutes; no rounding to 0.03 days.
- Different employee working day: 21 / 600.
- Off day with scheduled required minutes 0 and normal workday 660: 21 / 660.
- Off day with explicit company override 480: 21 / 480, including when normal hours are unknown.
- Workday still uses 660 when an off-day override of 480 is present.
- Missing/zero normal duration without an off-day override returns a typed unresolved/error result.
- A supplied invalid selected override is not silently replaced by normal hours.
- Invalid credit minutes and selected divisors (including nonfinite values) are rejected.
- Unused off-day-only inputs do not change a valid workday result.

Assert behavior and metadata, using appropriate floating-point comparisons for day fractions.
Do not write tests that simply duplicate the helper's implementation. Do not change existing
full-day leaveBalance rounding or wire this helper into stored/recomputed day results in B1.
</acceptance_examples>

<verification_loop>
Use RTK explicitly where supported. Run and fix failures caused by your changes:
pnpm exec vitest run src/lib/leave/credit-debit.test.ts
pnpm check
pnpm test --maxWorkers=2
pnpm exec eslint src/lib/leave/credit-debit.ts src/lib/leave/credit-debit.test.ts
pnpm exec prettier --check src/lib/leave/credit-debit.ts src/lib/leave/credit-debit.test.ts
git diff --check

Format only the two task files if needed. Existing baseline: the last local run had 595 tests
passing and zero type errors, with one pre-existing warning in ui/stepper/stepper-item.svelte.
Do not fix unrelated warnings. Refresh graphify after code changes, without an external LLM backend.
Compare final working-tree status with its initial state; unrelated pre-existing changes must remain.
</verification_loop>

<action_safety>
Work on the existing app/main branch. If another branch is checked out, report it rather than switching.
If either new task file already exists, inspect/report the situation before overwriting user work.
Do not read .env or secure folders, employee files, old Odoo module code/tests, or private identifiers.
Do not run Docker, SQL, Odoo RPC, extraction/import scripts, migrations, dev servers or browsers.
Do not install packages, change opencode.json/configuration/providers, or bypass permission prompts.
No Svelte files should change; the Svelte MCP requirement therefore does not arise for B1.
Do not git add, commit, push, reset, clean, stash, or edit the AGENTS.md symlink.
Do not implement the next task, new settings, ledger storage, payroll formulas, or a parallel engine.
</action_safety>

<structured_output_contract>
End with:

1. What the helper does and its exported input/result contract.
2. Exactly which files you created/changed.
3. Verification commands and actual outcomes/counts, including any pre-existing warnings.
4. Any ambiguity, scope deviation or unresolved issue.
5. Confirm: no real data accessed, no database writes, no commits/pushes.

Leave the changes uncommitted and stop. The user will return the report to Codex for local review.
</structured_output_contract>
