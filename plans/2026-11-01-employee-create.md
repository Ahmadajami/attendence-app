# Employee creation rebuilt: one page, required fields marked

**Status:** in progress (built 2026-11-01; checks and manual test by the user pending)
**Date:** 2026-11-01
**Goal:** Rebuild "Add employee" (`/employees/new`) for a better flow: clear sections on one
page, every field marked as required (`*`) or optional, a checklist of what is still missing,
and a save bar that stays in view. The new hire's family and ID details and personal email can
be entered right away instead of only on the profile afterwards.

**Lane:** A. Follows the [employee page redesign](2026-11-01-employee-page-redesign.md) (V6:
"Add employee" opens this page) and the [employee profile](2026-11-01-employee-profile.md) (H13:
family & ID fields). Read `CLAUDE.md` §1 (personal data) and §3 (UI, Forms) first.

---

## 1. Decisions (the user's answers, 2026-11-01)

| # | Decision | Why |
|---|---|---|
| C1 | **One page, clear sections** (Identity · Family & ID · Job · Contact) in cards, a **"Required fields" checklist** beside them (sticky on large screens; a click moves to the field) and a **save bar** fixed to the bottom of the screen with the count of required fields filled | The user's choice over a step-by-step wizard: everything visible at once, nothing hidden behind "Next" |
| C2 | **Required on create:** first + last name in English, first + last name in Arabic, start date, ID number. Each label shows a red `*` (with "required" for screen readers) or a muted "(optional)". Checked in the shared zod schema (client + server) **and** in `createStaff` (BL) | The user's choice; the BL check means a crafted request can't skip them |
| C3 | **Also on the create page:** the Family & ID fields (H13: parents' names, ID number / issue / expiry, passport) and the personal email. Contacts, experience, skills, documents and custody stay on the profile | The user's choice |
| C4 | **Create only:** editing an existing person ("Edit details" sheet, profile cards) keeps today's rules, so seeded or older records without these fields can still be saved | The user's choice; seeded people have no Arabic name parts, ID number or start date yet |

## 2. Tasks

- [x] 2.1 `staffCreateFormSchema` + `STAFF_CREATE_REQUIRED` (`staff.schema.ts`); the ID-number rule
      shared with the profile (`documentNumberSchema`); `idDatesInOrder` in
      `#lib/workforce/profile.ts` used by both BLs.
- [x] 2.2 `createStaff(actor, input, extras)`: `requireCreateFields` (C2, field-level
      `InvalidInputError`), ID dates in order, extras saved in the same insert and audit row.
      `updateStaff` unchanged (C4).
- [x] 2.3 `newStaffForm` / `createStaffAction` on the create schema.
- [x] 2.4 UI: `#lib/app/forms/FieldLabel.svelte` (`*` / "(optional)"),
      `#lib/app/staff/StaffCreateForm.svelte` (C1), `/employees/new` uses it; 11 en + ar keys.
- [x] 2.5 Tests: `staff.schema.test.ts` (3 cases), `idDatesInOrder` (2 cases); the e2e spec
      `employee-profile.spec.ts` fills the ID number and start date.
      > note: written without `node_modules` in a cloud session: not type-checked, linted,
      > autofixed or run. The user runs `pnpm check`, `pnpm test`, eslint, prettier and the Svelte
      > autofixer on `StaffCreateForm.svelte` and `FieldLabel.svelte`.
- [ ] 2.6 Follow-up: `StaffForm.svelte` keeps a `mode: 'create'` branch nobody uses now (only the
      "Edit details" sheet uses `StaffForm`); remove it and the `header` snippet once 2.7 passes.
- [ ] 2.7 Manual check **by the user** on `attendance_app_e2e` (migration `0011` applied first):
      - empty Save → each required field shows "This field is required." and stays in the
        checklist; the checklist buttons move to the field;
      - fill the six required fields → the bar says "All required fields are filled."; Save opens
        the profile on Personal, and the Family & ID card shows what was typed;
      - an ID expiry before its issue date is refused on that field;
      - "Edit details" on an older person without an ID number still saves (C4);
      - `/ar/employees/new` reads right to left; the save bar stays at the bottom while scrolling;
        the "New job title" picker still works.
      **Done when** the user reports every line holds
