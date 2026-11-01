# Employee page redesign: profile header, tabs, sheets; new-employee page; lists managed where used

**Status:** in progress (approved 2026-11-01; Phases 0–3 done)
**Date:** 2026-11-01
**Goal:** As the user asked (2026-11-01): the employee page shows **the profile at the top** (an
`Avatar` header), then **tabs**; every add / edit inside a tab opens a **sheet**. Job titles,
skills, document types and custody items are created and managed **from those sheets**, so the
separate `/staff-lists` page goes away. **Adding an employee always opens a new page**
`/employees/new`; saving it leads to the new person's profile.

Builds on [Employee profile](2026-11-01-employee-profile.md) (H1–H12): its data model, services,
schemas and pure helpers stay. This plan changes **UI and routes only; no migration, no new
package**. It replaces H12 (inline forms in a Profile card) and the `/staff-lists` part of H9 /
task 4.3 there.

**Lane:** A, branch `app/main`. One commit per phase (plan file included). Resume point = the
first unticked box.

---

## 0. For the implementing agent (read first)

**Read:** `CLAUDE.md` (all of it; §1 data rules, §3 "UI rules" and "Forms" apply to every
`.svelte` change, §5 plans, §6 decisions log), then this plan, then
`plans/2026-11-01-employee-profile.md` §1 (H1–H12).

**You may not:** open a browser, start a dev server, run Playwright, or install / add / upgrade
packages (CLAUDE.md §1). Every component this plan needs is already in
`src/lib/components/ui/` (`avatar`, `underline-tabs`, `sheet`, `select`, `form`, `card`,
`badge`, `button`, `dropdown-menu`, `table`, `switch`, `checkbox`, `textarea`). If something
seems missing, write the command for the user and stop.

**Never put personal data** in code, tests, plans, commits or chat: made-up people only
("Sam Example", `example.test` emails, `0900 000 000`).

### Current state (uncommitted work of the profile plan, as of 2026-11-01)

| What | Where |
|---|---|
| Profile tables (job title, skills, document types, custody types + the per-person rows) | `src/lib/server/db/schema/{workforce,profile}.ts`, migration `drizzle/0010_employee_profile.sql` (**generated, not applied yet**) |
| Pure helpers + tests (`displayName`, `resolveNames`, `experienceMonths`, `formatExperience`, `documentSummary`, `custodySummary`) | `src/lib/workforce/profile.ts`, `profile.test.ts` |
| Schemas | `src/lib/schemas/staff-profile.schema.ts` (profile forms, `CUSTODY_STATUSES`, `SOCIAL_PLATFORMS`, `PROFILE_ITEM_KINDS`), `src/lib/schemas/staff-lists.schema.ts` (`STAFF_LIST_KINDS`, `staffListFormSchema`) |
| Services | `src/lib/server/services/staff-profile/staff-profile.{crud,bl}.ts` (`getStaffProfile`, `setProfileNames`, `saveContact`, `saveExperience`, `saveStaffSkill`, `saveSocialAccount`, `setStaffDocument`, `saveCustodyItem`, `removeProfileItem`, `validateJobTitle`), `src/lib/server/services/staff-lists/staff-lists.{crud,bl}.ts` (`listStaffLists`, `createStaffListItem`, `updateStaffListItem`, `setStaffListItemActive`), `src/lib/server/services/staff.ts` (create / update take name parts + `jobTitleId`; `listJobTitleOptions`) |
| Profile forms + actions (server) | `src/lib/server/profile-forms.ts` (`profileForms(person)`, `namesAction`, `contactAction`, `experienceAction`, `skillAction`, `socialAction`, `documentAction`, `custodyAction`, `removeItemAction`) |
| Client types | `src/lib/types/profile.ts` (`StaffProfile`, `StaffListOption`, …), `src/lib/types/workforce.ts` (`StaffRow` with name parts + `jobTitle`) |
| Profile UI | `src/lib/app/profile/`: `ProfileCard` (underline tabs), `NamesForm`, `ContactsPanel` + `ContactForm` + `SocialForm`, `ExperiencePanel` + `ExperienceForm`, `SkillsPanel` + `SkillForm`, `DocumentsPanel` + `DocumentForm`, `CustodyPanel` + `CustodyForm`, `RemoveItemButton`, `labels.ts` |
| Employee page | `src/routes/(dashboard)/employees/[id]/+page.{server.ts,svelte}`: back button, name line, Schedule card, Day card, `ProfileCard`, Pattern history card, assign / end / own-rules sheets |
| Employee list | `src/routes/(dashboard)/employees/`: `+page.{server.ts,svelte}`, `StaffFormSheet.svelte` (create + edit), `schema.ts` (`staffFormSchema`), `EmployeesTable`, `TeamTable`, `EmployeeRow` (shows the job title under the name) |
| Lists page (to remove) | `src/routes/(dashboard)/staff-lists/` (`+page.{server.ts,svelte}`, `StaffListFormSheet.svelte`, `labels.ts` with `kindTitle()`), sidebar entry in `src/lib/app/layout/nav.ts` |
| Not yours | `src/lib/app/patterns/PatternBuilder.svelte` and `src/lib/app/patterns/impact.ts` have the user's own uncommitted changes: **never stage or commit them** |
| Untracked, the user's | `src/lib/components/ui/underline-tabs/` (added by the user; commit it with the profile work, don't edit it) |

### Patterns to copy (they are the house style)

- Sheet with a form: `src/lib/app/patterns/EndAssignmentSheet.svelte` (`superForm(untrack(() => data), { validators: zod4Client(schema), ...statusToasts(() => (open = false)) })`, `delayed` spinner).
- Select with a placeholder item that isn't a real value (`none`): `StaffFormSheet.svelte` job title / team (hidden input posts the real value, no `name` on `Select.Root`).
- Plain action with a notice toast: `RemoveItemButton.svelte` (`use:enhance={toastNotice}`).
- Avatar: `src/lib/app/layout/UserMenu.svelte`.
- Server form helpers shared by pages: `src/lib/server/pattern-forms.ts`, `src/lib/server/profile-forms.ts`.

### Gotchas

- `pnpm check` doesn't run the paraglide vite plugin: after editing `messages/*.json`, run
  `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide --emit-ts-declarations --strategy url cookie baseLocale`
  (`src/lib/paraglide/` is generated; never edit it).
- Every `superForm` on one page needs a distinct `id` (server `superValidate(…, { id })` and the
  same form object on the client). The employee page already has ~11.
- Don't call `refreshAll()` / `invalidateAll()` after a successful submit (the default
  `invalidateAll: true` reruns the loads). Use `goto` from `$app/navigation` for redirects.
- Tailwind colour tokens only (`primary`, `muted`, `destructive`, `warning`…); no `bg-green-600`.
  No `space-y-*`; `flex flex-col gap-*`.
- Every string through `m.*()` in **both** `messages/en.json` and `messages/ar.json`.
  Numbers, phones, emails, URLs in `<bdi dir="ltr">`; dates with `formatDate()` inside `<bdi>`.
- Internal links only through `localizedHref()` (`#lib/i18n.js`); a new route must exist before
  `localizedHref('/employees/new')` type-checks.

## 1. Decisions (defaults; stop and ask before departing from one)

| # | Decision | Why |
|---|---|---|
| V1 | **Profile header** at the top of `/employees/[id]`, one `Card`: **`Avatar.Root` (size via `class="size-16"`) with `Avatar.Fallback` = initials** of the display name (first letter of the first two words; Arabic letters when the page is in Arabic) and **`Avatar.Badge`** showing the status (`bg-primary` active, `bg-muted-foreground` inactive, with an `sr-only` label). **No `Avatar.Image`** until photos exist (Q-V4). Next to it: full name in the current language with the other language under it, employee number, job title, department › team, badges (inactive, own pattern), quick facts (phone, work email, start date, years of experience). Actions on the end side: **Edit details** (sheet, V7) and **Deactivate / Activate** | The user chose the shadcn Avatar for the profile (2026-11-01); who the person is, at a glance |
| V2 | **Page tabs under the header** (`UnderlineTabs`), for the whole page: **Overview · Schedule · Personal · Experience · Skills · Documents · Custody · History** (Q-V1). Schedule = today's Schedule card + Day card; Personal = names & job title, personal email, emergency contacts, social accounts; History = Pattern history | One layout for everything about a person |
| V3 | **Tab in the URL**: `?tab=<name>` (default `overview`, Q-V5), changed with `goto(url, { replaceState: true, noScroll: true, keepFocus: true })`. The load must not read `tab` (so switching tabs doesn't refetch); `?day=` selects the Schedule tab | Reload, back button and links ("2 documents missing" → Documents) land on the right tab |
| V4 | **Tabs show, sheets edit.** Each tab is a read-only list (or summary) with **+ Add**; each row has **Edit** and **Remove**. Add / Edit open a sheet holding today's form component. Personal: an **Edit** button for names, job title and personal email opens one sheet | Readable lists, one pattern everywhere |
| V5 | **Lists managed where used; `/staff-lists` removed.** (a) Every picker of a list item (job title, skill, document type, custody item) ends with **"+ New …"**, opening `ListItemSheet` (English + Arabic name; "required" for document types); on save the new item is **selected** in the picker. (b) The tabs that use a list have a **"Manage …"** button (Personal → job titles, Skills → skills, Documents → document types, Custody → custody items) opening `ListManageSheet`: rename, activate / deactivate, add (Q-V2) | The user's request: create an item when it is needed |
| V6 | **Adding an employee always opens a new page `/employees/new`** (the user's answer to Q-V3, 2026-11-01). The page: back button, a header preview (the `Avatar` with initials that follow the typed names, "New employee"), and one `Card` with the full staff form in sections — *Identity* (employee number, first + last name in English and Arabic), *Job* (job title with "+ New job title", department, function, team), *Contact* (phone, work email), *Dates* (start date). A note says contacts, experience, skills, documents and custody are added on the profile after saving. **Save** → `goto` the new profile `?tab=personal` with a success toast; **Cancel** → back to `/employees`. The "Add employee" button on `/employees` becomes a link to this page; the create sheet goes away | The user's choice: a full page, not a sheet |
| V7 | **One staff form component**: `#lib/app/staff/StaffForm.svelte` owns the `superForm` (schema moved to `#lib/schemas/staff.schema.ts`) with props `mode: 'create' \| 'edit'`, `action`, `onSaved`. `/employees/new` renders it in the page; the profile header's **Edit details** renders it in `StaffDetailsSheet.svelte`. Edit mode keeps today's rule: name parts for people who have them, full names for seeded people without parts | One form, one schema (CLAUDE.md "one shared schema per service") |
| V8 | **Employee list keeps only navigation for editing**: the row menu's **Edit** opens the profile (`/employees/[id]`) instead of a sheet; **Deactivate / Activate** stays in the menu; drag and drop into teams is unchanged (Q-V6) | Editing lives in one place, the profile |
| V9 | **Server side reused.** The list actions move from `/staff-lists/+page.server.ts` into `#lib/server/staff-list-forms.ts` (`staffListForm()`, `saveListItemAction`, `setListItemActiveAction`) and are mounted on `/employees/new` and `/employees/[id]`. The save action's message carries the saved item (`{ kind, text, item }`) so a picker can select it. Services and the `staff.write` permission don't change | No new business logic |
| V10 | **Overview tab** = today's Overview summary, with links: documents line → Documents tab, custody line → Custody tab, experience → Experience tab, contacts → Personal tab | The header says who; Overview says what is missing and where to fix it |

Questions for the user, **all answered 2026-11-01** (Q-V3: a new page; the others: the default):

| # | Question | Default |
|---|---|---|
| Q-V1 | Tabs: Overview · Schedule · Personal · Experience · Skills · Documents · Custody · History — merge (e.g. Experience + Skills), rename or reorder any? | **answered: as listed** (V2) |
| Q-V2 | Lists: "+ New …" in every picker **and** a "Manage …" sheet per tab, or only "+ New …"? | **answered: both** (V5) |
| ~~Q-V3~~ | ~~Add employee: sheet or page?~~ **Answered 2026-11-01: always a new page** | V6 |
| Q-V4 | A photo in the avatar? Needs file storage, backups and access rules that come with login (S8); profile plan H5 keeps files out until then | **answered: initials only** (V1) |
| Q-V5 | Tab that opens by default: Overview or Schedule? | **answered: Overview** (V3) |
| Q-V6 | Employee list row menu: Edit opens the profile (no edit sheet on the list), OK? | **answered: yes** (V8) |

## 2. Layout

Employee page:

```
← Back to employees
┌────────────────────────────────────────────────────────────────────────────┐
│ ╭────╮  Sam Example                              [Edit details] [Deactivate]│
│ │ SE │● سامي مثال                                                           │
│ ╰────╯  #1042 · Supervisor · Ramp › Team A        [Own pattern]             │
│         0900 000 000 · sam@example.test · since 1 Mar 2024 · 3 y 2 m        │
└────────────────────────────────────────────────────────────────────────────┘
 Overview  Schedule  Personal  Experience  Skills  Documents  Custody  History
 ────────
 (tab content: read-only lists; [+ Add …] [Manage …] open sheets)
```

`● ` = `Avatar.Badge` (active / inactive).

Personal tab:

```
Names & job                                                        [Edit]
  First / last (EN)  Sam Example        First / last (AR)  سامي مثال
  Job title          Supervisor         Personal email     sam@example.test
Emergency contacts                                                 [+ Add]
  A. Example · brother · 0900 000 001                         [✎] [🗑]
Social accounts                                                    [+ Add]
  LinkedIn · linkedin.com/in/example                          [✎] [🗑]
                                                      [Manage job titles]
```

New employee page (`/employees/new`):

```
← Back to employees
┌──────────────────────────────────────────────┐
│ ╭────╮  New employee                          │
│ │ SE │  (initials follow the typed names)     │
│ ╰────╯                                         │
└──────────────────────────────────────────────┘
┌ Identity ─────────────────────────────────────┐
│ Employee number [ generated if empty ]          │
│ First name (EN) [    ]  Last name (EN) [    ]   │
│ First name (AR) [    ]  Last name (AR) [    ]   │
├ Job ───────────────────────────────────────────┤
│ Job title [Supervisor ▾] (… + New job title)    │
│ Department [▾]  Function [▾]  Team [▾]          │
├ Contact ───────────────────────────────────────┤
│ Phone [      ]   Work email [            ]      │
├ Dates ─────────────────────────────────────────┤
│ Start date [    ]                               │
└────────────────────────────────────────────────┘
 Contacts, experience, skills, documents and custody are added on the profile after saving.
                                         [Cancel] [Save employee]
```

Made-up names and numbers only (CLAUDE.md §1).

## 3. Tasks

### Phase 0 · Prerequisites (the user's OK needed)
- [x] 0.1 The profile-plan work is committed as its own commit ("Employee profile: …"), including
      `src/lib/components/ui/underline-tabs/`, **excluding** `PatternBuilder.svelte` and
      `patterns/impact.ts`. Ask the user before committing.
- [x] 0.2 Migration `0010_employee_profile` applied: count `staff` rows in the three DBs, apply to
      `attendance_app_test` and `attendance_app_e2e` (no need to ask), to `attendance_app` only
      after the user's OK (CLAUDE.md §4). The DB container must be up; if Docker isn't reachable,
      give the user the command and wait.
      > note: `attendance_app` already had it (11 migrations, `job_title` present, 2 `staff`
      > rows); applied to `attendance_app_test` (0 staff) and `attendance_app_e2e` (3 staff),
      > both now at 11 migrations.

### Phase 1 · Shared pieces
- [x] 1.1 `#lib/server/staff-list-forms.ts` (V9): `staffListForm()` (superform id `staff-list`),
      `saveListItemAction(request, actor)` returning `{ kind: 'success', text, item }`,
      `setListItemActiveAction(request, actor)` returning `{ notice }`. Moved from
      `routes/(dashboard)/staff-lists/+page.server.ts`; `kindTitle()` moves to
      `#lib/app/staff-lists/labels.ts`.
- [x] 1.2 `#lib/app/staff-lists/ListItemSheet.svelte`: create / rename one item (today's
      `StaffListFormSheet`, moved). Props `data`, `kind`, `target: StaffListOption | null`,
      `open` (bindable), `onSaved?: (item: StaffListOption) => void` (called from `onUpdated`
      with `form.message.item`).
- [x] 1.3 `#lib/app/staff-lists/ListManageSheet.svelte`: one list (`kind`, `items`) with name,
      "required" (document types), status badge, a row menu (Rename → `ListItemSheet`,
      Activate / Deactivate → hidden plain form + `toastNotice`, like the old `/staff-lists`
      page) and **+ Add**. `Empty` from `#lib/app/state/Empty.svelte` when the list is empty.
- [x] 1.4 `#lib/app/staff-lists/ListSelect.svelte`: form-agnostic picker (`value = $bindable()`,
      `items`, `kind`, `placeholder`, `allowNone?`, `...restProps` for the trigger). Shows active
      items plus the selected one if inactive; last item **"+ New …"** (value `__new__`, never
      stored) opens `ListItemSheet`; on save sets `value` to the new id. Posting stays with the
      caller (hidden input pattern).
      **Done when** `pnpm check` is green and `svelte-autofixer` is clean on the four files
      > note: plus `StaffListsHost.svelte` + `context.ts`: the one host per page that owns the only
      > `ListItemSheet` and the `ListManageSheet`; pickers and "Manage …" buttons reach it through
      > `getStaffLists()`. `statusToasts(onSuccess)` now passes the message to `onSuccess`.
      > `findProfilePerson` already returns the header fields (3.1). Check green, autofixer clean
      > (only the generic `enhance` / `bind:this` hints).

### Phase 2 · Staff form and the new-employee page
- [x] 2.1 `#lib/schemas/staff.schema.ts`: `staffFormSchema` moved from
      `routes/(dashboard)/employees/schema.ts` (with `setStaffTeamSchema`,
      `setStaffActiveSchema`, `StaffMessage`, now `{ kind, text, staffId? }`); update imports.
- [x] 2.2 `#lib/app/staff/StaffForm.svelte` (V7): the form of today's `StaffFormSheet` without the
      sheet, in the four sections of §2 (`Separator` or section headings, `flex flex-col gap-*`),
      job title through `ListSelect` (+ New job title), `mode` decides name parts vs full names
      exactly as today (`useParts`). `#lib/app/staff/StaffDetailsSheet.svelte` wraps it in a sheet
      for edit mode.
- [x] 2.3 Route `routes/(dashboard)/employees/new/` (V6): `+page.server.ts` (`staff.write`;
      load: staff form, list form, teams, departments, functions, job titles; actions `save`
      → `createStaff`, returns `staffId` in the message; `saveListItem`). `+page.svelte`: back
      button, header preview (`Avatar` with initials from the typed names, via `$derived` on the
      form store), `StaffForm` in `Card`s, Cancel link. On success: `goto(localizedHref(
      '/employees/[id]', { id }) + '?tab=personal')`; the toast comes from `statusToasts`.
- [x] 2.4 `/employees` (V8): "Add employee" becomes `Button href={localizedHref('/employees/new')}`;
      remove `StaffFormSheet`, its form from the load and the `save` action; row menu **Edit** →
      link to the profile. Delete `routes/(dashboard)/employees/StaffFormSheet.svelte` and
      `schema.ts` once nothing imports them.
      **Done when** `pnpm check` is green and no file imports the deleted ones
      > note: server side in `#lib/server/staff-forms.ts` (`newStaffForm`, `editStaffForm(person)`,
      > `createStaffAction`, `updateStaffAction`). `initials()` lives in `#lib/workforce/profile.ts`
      > (3 made-up tests). `/employees` no longer loads departments, functions or job titles;
      > `listJobTitleOptions` removed (unused). The new route pushed SvelteKit's route union past
      > TypeScript's 25-member limit: `localizedHref` now passes `resolve` one argument tuple.
      > The redirect after the save carries `?tab=`, so it has one `eslint-disable` line (rule
      > `no-navigation-without-resolve`; the path itself comes from `localizedHref`). Check green,
      > 205 tests pass.

### Phase 3 · Employee page
- [x] 3.1 `#lib/app/profile/ProfileHeader.svelte` (V1): `Avatar` (initials helper `initials(name)`
      in `#lib/app/profile/labels.ts`, made-up tests in `src/lib/app/profile/labels.test.ts` if it
      stays pure, else in `#lib/workforce/profile.ts` + tests), names, number, title, department ›
      team, badges, quick facts, **Edit details** (opens `StaffDetailsSheet`) and
      Deactivate / Activate (plain action `setActive` + `toastNotice`). The fields it needs that
      the page doesn't load yet (department, phone, work email, start date, active, function)
      come from one extra read: extend `getStaffProfile`'s `person` (preferred) — no second query
      for the same row.
- [x] 3.2 `/employees/[id]/+page.svelte`: header + page-level `UnderlineTabs.Root value={tab}`
      with `onValueChange` → `goto` with `?tab=` (V3); move the Schedule and Day cards into the
      Schedule tab (a `?day=` in the URL selects Schedule), Pattern history into History. The
      three schedule sheets stay outside the tabs, as now. Remove `ProfileCard`.
- [x] 3.3 Tabs as lists + sheets (V4): turn each `*Panel` into a read-only list with **+ Add** and
      per-row **Edit** / `RemoveItemButton`; wrap each existing `*Form` in a sheet
      (`NamesSheet`, `ContactSheet`, `SocialSheet`, `ExperienceSheet`, `SkillSheet`,
      `DocumentSheet`, `CustodySheet`; one `Sheet.Root` per form, `onDone` closes it). Pickers in
      `SkillForm` and `CustodyForm` (and `NamesForm`'s job title) use `ListSelect` (+ New …);
      `DocumentsPanel` gets "+ New document type". "Manage …" buttons open `ListManageSheet`
      (V5). The Personal tab merges names / email (from `NamesForm`) with `ContactsPanel`.
- [x] 3.4 Overview tab (V10): today's summary (from `ProfileCard`) with links that set `?tab=`.
- [x] 3.5 `[id]/+page.server.ts`: load the list form and a prefilled staff edit form
      (id `staff-edit`); actions `saveStaff` (→ `updateStaff`), `setActive`
      (→ `setStaffActive`), `saveListItem`, `setListItemActive`, besides today's profile actions.
      **Done when** every group can be added, edited and removed from its tab, a list item can be
      created from a picker and is selected in one go, and `pnpm check` is green
      > note: built and statically green (check, eslint, autofixer, 205 tests); the runtime half
      > of "done when" is confirmed by the user in 5.2. Details: one `FormSheet.svelte` shell
      > holds each form (one `Sheet.Root` per form) instead of seven `*Sheet` files; forms mount
      > when their sheet opens, so they start from the latest data (NamesForm no longer follows
      > the person with an `$effect`). `getStaffProfile` now returns `lists` (all four lists) in
      > place of `jobTitles` / `skillOptions` / `custodyTypes`, so the page doesn't read the lists
      > twice; `findProfilePerson` returns the header fields. Tab switch:
      > `goto(url, { replace: true, reset: false })` (SvelteKit 3 names for `replaceState` /
      > `noScroll` / `keepFocus`). `PreviewRange` takes `keep` so paging keeps `?tab=schedule`.
      > `ProfileCard.svelte` deleted.

### Phase 4 · Remove `/staff-lists`, strings, decisions
- [ ] 4.1 Delete `routes/(dashboard)/staff-lists/` and its `nav.ts` entry. Grep for `staff-lists`
      and `/staff-lists` (hints such as `profile_skill_no_options`, `profile_documents_empty`,
      `profile_custody_no_types`, `staff_name_parts_hint` must now point to "+ New …" / the
      Personal tab). Remove unused keys (`nav_staff_lists`, `staff_lists_title`,
      `staff_lists_description`, …) from both message files.
- [ ] 4.2 en + ar strings for every new label (`employee_new_*`, `profile_header_*`,
      `profile_tab_*`, `staff_lists_manage_*`, `staff_lists_new_*`); recompile paraglide.
- [ ] 4.3 `docs/decisions.html` (CLAUDE.md §6): re-read V1–V10 against what was built and fix
      any detail that changed (they are `approved` since 2026-11-01; H12 is already `replaced`).
      `node --check` on the extracted script. Profile plan: `> note:` on its 4.2 / 4.3 pointing
      here.

### Phase 5 · Verify
- [ ] 5.1 `svelte-autofixer` on every created / edited `.svelte` until clean (the generic
      "attachment instead of `use:enhance`" hint can stay); `pnpm check`; eslint + prettier on
      touched files (not the whole repo: `pnpm lint` fails on untouched template files);
      `pnpm test`.
- [ ] 5.2 Manual check **by the user** on `attendance_app_e2e`
      (`pnpm exec vite dev --mode e2e --port 5174`), made-up people only:
      - `/employees` → **Add employee** opens `/employees/new`; the avatar initials follow the
        typed names; "+ New job title" creates one and selects it; Save → the profile opens on
        Personal with a toast; Cancel → back to the list
      - header: avatar initials and status badge, both names, number, title, department › team;
        **Edit details** changes the phone → header updates; Deactivate → inactive badge on
        the avatar and the page
      - every tab: add, edit, remove an entry through its sheet; "+ New skill" / "+ New document
        type" / "+ New custody item"; "Manage …" renames and deactivates an item, which leaves
        the pickers but stays on people who have it
      - Overview links open the right tab; reload keeps the tab; `?day=` opens Schedule with the
        day panel; roster preview, assign / end / own-rules sheets work as before
      - list row menu **Edit** opens the profile; drag and drop into teams still works
      - `/staff-lists` is gone (404) and not in the sidebar
      - `/ar`: header, avatar, tabs, sheets and the new page read right to left; phones, emails,
        numbers stay left to right
      **Done when** the user reports every line holds
- [ ] 5.3 Playwright spec (written, the user runs it; `tests/e2e/`, made-up data): add an employee
      through `/employees/new` creating a job title from the picker, land on the profile, add a
      skill created from the picker, hand out a custody item, reload on `?tab=custody`.
- [ ] 5.4 Tick here and in the profile plan, `plans/README.md` row, decisions statuses, commit.

---

## Risks

- **Page weight:** the employee page loads the roster, events, patterns and ~11 superforms. If it
  gets slow, a later change can load the profile groups only when their tab opens.
- **Nested sheets:** "+ New …" opens a sheet over a sheet. bits-ui stacks dialogs; if focus or
  Escape misbehaves, use a `Dialog` for `ListItemSheet` (same form).
- **One list form, many pickers:** all pickers share the superform id `staff-list`; mount only
  one `ListItemSheet` per page and pass the `kind` in.
- **Losing the overview of all lists:** with `/staff-lists` gone, the four lists are reached only
  through the tabs and pickers (Q-V2).

## Verification (each phase)

`pnpm check`, eslint + prettier on touched files, `pnpm test`, `svelte-autofixer` clean,
`git status` without data files, no real names in fixtures, tests, plans or commits. Agents
don't start a dev server, open a browser, run Playwright or install packages (CLAUDE.md §1).
