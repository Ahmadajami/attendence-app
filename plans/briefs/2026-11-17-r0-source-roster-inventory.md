# R0 — source coverage and team-roster inventory

**Status:** to do
**Date:** 2026-11-17
**Goal:** extend existing read-only evidence tooling so the user can review source coverage,
stable employee mapping, dated team rosters and cleanup dependencies through 17 November 2026.
Produce evidence and review templates, not imports, roster changes or approved policies.

## Checkpoint and authority

Read `AGENTS.md` through its existing `CLAUDE.md` symlink, the **Cloud checkpoint** in
`plans/2026-11-17-build-handoff.md`, `plans/2026-11-17-roster-reconciliation-rollout.md`,
and `docs/roster-reconciliation-rollout.html`. The Cloud checkpoint supersedes older B2.3 status
wording in those documents. B1, B2.2 and B2.3 passed local review. Historical checks were 629 tests,
zero type errors and one existing stepper warning; these are not results of this task.
Migrations 0029/0030 remain unapplied and their database checks remain pending.

Brief preparation inspected branch `work`, commit `a0f5f87fae4027d7367b7e5e899bedbec6242456`,
with a clean starting tree. Local OpenCode must record its own branch, full HEAD and starting
status. Expected local branch is `app/main`; report a mismatch rather than switching/resetting.
Check the checkpoint files exist; if missing, stop and report rather than reconstructing them.
Use the existing isolated checkout; do not create a worktree. Preserve unrelated changes.

This brief is for review before implementation. Once assigned after review, do only R0 tooling
and synthetic checks, leave the diff uncommitted, report results and stop for review. Do not
commit, push, delegate or begin R1–R6/B2–B4. No provider/configuration changes or external LLM
backends. Use graphify/RTK if available; otherwise report their absence and inspect focused source
without installing them. Both were unavailable during brief preparation.

## Exact implementation boundary

Only these four files may be created or changed by the later implementation task:

- `tools/odoo/workforce_inventory.py`: factor reusable query/report helpers only as needed;
  preserve its existing CLI, exact matching rules and private-output guarantees.
- `tools/odoo/test_workforce_inventory.py`: synthetic regression tests for those changes.
- `tools/odoo/source_roster_inventory.py` (new): bounded read-only collector, pure report builders,
  secure review outputs and aggregate console summary.
- `tools/odoo/test_source_roster_inventory.py` (new): synthetic fixtures created in memory or
  temporary directories; mocked database/subprocess calls, no real records.

Inspect existing targets before creating them. If more files or dependencies must change, report
why and stop that part instead of widening scope. No application services, UI, schemas,
migrations, messages, package manifests, lockfiles, decision logs or other scripts may change.
Keep `scripts/end-leavers.ts` and `scripts/odoo-only-badges.ts` unchanged. The leaver script remains
unfinished deferred batch work, not an approved resignation feature; never execute it here.

Agents must not read `.env`, secure folders, actual workbooks/exports, old-module records or
credential files. No live database connections, Docker commands, Odoo calls, extraction, imports,
migrations, service startup or recomputation by agents, including “read-only” live queries.
The collector's real-data invocation is for the user locally **after its diff is reviewed**.
Synthetic tests must patch the execution boundary, not merely hope no database is running.

## Reuse first; implement only the gaps

Read the following code and its relevant tests before editing:

| Existing capability                                                                                                           | Reuse and limit                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workforce_inventory.py` and its tests                                                                                        | Reuse `snapshot`, `match_staff`, `private_directory`, `write_private`, CSV escaping and report approach. Snapshots use repeatable-read/read-only transactions ending in rollback, with timeouts and sanitized failures. Existing app evidence includes memberships, assignments, schedules, shifts and rules; Odoo includes monthly roster members, calendars and requirements. Current hierarchy is not history. It lacks app attendance coverage and complete dependency counts. |
| `infer_airport_hours.py` and its tests                                                                                        | Reuse clock/badge/segment helpers and incomplete/overlap handling; import lazily where `openpyxl` is needed. Do not copy a second clock parser. Existing `main` is October-only, selected roles/labels, first sheet, fixed layout and fixed paths/database. Do not call it as the all-team collector. Its current-role groups are not dated memberships; its descriptive duration buckets are not policy. Keep this file unchanged.                                                |
| `src/lib/roster/roster.ts`, `cycle.ts` and their tests                                                                        | Source contract: dated membership, inclusive start/exclusive version end, personal → team → nearest department inheritance; absence/override/holiday and own schedule exceptions. Record evidence needed by this resolver; do not create another payroll/roster engine in Python.                                                                                                                                                                                                  |
| `src/lib/server/services/roster/roster.crud.ts`                                                                               | Existing reads cover memberships, personal/team/department patterns, overrides, schedules and absences. Use as a schema/semantics reference only; importing it would open the app database.                                                                                                                                                                                                                                                                                        |
| `services/shifts/shifts.crud.ts`, `services/patterns/patterns.crud.ts`, `services/teams/teams.crud.ts` under `src/lib/server` | Shift usage already counts slot patterns, overrides and day results (the `events` metric means stored days, not punches). Pattern usage checks assignments; team counts use current active `staff.team_id`. These are partial guards, not a complete historical cleanup inventory.                                                                                                                                                                                                 |
| `services/punch-import/*`, `services/roster-import/*`, `services/imports.ts` under `src/lib/server`                           | Existing preview/replan, stale-preview checks, audit, commit/undo and batch lineage are later reuse anchors. Import matching uses app employee numbers, not automatically Odoo badges. R0 must expose the crosswalk gap; never invoke those services or implement replacement imports.                                                                                                                                                                                             |

Retain prior evidence and its scope instead of rediscovering approved requirements:
`plans/2026-11-17-team-policies-and-cancellation.md` TP11–TP17 and TP33,
`docs/airport-policy-register.md`, `docs/airport-hours-evidence.md`,
`docs/drivers-roster-evidence.md`, and referenced approved decisions.
TP11 confirms pre-25 October porters/cleaners at 540 minutes; TP13 confirms named flight groups'
weekly requirements without inventing daily conversion. TP15 confirms distinct regular FlyDubai
and Security daily/rest requirements. TP16/TP17 confirm Lost & Found's October requirements,
individual rest days and 10:00–21:00 planned times. Preserve their precise approved ranges and
exceptions. TP8/TP12 and post-change durations remain evidence/proposals where not superseded by
approval. A name-only driver candidate remains unresolved. Never extend an earlier approval to
later dates just because an attendance span looks similar.

## Collector interface and safety contract

Implement this explicit interface (the commands below are a proposed interface, not existing
verified commands): `--from YYYY-MM-DD --through YYYY-MM-DD --app-db NAME --odoo-db NAME
--reception-root PATH --output-root PATH`, plus optional `--prior-evidence PATH` for a reviewed
existing workforce `evidence.json`. Support `--help` without contacting databases or opening
source files. Default date scope may be 2026-10-01 through 2026-11-17; require explicit source
paths/database names for a real run. Reuse current container/user routing from `snapshot`;
validate inputs and do not interpolate arbitrary SQL identifiers or caller-supplied SQL.

Validate dates and path safety before collection. Use bounded static SELECT queries only, no
writes, DDL or app-service calls. Inventory unavailable schema/table/column sections explicitly
as `unavailable`, never as zero; do not apply migrations to make a query succeed. Do not depend
on 0029/0030 fields. Separate source capture times: independent app/Odoo snapshots are not one
cross-database transaction. Prior evidence needs source/date/capture provenance; reused sections
must be labelled historical, never presented as a fresh snapshot. Do not overwrite prior reports.

Use existing secure output helpers, directories 700/files 600, exclusive file creation, and
sanitized exceptions. Reject symlink/path escapes and output inside the repository. In synthetic
privacy tests mock the secure root with a temporary directory; never touch the real secure tree.
No names, badges, emails, paths, workbook titles, cell values or raw database errors on stdout or
stderr. Share only a whitelisted aggregate summary; permitted IDs require explicit user selection.
The existing tools' path-printing behavior is not a requirement for the new collector.

## Coverage matrix: record kind and date, not a single min/max

All dates below are inclusive review dates in Asia/Damascus; preserve raw UTC instants alongside
local date/shift-start attribution. Use an exclusive upper bound of 18 November for the cutoff.
An overnight shift beginning 17 November can end on 18 November: show its cutoff status and
incomplete/next-day evidence explicitly, without inventing punches or extending accepted scope.

| Source / record kind                                                                                        | Coverage requirement                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App employees, departments, teams                                                                           | Inventory stable IDs and active/inactive state; distinguish current state from historical evidence. No inferred historical membership from current team/department.                                                                                                                                                                                            |
| App dated memberships, pattern assignments, schedules, shifts/cycles, overrides, holidays/exceptions, swaps | Capture versions overlapping 1 October–17 November, including versions starting earlier and still effective. Flag gaps/overlaps and unknown historical department ancestry rather than backfilling.                                                                                                                                                            |
| App raw attendance, corrections/voids, absences, credits/HR adjustments, calculated day results             | Separate kinds, source/status and dates; app attendance currently covers 1–20 October only (user-confirmed, not newly measured). Inventory any later evidence without claiming it exists. Stored results/credits never prove raw attendance coverage.                                                                                                          |
| App import batches/rows and audit references                                                                | Separate batch creation timestamp from dates in parsed/source records; include status, target IDs and lineage without treating a previewed/undone batch as attendance.                                                                                                                                                                                         |
| Odoo employees, roster headers/member lines, calendars, shift patterns, configured/daily requirements       | October monthly roster supplies planned baseline through 24 October after employee/exception checks. Review later dated planning evidence separately; current fixed schedule/current job is not historical proof.                                                                                                                                              |
| Odoo recorded punches and HR adjustments                                                                    | Separate actual inputs from planned `roster_line` rows, computed actual-minute columns and credits. Earlier approved evidence covers attendance through 20 October; no Odoo attendance exists for 21–24 October. Mark that interval confirmed absent for this kind, not a missing planned roster. Any later actual coverage needs its own source verification. |
| Reception daily, correction and range workbooks                                                             | Inspect actual rows, all sheets and validated headers through 17 November. Reuse known layout helpers where compatible; unknown layouts become blocked sections. Existing October evidence reports 21–31 October for examined groups, not all-team completeness or November coverage.                                                                          |

For each source/kind/date/team-or-unresolved-group emit raw row count, distinct identified people,
distinct person-dates, first/last observed dates, explicit missing dates, incomplete/invalid rows,
identity quarantine count, duplicates/conflicts and capture provenance. Preserve unassigned and
unknown groups so totals reconcile. Distinguish `present`, `confirmed_absent`, `missing_source`,
`unavailable`, `unverified` and `not_applicable`. No row is not automatically absence or rest.
Count multi-day intervals by overlap without summing them as punches. Dependency counts below
must cover all retained history/future references, not just this coverage interval.

Workbook inventory must retain private file fingerprint, sheet, row, source kind and row date;
record header/layout validation and formula cells lacking cached values. Detect identical files,
repeated rows/person-dates, differing corrections and partial/overlapping pairs. Do not trust dates
or correction priority from filenames, file timestamps or directory presence. Preserve original
segments, next-day exits and midnight-split evidence. Mark correction lineage proposed/unresolved
until locally approved; never silently merge sources, pick the latest file or add correction
attendance on top of the original. No-punch/invalid rows are not zero attendance. Segment gaps
stay visible and unclassified; no break, paid credit or overtime inference.

## Identity and dated group mapping

1. Preserve stable app UUID and Odoo employee ID privately, with source record references.
2. Reuse exact legacy-badge matching; fall back to app employee number only when legacy badge is
   absent, never when a supplied legacy badge fails. Cross-check existing `odoo_id`.
3. Reuse the workbook-only four-digit/hyphen/three-digit normalization; preserve leading zeros
   and original values privately. Reject normalized collisions rather than broadening matching.
4. Quarantine missing keys, unmatched/duplicate badges, shared Odoo claims, external-ID conflicts
   and workbook rows with multiple candidates. No fuzzy/exact-name match can approve identity.
   Missing workbook IDs stay unresolved even if names appear unique.
5. Keep inactive people and unmatched source-only people in the inventory. Distinguish current
   roles, workbook attendance groups and dated formal teams; no automatic team transfer or
   backward application of today's hierarchy. Missing team can legitimately inherit a personal
   or department pattern. Ambiguous dated membership is unresolved, not “first row wins”.
6. Record mapping status/method, valid dates, confidence, evidence and reviewer. Only unique,
   approved mappings may be proposed for future processing; R0 performs none.

## Private team review sheet and proposal template

Generate one sheet per verified team/group, plus unresolved-group sheets, with separate intervals
for baseline 1–24 October and actual changes 25 October–17 November. Split at real membership,
assignment or policy boundaries; do not assume all teams changed on 25 October.
Include Operations, Guards, drivers, cleaners, porters, airline groups, Lost & Found, office and
Aleppo where present; do not manufacture groups missing from verified sources.

Each review row must contain:

- Stable team/group/source IDs, proposed EN/AR label, formal team versus attendance group,
  employee crosswalk and dated membership start/end, joiners/leavers and unresolved mapping.
- Original shift/pattern IDs and names/codes; proposed meaningful EN/AR shift names, planned
  start/end, overnight/end-day flag, timezone, span and **separate required minutes**.
- Cycle type, ordered slots, length, anchor date, per-person phase/crew start, weekly rest days,
  effective interval and evidence needed to validate generated work/off dates. Label candidate
  cycles explicitly; R0 does not implement a second resolver or approve an inferred cycle.
- Personal/team/department assignment source, own off-days, one-off overrides, holiday handling,
  absence/swaps, breaks/grace/credits and policy exceptions with separate evidence/status.
- Required-minute policy reference, approval status and effective range; original configured
  value versus approved value versus unresolved candidate. Do not replace null with eight hours,
  zero or observed clock duration, or conflate off-day leave conversion with required attendance.
- Baseline and first observed change dates, actual team-confirmed effective date (blank until
  approved), source row references, conflicts, confidence, reviewer/approval and open questions.

Preserve original Guards/Operations night schedules and dates. Only the new night-overtime
factor begins 25 October; other new policies begin 1 November. These dates do not schedule a
universal roster transition. No new numerical policy or payroll calculation is part of R0.

## Dependency inventory before any rename/archive proposal

Read existing schema declarations (including non-FK arrays/JSON) without opening a database.
Produce private counts by old shift/team/pattern ID and dependency kind, distinct rows, dated
usage, active/inactive/cancelled status and direct versus transitive references. Include zeros
only for successfully queried kinds; unknown dependency counts block an “unused” conclusion.

- Shifts: distinct patterns referencing slots, slot occurrences separately, default-work-shift
  references (not covered by the current slot-only usage check), overrides including cancelled
  history, stored day results, and import creation/row target/parsed references.
- Teams: current staff pointers (active and inactive separately), all dated membership history,
  past/current/future pattern assignments, supervisor history, attendance-event team references,
  stored day results and indirect per-person overrides/absences/credits for affected date ranges.
- Patterns: all assignment targets/versions, pay rules, holidays/exceptions, pattern-linked
  absences/missions, import references, and dependent shifts/stored-result or audit references
  where actually recorded. Preserve audit/JSON references; do not invent FKs that do not exist.
- Inspect `src/lib/server/db/schema` for additional references and record a checked table/column
  manifest. Count actual available references, including import JSON/target IDs and cancelled
  rows. Distinguish unsupported/missing fields from no references. No arbitrary JSON search may
  be represented as an exhaustive dependency proof.

Generate a **proposal-only** crosswalk: old ID → retained ID or no proposed mapping, existing and
proposed EN/AR name, semantic equivalence/differences, required minutes, span/end-day, cycle role,
dated use, dependency counts, reason and approval status. An example naming structure is
“[confirmed role] day/night [confirmed times]”; do not prefill invented duty times or rename real
records. Different requirements/span/cycle need a dated change, not cosmetic relabelling.
An empty current team or zero current assignments is not proof of no historical references.
Never delete, merge, rename, deactivate or unassign anything in R0. Later archive support needs a
separate audited service task; present team deactivation can clear current pointers.

## Deliverables and protection gate

Each new secure run directory contains `coverage.csv`, `identity-review.csv`,
`team-roster-review.csv`, `dependencies.csv`, `proposals.csv`, `issues.csv`, `evidence.json`,
`summary.json` and a local HTML index. CSVs reuse formula protection, quoting and multiline safety;
HTML escapes source labels. Detailed values remain private. Include schema version, tool revision,
source capture times, requested range, measured versus prior evidence and limitations.

Console JSON contains only coverage/status counts by date and record kind, identity outcome
counts, issue counts and aggregate dependency totals. Reconcile raw totals to accepted/quarantined/
invalid/duplicate classifications without silently dropping records or double-counting corrections.
Private details, filenames, hashes, team labels and review notes are excluded from shared output.

Create a recovery-review section in the report: backup coverage, protected location (private),
capture time, isolated restore target, verification/count comparison, reviewer and last successful
restore evidence. Default each unverified field to pending. R0 scripts do not create backups,
restore, copy/move sources or validate recoverability by assertion. The user must review an
existing or separately authorized backup/restore method before the rollout R0 protection gate
can close; no production write is authorized by producing this report.

## Synthetic tests and implementation verification

Use generated fake identifiers/labels and in-memory records/workbooks; mock every snapshot and
subprocess boundary. Include tests for:

- Existing matching regressions plus leading zeros, normalized collisions, conflicting external
  IDs, shared claims, inactive/source-only people and blank-ID unique-name refusal.
- Per-kind gaps despite broad min/max, planned roster without punches on 21–24 October, stored
  results/credits without raw events, unavailable sections versus zero, and unassigned totals.
- Versions/memberships crossing the requested range, exclusive ends, individual exceptions,
  personal/department inheritance evidence and preserved earlier Guards/Operations night dates.
- Boundary dates 20/21 and 24/25 October, 31 October/1 November and 17/18 November overnight;
  never derive required minutes from 9/12-hour attendance spans or infer a universal change date.
- Daily/correction/range duplicates, content dates differing from filenames, multiple sheets,
  unsupported headers, missing cached formula values, incomplete/overlapping/midnight segments,
  unidentified rows and unresolved correction precedence without mutation.
- Historical/future dependencies, default-work-shift references, repeated slots counted both as
  occurrences and distinct patterns, stored days versus punches, import JSON/targets and team
  history with zero current active members. Unknown counts must block “unused”.
- Read-only transaction/rollback/timeouts using mocked execution; prior evidence provenance;
  failures produce sanitized output. Help and rejected arguments must never call collectors.
- Temporary secure-root checks, path/symlink escapes, exclusive outputs, file modes, CSV formula
  injection/quoted multiline labels, HTML escaping and a sentinel ensuring no sensitive labels,
  paths or IDs leak into console output/errors. No real-data fixtures or tracked reports.

From the repository root, the implementer runs only synthetic/source checks:

```bash
python3 -P -m unittest discover -s tools/odoo -p 'test_*inventory.py'
python3 -P -m unittest discover -s tools/odoo -p test_infer_airport_hours.py
pnpm check
pnpm test
pnpm exec prettier --check plans/briefs/2026-11-17-r0-source-roster-inventory.md
git diff --check
```

The airport helper tests need `openpyxl`; the checkpoint records that dependency as missing in
the reviewed Python environments. Check import availability without accessing workbooks. If
missing, report that suite unrun; do not install packages/change manifests or replace meaningful
assertions with passing stubs. Run all available standard-library inventory tests regardless.
Prettier/ESLint do not validate Python; do not claim they do. No Svelte files are permitted, so no
Svelte autofixer or browser/server/database checks are required. Record actual test counts,
commands, skipped/unrun checks and deviations. App checks are regression checks, not proof of
real-source coverage or of the pending migration constraints.

## User-run local command, only after implementation review

The following command is for the user, not OpenCode or a cloud agent. It does not exist until
this brief is implemented and accepted. Run from the local repository on the reviewed checkout,
using existing local database access; do not paste credential values into chat. Verify the named
app/Odoo databases and reception root locally first. If sources/services are unavailable, stop
and report the missing prerequisite; do not let the agent start Docker or retrieve records.

```bash
umask 077
python3 -P tools/odoo/source_roster_inventory.py \
  --from 2026-10-01 --through 2026-11-17 \
  --app-db attendance_app --odoo-db syravia_dev \
  --reception-root "$HOME/secure/syravia/imports" \
  --output-root "$HOME/secure/syravia/inventory/r0"
```

The collector must scan supported reception workbooks below the selected input root with an
explicit source manifest, reject unsupported/unsafe entries visibly, and never read sibling
secure folders. The user narrows this root if it contains unrelated material. A prior workforce
`evidence.json` may be supplied with `--prior-evidence` after local provenance review; do not
assume a timestamp/path or rerun old discovery solely to duplicate approved evidence.

User reviews private reports locally, confirms source completeness and correction priority,
resolves quarantined identities and fills the team approval/recovery fields. Share only the
whitelisted aggregate console output, dates and explicitly permitted IDs, never the secure
reports or full logs. November coverage and team changes remain pending until reviewed.
No imports, migration commands, backup/restore execution, app server or leaver script are part
of this invocation. Migrations 0029/0030 remain separately pending after R0.

## Done when and unresolved questions

- [ ] Only the four allowed implementation files changed; original scripts/CLI safeguards and
      approved historical evidence are preserved. No application/data operations or commits.
- [ ] Synthetic tests demonstrate the coverage, identity, team-review, dependency and privacy
      contracts above; actual check outcomes and any missing dependency are reported.
- [ ] The user has reviewed the implementation diff before any real-data command is run.
- [ ] After the user-run inventory, coverage by kind/date, missing sources, conflicts, identity
      quarantine, team review templates and dependency completeness are reviewed. Do not tick
      rollout R0 merely because tooling exists; R1 team approval remains a separate task.
- [ ] Backup/recovery method and restore evidence are reviewed locally; until then the rollout
      R0 protection gate remains pending and no cleanup/import may proceed.
- [ ] Stop for Codex/user review. No automatic dispatch or execution of the next task.

Questions to retain, not answer by guessing:

- Are reception sources complete for every team for 21–24 October and November through
  17 November, and which corrections supersede which originals?
- Which dated membership/department changes and employee exceptions are confirmed? What stable
  identifier resolves each ambiguity, including name-only driver candidates?
- What are each affected team's real post-25 October change date, cycle/anchor, required minutes,
  rest days, breaks and duty times? Preserve earlier approved ranges until explicitly revised.
- Which schema sections and historical references are actually available locally without
  0029/0030, and which dependency counts remain unverified?
- What protected backup and isolated restore verification meet the rollout protection gate?
- Cancellation overtime contribution, holiday/night interaction and the normal-workday divisor
  when roster evidence is missing remain unresolved later-policy questions; R0 must not settle
  them or accept payroll results for affected unresolved cases.
