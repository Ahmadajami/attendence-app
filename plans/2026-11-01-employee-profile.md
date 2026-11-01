# Employee profile: names, contacts, experience, skills, documents, job

**Status:** in progress (approved 2026-11-01; defaults Q-H1–Q-H7 in use until answered)
**Date:** 2026-11-01
**Goal:** Extend each employee's record beyond what the roster needs, as the user asked
(2026-11-01), in this order: (1) first and last name in Arabic and English; (2) emergency
contacts; (3) experience; (4) skills; (5) required documents and how many were received; (6) job
title, work email, personal email and social media accounts, work experience; added the same day:
(7) items in the employee's custody (phone, SIM line, uniform…) and their condition. HR enters and
keeps these in the app (main plan D25); nothing is sent to Odoo.

**Lane:** A, branch `app/main`. One commit per phase (plan file included). Read `CLAUDE.md`
first: §1 (real personal data), §3 "UI rules" and "Forms" for every `.svelte` change, §6 decisions
log. Resume point = the first unticked box.

---

## 0. Starting point (checked 2026-11-01)

- `staff` has `employee_no`, `full_name`, `full_name_ar` (one field per language), `phone`,
  `function_id` (lookup `staff_function`: ramp, baggage, check-in… = the **work area**),
  `department_id`, `team_id`, `work_email` (Odoo sends attendance emails there, D26),
  `start_date`, `active`, `odoo_id`. No job title, emergency contact, experience, skills,
  documents, personal email or social accounts.
- `full_name` / `full_name_ar` are read in **37 files** (lists, previews, entry sheet, rosters,
  imports, audit labels) and are what the Odoo seed (`employees.csv`: `name`, `name_ar`) fills.
- The staff service is the older single-file `src/lib/server/services/staff.ts` (not yet split
  into `*.bl.ts` / `*.crud.ts`). The create/edit form is `StaffFormSheet.svelte` (261 lines).
- Every new field here except the job title is **personal data** (CLAUDE.md §1); emergency
  contacts are data about **third persons**; documents may hold ID numbers. Tests, fixtures,
  plans and commits use made-up people only.

## 1. Decisions (defaults; stop and ask before departing from one)

| # | Decision | Why |
|---|---|---|
| H1 | **Names:** add `first_name_en`, `last_name_en`, `first_name_ar`, `last_name_ar`. `full_name` / `full_name_ar` **stay** the display names everywhere; when first and last are given, the service sets the full name to "first last" in that language. Seeded rows keep their full name until HR fills the parts. **No automatic splitting** of existing names | Nothing of the 37 readers changes; the Odoo seed has one field; Arabic names often have more than two parts, so a split by space would be wrong (Q-H1) |
| H2 | **Emergency contacts:** own table `staff_emergency_contact` (name, relationship, phone, second phone, order), any number per person, none required | More than one is common; a table keeps the history and order |
| H3 | **Work experience:** own table `staff_experience` (employer, job title, from, to, note), any number. "Years of experience" is **computed**: earlier jobs (overlaps counted once) + time here since `start_date`. Item (3) "experience" and item (6) "work experience" are taken as **the same thing** (Q-H2) | One source; a typed "years" number would go stale |
| H4 | **Skills:** a managed list `skill` (name en/ar, active) and `staff_skill` (person, skill, optional level 1–3). "Social skill" is read as **skills in general** (soft skills, languages, certificates as skills) (Q-H3) | A list HR controls gives clean filters and reports; free text can't be counted |
| H5 | **Documents:** a managed list `document_type` (name en/ar, **required** yes/no, active) and `staff_document` (person, type, received yes/no, received on, document/reference number, expires on, note). The profile shows "**received 3 of 5 required**". **No file uploads**: the app records that a paper was received, not the scan (Q-H4, Q-H5) | Scans of IDs are the most sensitive data there is; storing files needs storage, backups and access rules that come with login (S8) |
| H6 | **Job title:** a managed list `job_title` (name en/ar, active) and `staff.job_title_id`, **separate from** `function` (work area) (Q-H6) | Title (e.g. supervisor) and area (e.g. ramp) are different questions in reports |
| H7 | **Contact fields:** `staff.personal_email` (format check); `work_email` and `phone` stay as they are. **Social media:** `staff_social_account` (platform, handle or URL), any number, all optional | The user's list; optional because not everyone has or wants to give them |
| H8 | **Access and privacy:** viewing and editing the new fields needs `staff.write` (as now; single local user until S8). A separate `staff.personal` key for contacts, social accounts and documents comes **with login (S8)**. Every write is audited (`audit_log` keeps before/after inside the app DB). None of it goes to Odoo, exports or emails unless a later plan asks | CLAUDE.md §1; no permission split is useful while there is one user |
| H9 | ~~**UI:** one sheet per group~~ **replaced by H12** (2026-11-01). The create sheet stays short (names en/ar first + last, employee number, department, team, job title). `/employees/[id]` gets a **Profile** card with one sheet per group (names & job, contacts, experience, skills, documents). The three lists (job titles, skills, document types) are managed on one page `/staff-lists` (`staff.write`) | A 30-field sheet is unusable; groups match the user's numbered list |
| H10 | **Never hard-delete:** contacts, experience rows, skills, social accounts and custody items get `removed_at` (+ `removed_by`); list items are deactivated | Template rule §6.6; the audit trail stays readable |
| H11 | **Custody** (user, 2026-11-01): a managed list `custody_item_type` (phone, SIM line, uniform…) and `staff_custody_item` (type, identifier: serial / IMEI / line number / size, issued on, **status** `with_employee` \| `returned` \| `lost` \| `damaged`, status date, note). The status changes in place; `audit_log` keeps every earlier status (Q-H7) | The user's request; a list keeps counts clean; the audit log already is the history |
| H12 | **Profile as tabs** (user, 2026-11-01): the Profile card uses `UnderlineTabs` (Overview, Names & job, Contacts, Experience, Skills, Documents, Custody), each tab with its list next to its form, instead of H9's sheets | The user's choice: read and edit in one place |

Questions for the user (each default above is used until answered):

| # | Question | Default |
|---|---|---|
| Q-H1 | Arabic names: first + last only, or also father's / grandfather's name? | first + last only (H1) |
| Q-H2 | Are "experience" (item 3) and "work experience" (item 6) the same, or is item 3 something else (e.g. years in the field, a level)? | the same: a list of past jobs + computed years (H3) |
| Q-H3 | "Social skill": soft skills only, or skills in general (languages, licences, certificates)? | skills in general, from a managed list (H4) |
| Q-H4 | "Document received number": the **count** received (3 of 5), or each document's **reference number** (ID / certificate number)? | both: the count on the profile, a reference number per document (H5) |
| Q-H5 | Should the app store **scans** of the documents? | no, only received / date / number (H5) |
| Q-H6 | Is the job title different from the existing "function" (ramp, baggage…)? | yes, a separate list (H6) |
| Q-H7 | Custody conditions: with the employee, returned, lost, damaged — any other? | these four (H11) |

---

## 2. Data model

| Table / column | Columns |
|---|---|
| `staff` + | `first_name_en`, `last_name_en`, `first_name_ar`, `last_name_ar` (text, null), `job_title_id` (FK `job_title`, null, restrict), `personal_email` (text, null, check `~ '^[^@\s]+@[^@\s]+$'`) |
| `job_title` | `id`, `name_en` (unique), `name_ar`, `active`, timestamps |
| `skill` | `id`, `name_en` (unique), `name_ar`, `active`, timestamps |
| `document_type` | `id`, `name_en` (unique), `name_ar`, `required` (bool), `active`, timestamps |
| `staff_emergency_contact` | `id`, `staff_id`, `name`, `relationship`, `phone`, `phone_2` (null), `position` (smallint), `removed_at`, `removed_by`, timestamps |
| `staff_experience` | `id`, `staff_id`, `employer`, `job_title` (text), `started_on`, `ended_on` (check ≥ start), `note`, `removed_at`, `removed_by`, timestamps |
| `staff_skill` | `id`, `staff_id`, `skill_id`, `level` (1–3, null), `removed_at`, `removed_by`, timestamps; unique (`staff_id`, `skill_id`) where not removed |
| `staff_document` | `id`, `staff_id`, `document_type_id`, `received` (bool), `received_on` (null; required when received), `reference_no` (null), `expires_on` (null), `note`, timestamps; unique (`staff_id`, `document_type_id`) |
| `staff_social_account` | `id`, `staff_id`, `platform` (text), `handle` (text: handle or URL), `removed_at`, `removed_by`, timestamps |
| `custody_item_type` | `id`, `name_en` (unique), `name_ar`, `active`, timestamps |
| `staff_custody_item` | `id`, `staff_id`, `item_type_id`, `identifier` (null), `issued_on`, `status` (check in the four), `status_on` (null; ≥ `issued_on`), `note`, `removed_at`, `removed_by`, timestamps |

## 3. Tasks

### Phase 1 · Schema and migration
- [x] 1.1 Schema in `src/lib/server/db/schema/workforce.ts` (or a new `profile.ts`, exported from
      `index.ts`): the columns and tables of §2, relations, types.
      > note: `job_title` + staff columns in `workforce.ts`; the other 8 tables in `profile.ts`.
- [ ] 1.2 `pnpm db:generate` (only new tables and columns, so no rename prompt) → read the SQL →
      a custom migration for the partial unique indexes if drizzle can't express them. Count
      `staff` rows in all three DBs first.
      **Done when** the migration ran on `_test` and `_e2e` (no need to ask) and on
      `attendance_app` after the row-count check **and the user's OK**; existing rows unchanged
      (new columns null)
      > note: `drizzle/0010_employee_profile.sql` generated (10 tables, 6 staff columns; the partial
      > unique index is plain drizzle, no custom SQL). Not applied yet: the DB container was down
      > and agents can't reach Docker. Waiting for the user to start it (row counts, then migrate).

### Phase 2 · Pure helpers (`src/lib/workforce/profile.ts` + Vitest; no DB or SvelteKit imports)
- [x] 2.1 `displayName(first, last)` per language (H1; trims, `null` when either part missing).
- [x] 2.2 `experienceMonths(jobs, startDate, today)`: merge overlapping past jobs, add time here
      (H3); `formatExperience` → years + months.
- [x] 2.3 `documentSummary(types, documents)` → `{ required, received, missing[] }`, required
      types only, inactive types ignored (H5).
- [x] 2.4 Tests with **made-up** people: overlapping and touching jobs, a job ending after
      `start_date`, open-ended dates, no jobs; documents with an inactive required type; names
      with extra spaces.
      **Done when** `pnpm test` is green
      > note: also `resolveNames` (both parts → "first last", none → keep, one → error field) and
      > `custodySummary`; months are counted per calendar month. 18 tests; `pnpm test` 202/202.

### Phase 3 · Schemas and services
- [x] 3.1 `src/lib/schemas/staff-profile.schema.ts`: names & job, personal email, contact,
      experience row, skill, document, social account; list items (job title, skill, document
      type). Exported schema types.
- [x] 3.2 `services/staff-profile/staff-profile.{crud,bl}.ts`: get the profile; set names & job
      (also sets `full_name*`, H1); add / edit / remove (soft) contacts, experience, skills, social
      accounts; set a document's state. `staff.write`; audit every write; `batch([...writes,
      auditInsert])`; `AppError` subclasses.
- [x] 3.3 `services/staff-lists/staff-lists.{crud,bl}.ts`: create / rename / (de)activate job
      titles, skills, document types (unique English name → `ConflictError`).
- [x] 3.4 `staff.ts`: create takes first/last names and job title (H9); the staff list shows the
      job title.
      > note: lists schema in its own `staff-lists.schema.ts` (one schema file per service). Custody
      > (H11) is in the same service: `saveCustodyItem`, kind `custody` for removal, list kind
      > `custody_item_type`. Forms and actions live in `#lib/server/profile-forms.ts`.

### Phase 4 · UI
- [x] 4.1 `StaffFormSheet`: first and last name (en/ar) instead of the two full-name fields for
      new people; job title `Select`; existing people without parts still edit their full name.
- [x] 4.2 `/employees/[id]` **Profile** card: summary lines (job title, years of experience,
      "documents 3 of 5", contacts count) and one sheet per group: names & job, contacts
      (emergency contacts + personal email + social accounts), experience, skills, documents.
      > note: built as tabs (H12) instead of sheets, plus a Custody tab (H11). Personal email sits
      > with names & job title (the user's item 6 groups them), not under contacts.
- [x] 4.3 `/staff-lists` (sidebar entry, phosphor icon, `localizedHref`): three cards for job
      titles, skills, document types (with the "required" switch); `Empty` state.
      > note: a fourth card for custody item types (H11).
- [ ] 4.4 en + ar strings (`profile_*`, `staff_lists_*`), RTL checked in `/ar`; phone numbers,
      emails, URLs and reference numbers in `<bdi dir="ltr">`.
      > note: strings and `<bdi>` done; the `/ar` check is part of 5.1 (the user's).
- [x] 4.5 `svelte-autofixer` on every touched `.svelte` until clean; `pnpm check`; eslint +
      prettier on touched files; `pnpm test`.
      > note: autofixer clean on every touched `.svelte` (only the generic "attachment instead of
      > `use:enhance`" hint left); `pnpm check` 0 errors; eslint clean; 202 tests pass.

### Phase 5 · Verify
- [ ] 5.1 Manual check **by the user** on `attendance_app_e2e` (port 5174, `--mode e2e`), made-up
      people only: create a person with first/last names in both languages → the lists show
      "first last"; add two emergency contacts, two past jobs (one overlapping) → years shown;
      add skills; set 2 of 3 required documents received → "2 of 3"; add a personal email and a
      social account; remove a contact → gone from the profile, still in `audit_log`; manage the
      four lists; hand out a phone and a SIM line, mark the SIM lost → the Overview tab shows
      "1 with the employee, 1 lost"; `/ar` reads right to left.
      **Done when** the user reports every line holds
- [ ] 5.2 Playwright (written, the user runs it): create a made-up person with name parts, fill
      each profile group, reload, see the summary.
- [ ] 5.3 Tick here, README row, main plan note (S1.5 extended), decisions log statuses, commit.

---

## Risks

- **Sensitive data grows:** contacts of third persons, personal emails, social accounts, document
  numbers. Keep them out of exports, emails, logs and tests; review again before S8 (login,
  roles, backups).
- **Two name sources** (`full_name` vs parts) can disagree if someone edits the full name of a
  person who has parts: the edit sheet shows the full name read-only once parts exist (H1).
- **Scope creep:** contracts, salaries, addresses, family, file uploads are not in this plan
  (custody was added on request, H11).

## Verification (each phase)

`pnpm check`, eslint + prettier on touched files, `pnpm test`, `svelte-autofixer` clean,
`git status` without data files, no real names in fixtures, tests, plans or commits. Agents
don't start a dev server, open a browser, run Playwright or install packages (CLAUDE.md §1).
