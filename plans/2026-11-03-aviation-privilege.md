# Aviation privilege per employee: number, dates, withdrawal and renewal

**Status:** to do (approved 2026-11-03: the user answered Q-AV1, Q-AV2, Q-AV4, Q-AV6; Q-AV3, Q-AV5, Q-AV7 keep their defaults)
**Date:** 2026-11-03
**Goal:** Each employee holds a **privilege issued by the civil aviation authority**, with its own
**privilege number**, a **start date** and an **end date**. HR records it in the app, sees who is
valid, expiring, expired or has none, can **withdraw** ("take") it for a reason and **renew** it
for a reason. Every period stays in the history; nothing is deleted.

**Lane:** a separate agent, on its own branch `app/privilege` cut from `app/main` **after** the
pay plan's Phase 4 commit (`plans/2026-11-01-pattern-pay-holidays-missions.md`). One commit per
phase (plan file included). Resume point = the first unticked box.

**Before you start, read:** `CLAUDE.md` in full (§1 real personal data, §3 UI rules and Forms for
every `.svelte` change, §5 plans, §6 decisions log, §8 hand-off). Then
`plans/2026-11-01-employee-profile.md` (H5 documents, H8 access, H10 never delete): this plan
follows the same patterns.

---

## 0. Starting point (checked 2026-11-03)

- The employee profile lives on `/employees/[id]` with tabs (`PROFILE_TABS` in
  `src/lib/app/profile/labels.ts`: overview, management, schedule, personal, experience, skills,
  documents, custody, history), `?tab=` in the URL. Panels in `src/lib/app/profile/`
  (`DocumentsPanel.svelte` + `DocumentForm.svelte` are the closest model).
- Profile service: `src/lib/server/services/staff-profile/staff-profile.bl.ts` / `.crud.ts`
  (`getStaffProfile`, `setStaffDocument`, `saveCustodyItem`, `removeProfileItem`…). Schema:
  `src/lib/server/db/schema/profile.ts` (`staff_document`: `reference_no`, `expires_on`; the
  `removal` and `timestamps` column helpers).
- Nothing about an aviation privilege exists yet (no table, column, string or route).
- The newest migration on `app/main` is `0020_company_pay_holidays_constraints`. **Check
  `ls drizzle/*.sql` when you start**: the pay plan may add more; take the next free numbers.
- All three DBs (`attendance_app`, `_test`, `_e2e`) are at 21 migrations (2026-11-02).
- The privilege number is an **official ID number = personal data** (CLAUDE.md §1): never in
  code, tests, fixtures, commits, plans, docs or chat; tests use made-up numbers such as
  `TEST-0001`.

## 1. Decisions (approved or default; stop and ask before departing from one)

| # | Decision | Why |
|---|---|---|
| AV1 | **One aviation privilege per employee at a time**, identified by its **privilege number** from the aviation authority (text, letters / digits / dashes / slashes, at most 30). A privilege is held for a **period**: start date and end date, both inclusive | What the user described (2026-11-03): one privilege and its id, with start and end dates |
| AV2 | **History as periods.** Table `staff_privilege`: one row per period. **Granting** creates the first row; **renewing** creates a new row that points at the one it renews (`renews_id`), with its own dates, number and reason. Dates of a period are never edited after the fact, except through **Correct** (AV6) | A renewal must not hide the previous period; HR needs "valid from … to … then renewed for …" |
| AV3 | **Withdraw ("taken") for a reason:** sets `withdrawn_on` (the first day without the privilege), `withdrawn_reason` and `withdrawn_by` on the period in force. The date lies inside the period and may be in the past. A withdrawal is **not undone in place**: giving the privilege back is a **renewal** with its reason | Keeps a clear trail: taken on a date for a reason, given back on a date for a reason |
| AV4 | **Renew for a reason:** a new period starting **after** the previous one ends (the day after its end, or after its withdrawal date), or today if it has already ended. The number is prefilled with the previous one and may change. Periods of one person **never overlap** (database `EXCLUDE`) | Early renewal is just a new period that starts the day after the current one; no overlaps means "the privilege on a date" always has one answer |
| AV5 | **Status on a date** (pure function): `none` (never had one), `upcoming` (starts later), `valid`, `expiring` (valid, at most **30 days** left, Q-AV2), `expired` (ended, not renewed), `withdrawn` (withdrawn and not given back). Shown as a badge with the days left | One rule for the profile, the list and later checks |
| AV6 | **Correct a typo:** the period in force (or the last one) can have its number or dates corrected, **with a reason**; the audit row keeps before/after. Not for renewals or withdrawals | Typing mistakes happen; renewing to fix a typo would fake a history |
| AV7 | **A number belongs to one person:** the same number may appear on several periods of the **same** employee (renewals), never on two employees (`EXCLUDE` on number with different `staff_id`) | Catches typing someone else's number |
| AV8 | **Screens:** a **Privilege** tab on `/employees/[id]` (current period, status badge, days left, the history of periods with renewals, withdrawals and reasons; buttons Grant / Renew / Withdraw / Correct), the status badge on the profile **Overview**, and a list page **`/privileges`** (sidebar) with GET filters (status, department / team, search, "expiring within N days") and counts per status | HR checks one person on the profile and everyone on one page |
| AV9 | **Access:** viewing and editing need `staff.write` (like documents, profile H8); every write is audited; nothing goes to Odoo, exports or emails | Same rules as the other profile data; single local user until login (S8) |
| AV10 | **No effect on rosters or attendance** in this plan: a person without a valid privilege is only flagged (badge), not blocked from rosters, punches or pay (Q-AV4) | Blocking needs rules nobody has given yet; the flag shows the problem first |
| AV11 | **No scans and no hard delete:** the app records the number and dates, not a copy of the card (profile H5); periods are never deleted (template §6.6) | Scans are the most sensitive data; the trail stays readable |

Questions for the user (each default above is used until answered; record the answers here and
in `docs/decisions.html`, then change the decisions to `approved`):

| # | Question | Default |
|---|---|---|
| Q-AV1 | One kind of privilege, or several kinds per person (e.g. airside pass, ramp driving permit), each with its own number and dates? | one kind (AV1). **Answered 2026-11-03: one** |
| Q-AV2 | When does a privilege count as "expiring soon"? | 30 days before its end (AV5). **Answered 2026-11-03: 30 days** |
| Q-AV3 | Does a renewal usually keep the same number? | prefilled with the previous number, editable (AV4) |
| Q-AV4 | Should someone without a valid privilege be blocked or warned on the roster or the entry sheet? | flagged on the profile and `/privileges` only (AV10). **Answered 2026-11-03: flag only** |
| Q-AV5 | Must every active employee have one, or only some (by job title / work area)? | everyone may have one; `/privileges` lists people with none, no requirement rule |
| Q-AV6 | Withdrawal reasons: free text, or a fixed list (e.g. disciplinary, security, left the job)? | free text, required (AV3). **Answered 2026-11-03: free text** |
| Q-AV7 | Can a privilege be granted on the new-employee page, or only later on the profile? | only on the profile (the create page stays short) |

## 2. Data model

| Table / change | Columns and rules |
|---|---|
| `staff_privilege` (new, `schema/profile.ts`) | `id`, `staff_id` (FK `staff`, restrict), `privilege_no` (text, check `^[A-Za-z0-9/-]{1,30}$` after trim), `starts_on`, `ends_on` (date, check `ends_on >= starts_on`), `reason` (text, not blank: why granted / renewed), `renews_id` (uuid, null, FK `staff_privilege`, restrict), `withdrawn_on` (date, null; check `starts_on <= withdrawn_on <= ends_on`), `withdrawn_reason` (text; check: present and not blank exactly when `withdrawn_on` is set), `withdrawn_by` (FK `user`, set null), `created_by` (FK `user`, set null), timestamps. Index (`staff_id`, `starts_on`) |
| custom migration | `EXCLUDE USING gist (staff_id WITH =, daterange(starts_on, coalesce(withdrawn_on, ends_on + 1), '[)') WITH &&)`: one person's periods never overlap (a withdrawn one ends at its withdrawal); `EXCLUDE USING gist (privilege_no WITH =, staff_id WITH <>)`: a number belongs to one person (`btree_gist` is installed, migration 0001) |

Migrations: one generated (`pnpm db:generate`, read the SQL: it must add only this table) and
one custom (`drizzle-kit generate --custom`). Apply to `attendance_app_test` and
`attendance_app_e2e`; `attendance_app` only after a row count and **the user's OK** (CLAUDE.md
§4).

## 3. Rules in pure code (Vitest, no DB): `src/lib/workforce/privilege.ts`

- `effectiveEnd(period)`: the last day held (the day before `withdrawn_on`, else `ends_on`).
- `periodOn(periods, date)` and `privilegeStatus(periods, date, soonDays = 30)` →
  `{ state, period, daysLeft }` (AV5); `daysLeft` = days from `date` to the effective end
  (`daysBetween` in `#lib/roster/cycle.js`), 0 on the last day.
- `renewalDefaults(periods, today)` → `{ startsOn, privilegeNo }` (AV4).
- `checkRenewal`, `checkWithdrawal`, `checkCorrection` → issue codes the service turns into
  translated errors (`overlap`, `not_after_previous`, `outside_period`, `already_withdrawn`,
  `end_before_start`…).

| # | Case (made-up numbers) | Expected |
|---|---|---|
| T1 | No periods | `none` |
| T2 | 2026-01-01 → 2026-12-31, on 2026-06-01 | `valid`, days left 213 |
| T3 | Same, on 2026-12-15 | `expiring`, 16 days left |
| T4 | Same, on 2027-01-05 | `expired` |
| T5 | Starts 2026-12-01, on 2026-11-03 | `upcoming` |
| T6 | Withdrawn on 2026-07-01, on 2026-07-01 | `withdrawn`; effective end 2026-06-30 |
| T7 | Withdrawn, then renewed from 2026-09-01 | on 2026-08-01 `withdrawn`, on 2026-09-01 `valid` |
| T8 | Renewal defaults while valid until 2026-12-31 | starts 2027-01-01, same number |
| T9 | Renewal defaults after it expired | starts today |
| T10 | Renewal starting inside the current period | refused `overlap` |
| T11 | Withdrawal date outside the period, or on an already withdrawn one | refused |
| T12 | Correction that would overlap the next period | refused `overlap` |

## 4. Screens

- **`/employees/[id]` → Privilege tab** (add `privilege` to `PROFILE_TABS`, icon
  `IdentificationBadgeIcon`): a card with the current period (number in `<bdi dir="ltr">`, from –
  to, status badge, days left), buttons **Grant** (no period yet) / **Renew** / **Withdraw** /
  **Correct**, and a history list newest first (period, number, reason, "renewed from …",
  "withdrawn on … : reason"). Sheets: `PrivilegeFormSheet` (grant and renew: number, from, to,
  reason; renew prefilled from `renewalDefaults`), `PrivilegeWithdrawSheet` (date, reason),
  `PrivilegeCorrectSheet` (number, from, to, reason). Each sheet follows CLAUDE.md "Forms"
  (Superforms + Formsnap, `statusToasts`, `delayed`, one component per form).
- **Profile Overview:** the status badge and days left.
- **`/privileges`** (sidebar entry under the employees group): a GET filter form (status,
  department / team, search by name or employee number, "expiring within N days"), counts per
  status, and a table: person (link to the Privilege tab), number, from, to, status, days left.
- Every string through `m.*()` in `messages/en.json` and `messages/ar.json`, keys
  `privilege_*`; dates via `formatCalendarDate` in `<bdi>`; right to left checked.

## 5. Tasks

### Phase 0 · Confirm and record
- [x] 0.1 The user answers Q-AV1–Q-AV7 (or keeps the defaults); update §1 and add AV1–AV11 and
      the Q-AV rows to `docs/decisions.html` (group `profile`, status `approved` / `default`;
      `node --check` the script). **Done when** the decisions page lists them in both languages
      > note: 2026-11-03 the user answered Q-AV1 (one privilege), Q-AV2 (30 days), Q-AV4 (flag
      > only), Q-AV6 (free text). AV1, AV3, AV5, AV10 `approved`; the rest `default`. Q-AV3,
      > Q-AV5, Q-AV7 stay in the DEFAULTS table. Recorded by the planning agent.

### Phase 1 · Schema and migrations
- [ ] 1.1 Drizzle table `staff_privilege` (§2) + relations and types; generated migration; read the
      SQL. **Done when** `pnpm check` passes and the SQL adds only this table
- [ ] 1.2 Custom migration with both `EXCLUDE`s. **Done when** a rolled-back probe on `_test` with
      made-up staff refuses an overlapping period, the same number on a second person, a
      withdrawal outside the period and a withdrawal without a reason, and accepts a renewal
      the day after the end; 0 rows left behind
- [ ] 1.3 Apply to `_test` and `_e2e`; `attendance_app` after the row count and the user's OK.
      **Done when** all three show the same migration count and the real row counts are unchanged

### Phase 2 · Pure rules
- [ ] 2.1 `src/lib/workforce/privilege.ts` (§3). **Done when** T1–T12 pass

### Phase 3 · Schema and services
- [ ] 3.1 `#lib/schemas/privilege.schema.ts` (grant / renew, withdraw, correct; number format, to ≥
      from, reason required) + Vitest
- [ ] 3.2 `services/privileges/privileges.crud.ts` + `privileges.bl.ts`: `listPrivilegePeriods`,
      `grantPrivilege`, `renewPrivilege`, `withdrawPrivilege`, `correctPrivilege`,
      `listPrivilegeOverview(filters)`; `staff.write`; each write one `batch` with its audit row
      (`staff_privilege.grant|renew|withdraw|correct`, ids and dates; the number only inside the
      audit row's before/after, as documents do); `23P01` → translated `ConflictError`.
      **Done when** `pnpm check` and `pnpm test` pass

### Phase 4 · Employee page
- [ ] 4.1 Privilege tab, the three sheets, actions on `/employees/[id]/+page.server.ts`, Overview
      badge; autofixer clean on every touched `.svelte`. **Done when** the user confirms the §6
      steps 1–6 on `5174`

### Phase 5 · List page
- [ ] 5.1 `/privileges` with filters, counts and the table; sidebar link. **Done when** the user
      confirms §6 steps 7–8

### Phase 6 · Strings, checks, docs, hand-off
- [ ] 6.1 Every string in en + ar; `pnpm check && pnpm test`, eslint + prettier on touched code
      (**not** on plans: prettier breaks the `> note:` lines), autofixer clean
- [ ] 6.2 Docs: `plans/README.md` row, main plan pointer (S3, employee data), decisions approved
- [ ] 6.3 Playwright spec on `attendance_app_test` with made-up people; the user runs it

## 6. Manual check (by the user, on `http://127.0.0.1:5174`, `_e2e`)

1. A made-up employee → **Privilege** tab: "No privilege"; **Grant** with a made-up number,
   today → one year → the badge says Valid with the days left; Overview shows it too
2. **Grant** the same number to a second made-up employee → refused with a clear message
3. **Renew** → the sheet starts the day after the current end with the same number; save → the
   history shows both periods, the new one "renewed from …"
4. **Withdraw** with a date and a reason → the badge says Withdrawn from that date; the history
   shows the date and reason
5. **Renew** after the withdrawal → valid again from the new start; the history keeps the
   withdrawal
6. **Correct** a typo in the number with a reason → the number changes; the audit keeps the old one
7. `/privileges` → counts per status; filter "expiring within 30 days" and by team; a person's
   link opens the Privilege tab
8. `/ar/employees/<id>?tab=privilege` and `/ar/privileges`: right to left, dates in `<bdi>`, no
   English left

## 7. Not in this plan

- Blocking or warning on rosters, the entry sheet or pay for people without a valid privilege
  (Q-AV4).
- Several privilege kinds per person (Q-AV1), scans of the card, reminders by email, importing
  privileges from a file.
