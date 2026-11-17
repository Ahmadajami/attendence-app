# Reconcile teams and rosters, then complete attendance through 17 November

**Status:** in progress
**Date:** 2026-11-17
**Goal:** modify the existing app, review every team's dated Odoo baseline, clean shift/team references safely, and reconcile/import verified later attendance through 2026-11-17.

Full bilingual plan: [English / العربية](../docs/roster-reconciliation-rollout.html).
Companion to the configurable-rules, team-policy, build-handoff and Excel-reconciliation plans; no earlier plan is deleted or silently replaced.

## Decisions

- RC1 approved direction (user, 2026-11-17): keep the existing app; review each team's Odoo shift names, cycle, required hours and dated membership before cleanup. Preserve raw attendance and referenced history; propose archive/mapping changes for review rather than blanket deletion/re-import.
- RC2 confirmed scope (user): app attendance currently covers 2026-10-01–2026-10-20 only. User clarification: Odoo has no recorded attendance for 21–24 October, but its monthly October roster supplies the planned baseline for those dates. Use reception Excel for actual attendance, with employee-specific assignments and exceptions reviewed separately.
- RC3 planning boundary: validate 1–24 October, investigate each affected team's actual change from 25 October, and complete verified records through 17 November. Existing Guards/Operations night schedules retain their original dates. TP33 changes the night factor from 25 October; other new policies retain 1 November. No universal roster transition is assumed.

## Work and done-when gates

- [x] R-P Write the bilingual HTML rollout plan and tracked gates.
- [ ] R0 Source coverage and protection: user-run read-only inventory, app/Odoo/reception coverage by record kind and date, source conflicts, secure backup and tested recovery method reviewed. No real data is read by delegated agents.
- [ ] R1 Team review: approved secure review sheet for every in-scope team/group, including stable identity mapping, dated membership, named shifts, required minutes, cycle/anchor, off days, effective changes and individual exceptions; unknowns listed.
- [ ] R2 Cleanup preview and support: dependency crosswalk and approved rename/archive/dating actions, synthetic verification and recoverable production preview. No hard-delete or blanket attendance replacement.
- [ ] R3 Baseline acceptance 1–24 October: existing 1–20 records reconciled; missing 21–24 sources verified; duplicates/corrections resolved; required hours, roster and results explained per team/date. Any quarantined cases explicitly excluded from accepted scope.
- [ ] R4 Later roster review 25 October–17 November: actual attendance evidence compared with team-confirmed planned cycles, required hours and actual effective dates; gaps and incomplete current shifts remain explicit.
- [ ] R5 Controlled imports: existing services, repeat-import safety, corrections/undo, count preview, backup, production user OK, audit and post-import reconciliation complete for approved batches.
- [ ] R6 Capability and final acceptance: reviewed B2/B3/B4 capabilities as required, synthetic migration/constraint checks, automated tests and EN/AR RTL manual checks; no unexplained differences in accepted scope.

## Current build / next task

B1 accepted. B2.2 schema-only accepted; migrations 0029/0030 and synthetic DB tests remain pending. B2.3 is the current OpenCode task, awaiting actual diff/check review. Do not mark it complete from this plan or launch a concurrent implementation. Next prepare R0's read-only inventory brief after that review. Subsequent app services/UI and data work remain separate reviewed tasks.

## Execution limits

This plan authorizes no production writes, migration application, real-data reads, source moves or imports. Real-data scripts are written/tested synthetically; the user runs them locally with protected reports. Counts, dates and permitted record IDs only in public notes. Secure data remains outside the repository.

No commits/pushes unless asked. Production writes require an exact reviewed scope, backup/recovery, row-count check and user's explicit OK. Do not restart discovery already supported by approved evidence; reuse it with its effective-date limits.

## Pending evidence and manual checks

- [ ] Verify employee-specific mapping to the monthly October Odoo roster for 21–24 October and completeness of reception attendance for those dates. No Odoo attendance exists for this interval (user confirmation).
- [ ] Confirm source files through 17 November, including November gaps and correction precedence.
- [ ] Confirm each team's post-25 October change dates/cycle/required hours and unresolved identity mappings.
- [ ] Resolve cancellation overtime contribution, holiday/night interaction and missing normal-workday divisor before finalizing affected calculations.
- [ ] Synthetic DB: apply reviewed 0029/0030 in order, test finite/fractional minutes and adjacent/overlap ranges. No application has been performed by this planning task.
- [ ] Later EN/AR RTL manual acceptance on synthetic port 5174: roster/team history, rename/archive, attendance/import, settings and reports, including 24/25 October and 31 October/1 November boundaries. These checks await the corresponding implementation.
