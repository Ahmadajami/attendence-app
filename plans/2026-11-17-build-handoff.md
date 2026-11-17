# Build handoff: dated policies, overtime and annual-leave adjustments

**Status:** in progress
**Date:** 2026-11-17
**Goal:** implement the approved policies in small reviewed tasks using OpenCode Go, without requiring the conversation transcript or exposing employee data.

This is the compact handoff for a fresh session. Detailed history:
`plans/2026-11-17-team-policies-and-cancellation.md`, TP18–TP33, and `docs/decisions.html`.
It supplements the 13 November plan; it does not authorize a rewrite or production operations.

## Confirmed requirements

| Area                | Agreed behavior                                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dates               | Submitted new policies begin **2026-11-01**, except the night-overtime factor, which begins **2026-10-25** (TP33). Preserve earlier factor behavior and all historical rule versions; existing Guards/Operations night schedules are unchanged.                                                                                                                                                     |
| Attendance          | Preserve raw entry/exit events; sum recorded attendance segments. Show gaps without automatically classifying them as breaks. HR adds any paid credit separately.                                                                                                               |
| Reference           | Odoo employee Attendance Control Panel, action 398. Its Balance is an attendance/pay balance, not annual-leave entitlement. Use documented logic; OpenCode must not access live Odoo or real records.                                                                           |
| Leave debit trigger | **Separate authorized HR action**. Saving attendance credit alone must not debit annual leave.                                                                                                                                                                                  |
| Debit amount        | Exactly the approved credit minutes; no extra rounding.                                                                                                                                                                                                                         |
| Workday conversion  | Use the employee's required scheduled minutes for the affected day.                                                                                                                                                                                                             |
| Off-day conversion  | Use the employee's normal workday required minutes; HR may set a dated company override for all employees' off-day conversions. Default override is unset, not eight hours.                                                                                                     |
| Leave balances      | HR enters opening entitlements manually. Negative balances are allowed. Authorized HR approves deductions.                                                                                                                                                                      |
| Ledger              | Link each posted debit to its source credit. Record the applied divisor/version. Prevent duplicate posting. Preserve audit history; reverse a posted linked debit when its source is cancelled. No refund when no debit was posted.                                             |
| Overtime categories | Normal workday, weekly off day, night shift. Editable dated Settings; initial Odoo factors **1.25 / 1.50 / 1.50** respectively.                                                                                                                                                 |
| Night and date      | Night overtime follows the shift. Attribute an overnight shift to its start day in the configured timezone. Start-day weekly off uses the off-day rule; ordinary night work uses the night rule. Do not split at midnight, pick the highest rate or multiply overlapping rates. |
| Display             | Calculate overtime for everyone. HR hiding it preserves the calculation. Show actual overtime, factor, weighted overtime and premium separately: 20 × 1.25 = 25; premium 5.                                                                                                     |
| Cancellation        | HR specifies paid hours per event. User selected overtime eligibility, but its exact threshold/premium contribution still needs a rule. Preserve actual attendance separately.                                                                                                  |
| Grace/lateness      | Keep the inspected Odoo baseline, with dated settings. See `docs/odoo-control-panel-rules.md` when a task specifically needs those formulas.                                                                                                                                    |

The conversion override affects **annual-leave conversion on off days**, not required attendance
hours or overtime thresholds. A posted adjustment keeps its original divisor when settings change.

## Work order and boundaries

- [x] Write this handoff and the concrete B1 brief.
- [x] **B1 — pure leave-debit conversion:** execute [the B1 brief](briefs/2026-11-17-b1-leave-debit.md). Two new TypeScript files, synthetic tests, no database/UI integration.
- [x] Review B1's actual diff and rerun checks before assigning another task.
  > note: 17 focused tests; 612 total tests; 0 type errors; 1 existing warning.
- [ ] **B2 — dated settings:** B2.1 design direction and B2.2 schema reviewed. Next execute only [B2.3 pure resolver brief](briefs/2026-11-17-b2-3-pure-resolvers.md). Review before service/UI slices. Migrations 0029/0030 and synthetic DB checks remain pending; no migration application is authorized by B2.3.
- [ ] **B3 — leave ledger:** prepare a separate schema/service brief for posting, idempotency, audit, reversal and balance integration.
- [ ] **B4 — integration/display:** prepare a separate engine/UI brief for rule selection and actual/weighted overtime; preserve existing holiday handling and historical outputs.
- [ ] Synthetic integration and bilingual manual review; production changes need their existing separate approvals.

Only B1 is specified for execution now. B2–B4 are sequence placeholders, not instructions to
implement them together. Do not create database migrations as part of B1.

## Existing source anchors — confirm before editing

- `src/lib/leave/balance.ts`: current full-day entitlement balance, including existing two-decimal presentation; do not change it in B1.
- `src/lib/payroll/pay-rule.ts`: existing normal/off/holiday factors, inheritance and effective-date versions. Existing `otEnabled` affects calculations; it is not the requested hide-only UI behavior.
- `src/lib/roster/overtime.ts`: actual/rounded overtime helpers; preserve the separately approved rounding policy.
- `src/lib/attendance/day-result.ts`: daily calculation composition.
- `src/lib/server/db/schema/roster.ts`, `schema/leave.ts`: current storage, for later tasks only.
- `src/routes/(dashboard)/admin/settings/+page.svelte`: current settings screen, for later tasks only.

Avoid building a parallel payroll engine. B1 adds one small conversion helper for later integration;
it intentionally does not alter current full-day balances or round fractional leave days to two decimals.

## Still open — do not invent policy

- Cancellation credit's exact contribution to overtime thresholds and premiums.
- Holiday interaction with the new night category; retain existing behavior pending a scoped task.
- How to obtain a normal workday duration when roster data is missing. Until specified, return a typed unresolved/invalid result rather than choosing a number.
- Post-25 October roster reconciliation, Aleppo, office and guards' remaining policies are separate discovery tasks.

These do not block B1. They must not be resolved by guesses during implementation.

## OpenCode workflow

The user opens OpenCode in this repository and uses the existing **OpenCode Go** configuration.
`opencode.json` currently names `opencode-go/kimi-k2.7-code`; availability/entitlement is not verified
by this document. Keep the existing provider/authentication. No paid-provider substitution.

One brief per fresh OpenCode task. For B1, **leave changes uncommitted** for local Codex review;
do not commit/push even if an older workflow mentions doing so. This handoff does not authorize a
commit. Do not use `--auto`, permission bypasses or the delegation relay's default auto-approval.
Honor the committed permissions; use the interactive session for legitimate prompts.

The working tree already contains unrelated edits and new planning files. Record the starting
status; preserve those changes. Do not `git add .`, reset, clean, stash, switch branches, or stage
another person's work. Source and instructions remain available locally without pushing them.

For a new Codex review session, paste:

```text
Read CLAUDE.md and plans/2026-11-17-build-handoff.md.
Review the local OpenCode changes against plans/briefs/2026-11-17-b1-leave-debit.md.
Preserve pre-existing changes. Do not commit or push. Re-run the specified checks and report
whether B1 is accepted; do not start B2 until this review is complete.
```

## Safety and verification

- Synthetic data only. Do not read `.env`, secure folders, actual exports, old-module files or employee records. No Docker/SQL/Odoo calls or data extraction.
- Use RTK explicitly and graphify before broad exploration. Never use its Gemini backend.
- Follow CLAUDE.md, pnpm, `#lib` imports and existing pure-function conventions. No package/provider/config changes.
- B1 has no Svelte changes; later Svelte work must use the Svelte MCP and pass its autofixer.
- Gates are listed exactly in the B1 brief. Record actual outcomes and deviations, not assumed success.

## ملخص بالعربية

ابدأ بجلسة أوبن كود جديدة ومهمة B1 فقط: حساب تحويل دقائق خصم الإجازة واختباره بأمثلة وهمية.
لا حاجة إلى إرسال هذه المحادثة. تبقى التغييرات دون إيداع حتى مراجعتها محلياً. بعد قبولها نكتب
مهمة الإعدادات، ثم سجل الخصومات، ثم الربط والعرض. لا يقرأ أوبن كود بيانات الموظفين أو الملفات
الآمنة، ولا يشغل أوامر قواعد البيانات، ولا يغير الصلاحيات أو المزود.

## Team and roster reconciliation rollout

The user requested a full bilingual rollout plan: [tracked tasks](2026-11-17-roster-reconciliation-rollout.md) · [EN/AR HTML](../docs/roster-reconciliation-rollout.html). App attendance currently covers only 1–20 October (user confirmation). Odoo has no attendance for 21–24 October; use its monthly October roster for planned work and reception Excel for actual attendance. Reconcile teams/rosters through 24 October, then review actual group changes from 25 October through 17 November. Preserve existing Guards/Operations night schedules. This does not interrupt or accept the active B2.3 task and authorizes no data changes.

## Cloud checkpoint — 2026-11-17

This section supersedes earlier task-status wording above.

- B1 accepted: 17 focused tests.
- B2.1 design direction reviewed; B2.2 schema-only accepted.
- B2.3 accepted after local diff review and rerunning all brief checks: 29 focused tests, 629 total tests, 0 type errors, 1 pre-existing stepper warning; ESLint, Prettier and whitespace checks passed.
- Migrations 0029/0030 remain unapplied everywhere. Synthetic DB constraint and fractional round-trip tests remain pending. No production data changes are authorized by this checkpoint.
- Night-factor start: 2026-10-25 only (TP33); earlier Guards/Operations night schedules are preserved. Other new policies remain effective 2026-11-01. Start-day off-day precedence is already agreed; holiday/night interaction and cancellation overtime contribution remain unresolved.
- App attendance: 1–20 October only. Odoo has no attendance for 21–24 October; use its monthly October roster for planned work and reception Excel for actual attendance.
- Next task: prepare a bounded R0 read-only inventory/team-roster brief under the rollout plan. Do not start services/UI, apply migrations or execute real-data scripts automatically. The user runs real-data scripts locally and shares permitted aggregate results.
- Deferred leaver work: keep `scripts/end-leavers.ts` and supporting `scripts/odoo-only-badges.ts`. The leaver script is an unfinished batch-specific draft, not an approved resignation feature. It needs membership handling independent of current team_id, review of personal/pattern assignments and recomputation, proper business-service permission/audit boundaries, and synthetic tests. Do not execute it on real data.
- Evidence tooling: workforce inventory synthetic tests passed (8); airport-hours synthetic tests could not run in the reviewed Python environments because openpyxl was missing. No dependencies were installed and no extraction was executed.
- Preserve earlier plans and unrelated changes. No commits/pushes in a later agent session unless the user authorizes them. Use this handoff and the rollout plan as the cloud continuation context; do not assume the laptop database or secure files are accessible.
