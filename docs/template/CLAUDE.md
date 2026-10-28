# CLAUDE.md — Damascus Airport Operations Control System

## 1. Project overview

- Operations platform for Damascus Airport, replacing the operational workflows currently run in **Odoo**.
- Core flow: **flights → staffing needs → assignments → attendance → exceptions & reports**.
- **Not general HR**: no payroll, leave balances, recruitment, or performance reviews.
- Pilot runs alongside Odoo; cutover only after the acceptance checklist (§11) passes, including tested backups/recovery.
- MVP = Phases 1–3 below. Phases 4–5 must not be built early.
- **Owner decision (2026-10-26):** recurring shift cycles and overtime **hours** moved from Phase 4 into the MVP, because attendance needs to know who should be working. The plan and every decision behind it are in `plans/ROSTER_PLAN.md`.

| Phase                              | Scope                                                                                                                                                                                             | Priority |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1 Foundation & data import         | Auth + 5 roles, staff directory & teams, flight DB, CSV/Excel import preview, audit trail, Odoo reconciliation                                                                                    | MVP      |
| 2 Flights & assignments            | Arrivals/departures list + day timeline, create/edit/reschedule/cancel flights, handling windows & required staff counts, assign teams/individuals, server-side overlap blocking                  | MVP      |
| 3 Rosters, attendance & control    | Repeating Day / Night / Off shift cycles (team and personal), team moves with an effective date, check-in/out, breaks, absences, overtime hours per day, coverage dashboard, alerts, daily report | MVP      |
| 4 Roster automation & integrations | Team alignment / staggering, supervisor accounts, flight feed sync + stale-data warnings, live updates, overtime export to payroll                                                                | Later    |
| 5 Optimization & forecasting       | Demand forecasts, staffing model comparison, assignment recommendations, KPIs, PDF/Excel reports                                                                                                  | Later    |

## 2. Commands (pnpm only)

```sh
pnpm dev            # dev server
pnpm build          # production build (Vercel adapter)
pnpm check          # svelte-kit sync + svelte-check (types)
pnpm lint           # prettier --check + eslint
pnpm format         # prettier --write
pnpm test           # vitest run (unit tests: src/**/*.test.ts)
pnpm db:generate    # drizzle-kit generate (SQL migration from schema diff)
pnpm db:migrate     # apply migrations
pnpm db:studio      # Drizzle Studio
pnpm drizzle-kit generate --custom --name=<name>   # empty migration for hand-written SQL
pnpm auth:create-admin <id> "<name>" [--name-ar ..] [--days 1|7|30] [--force]   # first admin, prints a 6-digit code once
pnpm auth:issue-code <id> [--days 1|7|30]          # recovery: new code, clears lockout, signs the account out
```

- **Do not use `pnpm db:push`** once migrations exist. It bypasses custom SQL migrations (exclusion constraints, seeds; see §7).
- Run `pnpm check`, `pnpm lint` and `pnpm test` before declaring work done.
- **Tests (Vitest):** pure logic only (the roster engine `src/lib/roster/`, time and parsing helpers), in a `<name>.test.ts` beside the file it tests, Node environment, no database. Every rule in `plans/ROSTER_PLAN.md` that the engine implements gets a test case, including its edges.

## 3. Stack & conventions (non-default — read carefully)

| Area       | Rule                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | **SvelteKit 3** + **Svelte 5**, runes forced for all project files (`vite.config.ts`). Use `$state`, `$derived`, `$effect`, `$props`; no `export let`, no stores in new code.                                                                                                                                                                                                                |
| Imports    | Alias is **`#lib`** (Node subpath imports in `package.json`), **not `$lib`**. e.g. `import { cn } from '#lib/utils.js'`.                                                                                                                                                                                                                                                                     |
| Env vars   | Declare in `src/env.ts` via `defineEnvVars`, read from **`$app/env/private`**. Add every new var to `.env.example` too. Never commit `.env`.                                                                                                                                                                                                                                                 |
| DB         | Drizzle ORM 0.45 + `drizzle-orm/neon-http` + Neon Postgres (`src/lib/server/db/index.ts`). See §7.                                                                                                                                                                                                                                                                                           |
| Forms      | `sveltekit-superforms` v3 with the **`zod4`** adapter (`sveltekit-superforms/adapters`), `zod` v4 (`z.email()`, not `z.string().email()`). Schemas live once in `src/lib/schemas/<service>.schema.ts`, shared by the form, the action and the BL (§3 Service layer).                                                                                                                         |
| UI         | Tailwind CSS 4 (`src/routes/layout.css`), shadcn-svelte (style `lyra`) in `#lib/components/ui`. Add components with `pnpm dlx shadcn-svelte@latest add <name>`. Use `cn()` from `#lib/utils.js`.                                                                                                                                                                                             |
| Cards      | Use `Card.*` from `#lib/components/ui/card` for any card/panel. **Never change a card's border**: no `border`/`ring`/`rounded` overrides on `Card.Root`, and no hand-rolled `border bg-card` look-alikes.                                                                                                                                                                                    |
| Icons      | **phosphor-svelte** (the `components.json` icon library), imported per icon: `import ListIcon from 'phosphor-svelte/lib/ListIcon'`. Don't add new lucide usages.                                                                                                                                                                                                                             |
| Feedback   | `svelte-sonner` toasts (`<Toaster />` is in the root layout); `mode-watcher` (`<ModeWatcher />` in the root layout) for dark mode.                                                                                                                                                                                                                                                           |
| Dates      | `@internationalized/date` for timezone-aware display/parsing. Show instants with `formatDateTime()` from `#lib/utils/datetime.js` (Asia/Damascus, current locale) inside `<bdi>`.                                                                                                                                                                                                            |
| i18n       | Paraglide JS: `en` (base) + `ar`, strategy `['url', 'cookie', 'baseLocale']` (`/ar/...` prefix). Messages in `messages/{en,ar}.json`; use `m.key()` from `#lib/paraglide/messages.js`. `src/lib/paraglide/` is generated — never edit it.                                                                                                                                                    |
| Links      | Internal links are **always** `localizedHref('/route')` or `localizedHref('/route', 'ar')` from `#lib/i18n.js`, which returns `localizeHref(resolve(url), { locale })`. Never a plain `href="/x"` or `resolve()` alone (drops `/ar`). It accepts param-free routes only; dynamic routes (`/flights/[id]`) need a params overload when added. `paths.relative` is `false` so it works in SSR. |
| Deploy     | `@sveltejs/adapter-vercel` → serverless functions. No long-lived processes or WebSocket servers.                                                                                                                                                                                                                                                                                             |
| Svelte MCP | For every `.svelte` / `.svelte.ts` file created or edited, run the Svelte MCP `svelte-autofixer` until it reports no issues. Use `get-documentation` for SvelteKit 3 / Svelte 5 APIs instead of guessing.                                                                                                                                                                                    |

### UI rules

- **Markup.** Key every `{#each}` (`(item.id)`; the index only when nothing unique exists). Use declaration tags `{const x = …}` / `{let x = $state(…)}` (Svelte ≥ 5.56) instead of the legacy `{@const}`. Close snippets with `{/snippet}`.
- **Spacing.** No `space-y-*` / `space-x-*`. Use `flex flex-col gap-*` or grid `gap-*`. Sibling-margin spacing breaks when children render conditionally.
- **Colors.** Only tokens defined in `src/routes/layout.css`: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `chart-1`…`chart-5`, `sidebar-*` (plus their `-foreground` pairs). No raw palette colors (`border-gray-200`). There is **no** `warning`/`success`/`info` token: use `destructive` with opacity (`bg-destructive/10`), or add the token to both `:root` and `.dark` in the same change as its first use. Separators use `<Separator />`.
- **shadcn primitives.** Don't modify `#lib/components/ui/` for one feature. Wrap or compose the primitive in `#lib/app/` instead. Edit `ui/` only for a project-wide fix.
- **Component props.** Type them with `svelte/elements` (`HTMLAttributes<HTMLDivElement>`, `HTMLButtonAttributes`), never `any`. `Snippet` and `Component` come from `svelte`. Merge classes with an array (`class={['base', className]}`) or `cn()`.
- **Back buttons.** phosphor `ArrowLeftIcon` with `rtl:rotate-180`, `href={localizedHref(...)}`, label from `m.*()`. Never choose the icon by `getLocale()`.
- **No template scaffolding.** Nav, user menu, and command items are wired to real routes, session data, and handlers: no placeholder avatars, "Upgrade" links, or fake lists.
- **State components** (`#lib/app/state/`): `ErrorState` (done) renders an `App.Error` and backs `src/routes/+error.svelte` and `(dashboard)/+error.svelte`. `Empty`, `Unauthorized`, `Loader` are planned. Use them instead of ad-hoc empty/error markup.
- **Performance.** No `backdrop-blur`/`blur` on repeated items or sticky/fixed bars. Use `transition-colors`/`-opacity`/`-transform`, not `transition-all`. No looping decorative animations (spinners are fine). A client library over ~10 KB gzip used by one feature (charts, spreadsheet parsing) loads with `import()` when used, never statically in a layout or page.
- **Strings.** Every user-facing string is `m.*()`, including thrown error messages, `setError()` text, toasts, and **default prop values**. Keys are descriptive snake_case prefixed by feature (`flights_error_conflict`), never random phrase keys.

### Forms (Superforms + Formsnap)

- The component that owns the form (each `*FormSheet.svelte`) calls `superForm(untrack(() => data.form), { validators: zod4Client(schema), … })`. The server uses `zod4(schema)`. Both import the same schema from `#lib/schemas/<service>.schema.js`. Export the schema type beside the schema (`export type FlightFormSchema = typeof flightFormSchema`).
- Actions check `if (!form.valid) return fail(400, { form })` **before** calling the BL.
- Status messages go through `onUpdated` / `onError` (`#lib/utils/form-toasts.js`). `onError` is mandatory. Never use `$effect` on `$message`.
- **Loading state is Superforms' `delayed` store, not `submitting`:**
  ```ts
  const { form: formData, message, enhance, delayed } = form;
  ```
  Use `disabled={$delayed}` and `{#if $delayed}` for the spinner. `delayed` turns true only after `delayMs` (500 ms by default), so fast submits don't flash a spinner. Double submits are already blocked by `multipleSubmits: 'prevent'` (the default; don't change it). Don't copy loading into `$state` through callbacks or `$effect`.
- Every field goes through Formsnap: `Form.Field` → `Form.Control` (spread its `props` onto the one focusable element) → `Form.Label` + `Form.FieldErrors`. No hand-rolled label/`aria-invalid`/error markup. Set a custom id on `<Form.Control id="…">`, never by overriding `id` in the spread. Labels that shouldn't show get `class="sr-only"`.
- `Select`: `name={props.name}` and `bind:value` on `Select.Root`, `{...props}` on `Select.Trigger`, trigger text from a label map with an `m.*()` placeholder. **Exception, placeholder items:** when an item's value isn't a real field value (e.g. `none` for "No team", because an empty item value can't be selected), the root's hidden input would post the placeholder, which the server rejects. Then leave `name` off `Select.Root` and post the real value with `<input type="hidden" name={props.name} value={$formData.x} />` (see `StaffFormSheet.svelte`). `Checkbox`/`Switch`: `bind:checked` on a `z.boolean()` field.
- Reusable inputs are form-agnostic (`value = $bindable()`, `...restProps`, no superforms import). A reusable field is generic: `<script lang="ts" generics="T extends Record<string, unknown>">` with `form: SuperForm<T>` and `name: FormPathLeaves<T>`.
- Casted defaults: unselected enum `.default('' as 'first_value')`, empty number input `.default('' as unknown as number)`, must-check box `z.literal(true).default(false as true)`. Don't put a whole-object `.refine()` on a schema with casted defaults.
- Arrays: `Form.Fieldset` + `Form.ElementField name="items[{i}]"`, bind through the index, add/remove by reassigning the array, give it a `.default([...])`. Nested objects need `dataType: 'json'` (and therefore `use:enhance`).
- Proxies (`dateProxy`, `intProxy`, …) are created once from the whole `SuperForm`. Programmatic writes that aren't user edits use `fieldProxy(form, 'x', { taint: false })`.
- One component per form. Two forms with the same schema on a page get distinct `superForm` `id`s.

### Service layer: `<service>.bl.ts` + `<service>.crud.ts`

Every service is a folder `src/lib/server/services/<service>/` (`flights`, `staff`, `teams`, `users`, `imports`, later `assignments`, `attendance`). Its logic and data access always live in separate files:

| File                          | Owns                                                                                                                                                                                                                                                                                                                                                                             | Never                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `<service>.crud.ts`           | Drizzle queries on its own tables. Reads are `async` functions returning typed rows (`undefined` when missing). Writes **return the unexecuted query** (a `BatchQuery`) so the BL can batch it. Column selections are exported `const` objects. Row types come from them (`Awaited<ReturnType<typeof findFlight>>`) or from `$inferSelect`, never a hand-written interface.      | zod, `m.*()`, `AppError`, permission checks, business rules, `auditInsert`, calling `db.batch`               |
| `<service>.bl.ts`             | The service's public API: the only file routes import. Takes an `Actor` and typed input. Checks the permission, enforces business rules, throws `AppError` (including `NotFoundError` when a CRUD read returns `undefined`), builds audit rows, runs `db.batch([...crudWrites, auditInsert(...)])` (§6.3), and maps `23505` / `23P01` to `ConflictError`. Explicit return types. | Building queries itself (`db.select`/`insert`/`update`), importing `@sveltejs/kit` or `sveltekit-superforms` |
| `<name>.ts` (optional helper) | Pure logic the BL uses: parsing, window or coverage calculations                                                                                                                                                                                                                                                                                                                 | DB access                                                                                                    |

- **CRUD holds only what a BL calls today.** Don't scaffold a full create/get/list/update/delete set per table "for later". Add a query when a BL function needs it, and delete it when its last caller goes. Prefer one query shaped for its caller (exact `columns` / `with`, filters in SQL) over a generic one plus mapping in the BL.
- Routes (`+page.server.ts`, `+layout.server.ts`, `+server.ts`) import only `*.bl.ts`, never `*.crud.ts` or `#lib/server/db`.
- A BL may read through another service's CRUD (e.g. staff BL checking that a team is active via `teams.crud.ts`). Writes to another service's tables also use that service's CRUD write builders, placed in this BL's batch so the change stays atomic.
- `BatchQuery` (`Parameters<typeof db.batch>[0][number]`) and `Actor` live in `services/common.ts`.

### Shared zod schemas

- Each service's input schemas are defined **once** in `src/lib/schemas/<service>.schema.ts`. That file is client-safe: no `#lib/server` imports, though `m.*()` messages are fine. The same schema is used by the form component (`zod4Client`), the action (`superValidate(…, zod4(schema))`), and the BL input type (`z.infer<typeof schema>`). Never redeclare an equivalent schema in a route, component or service. The route-level `schema.ts` files (`flights/`, `employees/`, `teams/`, `admin/users/`) are to be migrated.
- When the form's wire shape differs from the BL input (e.g. `datetime-local` strings → `Date` in Asia/Damascus), the schema file also exports the input schema, derived with `.extend()` / `.omit()`. The action converts, and the BL takes `z.infer` of the input schema.
- The action validates format (`superValidate`, or `safeParse` with a shared schema for plain actions). The BL checks business rules (existence, ownership, windows, overlaps), not field formats. CRUD imports no zod.

### Backend typing

TypeScript runs with `strict`. Every backend type is derived from Drizzle (row shapes) or zod (input shapes), never re-declared by hand.

- **No `any`, no `!` on query results, no `as` on DB values.** Fix the source instead:
  - a `text` column holding a closed key set gets `.$type<RoleKey>()` in the schema (e.g. `role.key`, `permission.key`);
  - a `jsonb` column gets `.$type<T>()` with the stored shape (e.g. `import_row.errors` → `ImportIssue[]`).
    `.$type` changes no SQL, so `pnpm db:generate` must report no changes.
  - `as` is allowed only for `as const`, after a runtime check that TS can't follow (comment why), and for library generics such as the `FormPathLeavesWithErrors` cast in `failForm`.
- **CRUD**: let the query infer its type, then export a named type derived from it, e.g. `export type FlightRow = Awaited<ReturnType<typeof listFlightsByDay>>[number];`. Use `Pick<typeof flight.$inferSelect, …>` for column subsets. Insert and update values are typed `typeof table.$inferInsert` / `Partial<…>`. Write builders are typed `BatchQuery`.
- **BL**: every exported function declares its return type, built from CRUD types (`Promise<FlightRow>`, `Promise<FlightRow[]>`). Inputs are `z.infer<typeof schema>` plus `Actor`.
- **Other server modules** (`auth/`, `rbac/`, `audit.ts`, `errors.ts`) also declare return types on exported functions.
- **Client-facing types** reach components through `./$types` (`PageData`), or through `import type` from the BL/CRUD file when a component needs the row type by name. The hand-written shapes in `src/lib/types/*.ts` are removed as each service is split.

### Services, errors & types

- **Errors (SvelteKit 3 `handleError`).** See "Error handling" below.
- Types have one source: rows from `typeof table.$inferSelect` or `PageData` (`./$types`), inputs from `z.infer`. Closed sets are `as const` tuples in a client-safe `src/lib/schemas/enums.ts` (roster / attendance sets done; older enums to be moved) that feed `pgEnum(...)`, `z.enum(...)`, and the label functions. Don't hand-write unions that duplicate a `pgEnum` (`src/lib/types/*.ts` is to be migrated).
- Client files never import runtime values from `#lib/server/**`. `import type` is erased at build and allowed, but prefer `./$types`.
- Reusable zod primitives (IATA code, flight number, employee no, login ID) live in `src/lib/schemas/primitives.ts` (planned). Service schemas compose them with `.extend()` / `.pick()` / `.omit()`.
- CRUD write builders return the shape the caller needs via `.returning({...})`, read from the `db.batch` result, not from a follow-up read.

### Error handling (SvelteKit 3)

Every error passes through `handleError` (`src/hooks.server.ts`, `src/hooks.client.ts`), which receives a `kind`: `app` (`error()`), `framework` (404/405/413…), `validation` (remote functions), or `unknown` (anything thrown). `App.Error` is `{ status, message, code }`. `code` is **required**, so every `error(status, m.x(), { code })` call and both hooks set one.

- **Services throw `AppError`** (`#lib/server/errors.ts`): `InvalidInputError` (400), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409, uniqueness `23505` / overlap `23P01` / blocking state), or `AppError` directly for another status. Each carries a stable `code` and a localized `m.*()` message built at throw time. The optional `field` names the service input at fault. Never `throw new Error('…')` or return a silent `null`.
- **Loads and `+server.ts`: don't catch.** `handleError` maps an `AppError` (kind `unknown`) to its status, code and message. `+error.svelte` renders it, or the client gets JSON. An unmapped `23P01` still becomes a 409 `conflict` (§6.2). Anything else is logged (Drizzle query params stripped, §8) and shown as 500 `internal`.
- **Actions: catch and return.** Superforms: `catch (cause) { return failForm(form, cause); }` sets a field error when the form has `cause.field`, otherwise an error status message. Plain actions that toast `notice`: `return failNotice(cause)`. Both rethrow anything that isn't an `AppError`. Never call `error()` for an expected failure in an action. It replaces the page instead of reporting on the form.
- **Guards** (`requireSignedIn` / `requireUser` / `requirePermission`) keep using SvelteKit's `redirect()` / `error()`. Keep `redirect()` out of a `try` whose `catch` doesn't rethrow non-`AppError`s.
- **Error UI**: `src/routes/+error.svelte` (outside the shell, and errors from the `(dashboard)` layout load), `(dashboard)/+error.svelte` (page errors, inside the sidebar), `src/error.html` (errors in `handle` or the root layout). For one widget, use `<svelte:boundary>` with `{#snippet failed(error: App.Error)}`.

## 4. Directory layout (current + planned)

```
src/env.ts                       env var declarations (DATABASE_URL*, AUTH_JWT_SECRET)
src/hooks.server.ts              paraglide middleware, then handleAuth (Bearer JWT or session cookie → locals)
src/lib/server/db/               index.ts (Drizzle client), schema/{auth,rbac,audit,index}.ts (more files per §7)
src/lib/server/auth/             login, session, jwt, credentials (6-digit codes), password (Argon2), rate-limit, api
src/lib/server/rbac/             permissions.ts (keys, role scopes), guard.ts (requireSignedIn / requireUser / requirePermission)
src/lib/server/audit.ts          auditInsert() for db.batch
src/lib/server/errors.ts         AppError + subclasses, failForm() / failNotice() for actions
src/lib/errors.ts                client-safe frameworkError() / internalError(), shared by both handleError hooks
src/hooks.client.ts              client handleError;  src/error.html  static fallback for handle/root-layout errors
src/lib/server/services/         common.ts (Actor, BatchQuery, pgErrorCode); one folder per service with <service>.bl.ts + <service>.crud.ts (§3)
                                   current flat files users/flights/staff/teams/imports.ts are to be split;
                                   roster, settings, teams split (bl + crud); planned: assignments, attendance
src/lib/roster/                  pure, client-safe roster engine: rules, cycle, roster, attendance, overtime + *.test.ts;
                                   used by the server and by live previews in the browser
src/lib/components/ui/           shadcn-svelte components (generated; wrap in src/lib/app/ instead of editing, §3)
src/lib/schemas/                 client-safe zod, one <service>.schema.ts per service (auth.schema.ts, settings.schema.ts done); enums.ts (done), primitives.ts (planned, §3)
src/lib/app/                     app-specific components (layout shell, UserMenu, nav)
src/routes/(app)/                authenticated area with the top Header; +layout.server.ts requires a session
src/routes/(dashboard)/          authenticated area with the sidebar: dashboard/, employees/, flights/, teams/, imports/, admin/users/
  teams/[id] (cycle editor, supervisors), employees/[id] (own cycle), admin/settings/; planned: assignments/, attendance/, reports/attendance/
src/routes/login/                ID number + 6-digit code sign-in;  src/routes/logout/ POST sign-out
src/routes/api/auth/             JSON token API for a future CSR client: token, refresh, logout, me
scripts/                         auth CLI (create-admin, issue-code), run with tsx outside SvelteKit
messages/                        en.json, ar.json
plans/                           work plans (open work only) + TRACKING.md (checkpoints, dated log); see plans/README.md
```

- Route `load` functions and `actions` stay thin. They validate input with the shared schema, call a `*.bl.ts` function, and return `failForm` / `failNotice` on an `AppError`.
- BL functions receive an `actor` (current user + permissions). Each one performs the permission check, the mutation (through CRUD write builders), and the audit write in one `db.batch`.
- Everything touching the DB lives under `src/lib/server/` so it can never be bundled to the client.

## 5. Domain model

### Roles (seeded keys)

| Key                  | Name               | Responsibility                                                                             | Typical access                                                        |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `admin`              | Admin              | User accounts, role permissions, settings, operational configuration                       | Users & roles, configuration, all modules, audit logs                 |
| `operations_manager` | Operations Manager | Oversees operations, flight schedules, staffing rules, roster planning, approves plans     | Flights, workforce, rosters, assignments, reports, staffing scenarios |
| `supervisor`         | Supervisor         | Monitors teams, confirms attendance, oversees flight handling, reports shortages/incidents | Team schedules, attendance, assigned flights, alerts                  |
| `dispatcher`         | Dispatcher         | Maintains flight info, assigns staff, responds to delays/conflicts                         | Flight board, availability, assignments, rescheduling, live alerts    |
| `viewer`             | Viewer             | Read-only dashboards/reports                                                               | Read-only within the scope an admin grants                            |

These descriptions are **proposed defaults**. The final permission matrix is still to be agreed with the ops team (§10), which is why it lives in the DB (§7).

**Owner decisions (2026-10-27, `plans/ROSTER_PLAN.md`):** shift times, cycles, team moves, overrides, swaps, attendance, absences and overtime approval are **admin only** (`roster.manage`, `attendance.record`, `overtime.approve`, `settings.manage`). Operations managers keep flights, staff, teams, imports, assignments and reports. Supervisors have no account yet; they are staff listed on their teams and get a different job later.

### Glossary

- **Handling window**: the time span around STA/STD (scheduled arrival/departure) during which assigned staff are busy with a flight.
- **Staffing requirement**: the headcount required per handling function for one flight.
- **Assignment**: one staff member on one flight for that flight's handling window. A team assignment expands into individual assignments.
- **Coverage**: active assignments ÷ required, per function and in total. A flight with coverage < 100% is an **uncovered flight**.
- **Shift**: a 12 h **Day** or **Night** period a staff member is rostered for. Its start times are airport-wide settings the admin enters; a night shift ends the next morning but **belongs to the date it starts** (the shift date).
- **Shift cycle (pattern)**: a repeating list of 1–28 days, each Day / Night / Off, anchored to a start date (cycle day 1). Belongs to a **team**, or to **one person** (a personal cycle, for admin staff and supervisors). Versioned by effective date, never edited in place.
- **Roster**: who should work when, **computed** per person and date (absence → override → personal cycle → team cycle), never stored.
- **Effective date**: the first Damascus date a team move or cycle version applies. Team moves are today or later, never backdated.
- **Override**: a one-off Day / Night / Off for one person and date, with a reason. A Day / Night on a rostered off day that isn't a swap is an **extra shift**. A **swap** is two people's overrides linked as one action.
- **Attendance event**: check-in, check-out, break start, or break end. Append-only; a mistake is fixed by a correction event with a reason. An event belongs to the shift whose window runs from 2 h before its start to 7 h after its end.
- **Worked time**: check-in → check-out; breaks are paid and not subtracted. Under 12 h on a rostered shift is **short**.
- **Late**: check-in more than 15 min after the shift start.
- **Missing staff**: the shift has started and there is no check-in or absence.
- **Overtime**: hours only, per day: worked − 12 h on a rostered shift, all worked time on an extra shift; rounded to the nearest 15 min; categorized Day or Night by the shift. Approved by an admin. More than 18 h worked on one shift date shows a warning.
- **Available staff**: scheduled − absent − missing − on break.

**MVP workflow:** import flights & staff → set shift times and team cycles → review flight schedule → set staffing needs → assign teams → record attendance → approve overtime → monitor exceptions & report.

## 6. Non-negotiable rules

1. **Enforce permissions on the server.** Every `load`, action, and `+server.ts` handler calls `requirePermission(locals, '<key>')`, or the service it delegates to does. Hiding buttons is cosmetic only: a Viewer posting to any action must get 403.
2. **No silent double-booking.** Overlapping assignments for the same staff member are rejected by a Postgres exclusion constraint (§7). The app also pre-checks to show a friendly message. Map SQLSTATE `23P01` to a localized conflict error and never swallow it.
3. **Audit every mutation.** Changes to flights, assignments, attendance, staff, roles/permissions, settings, and imports write an `audit_log` row **in the same `db.batch([...])`** as the change. Manual overrides (window override, forced assignment, attendance correction) require a `reason`.
4. **Time.** Store all instants as `timestamptz` (UTC). Display and enter them in **`Asia/Damascus`** via `@internationalized/date`. Never use naive timestamps or rely on server-local time (Vercel runs in UTC).
5. **i18n & RTL.** Every user-facing string goes in **both** `messages/en.json` and `messages/ar.json`. Use logical Tailwind utilities (`ms-/me-/ps-/pe-/start-/end-`, `text-start/text-end`, `rtl:` variants), never `ml-/mr-/pl-/pr-/left-/right-`. Times and flight numbers stay LTR inside RTL text.
6. **Never hard-delete operational records.** Flights → `status = 'cancelled'`, staff/users → `active = false`, assignments → `status = 'cancelled'`. History must reconcile for daily reports.
7. **Keep out of the MVP** (from the brief):

| Feature                       | Why defer                                                   | Build when                                                     |
| ----------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| AI staffing forecasts         | Needs clean historical flights, demand, actual work records | Core data reliable, enough history                             |
| Automatic roster optimization | Rest rules, shift policy, constraints not yet agreed        | Manual rosters & availability rules validated                  |
| Multiple live flight APIs     | Integration complexity delays core workflow                 | Start with validated import; add one verified source at a time |
| Advanced productivity scoring | Misleading without consistent handling-time data            | Handling & attendance data reconciled                          |

8. **Live updates.** The brief mentions Socket.IO for Phase 4, but Vercel serverless cannot host it. In the MVP use `invalidate()`/`invalidateAll()` polling or SSE. A realtime service would need a separate host, so ask the user before adding one.

## 7. Database (Drizzle)

### Current state

- `drizzle.config.ts`: `dialect: 'postgresql'`, `strict: true`, schema at `./src/lib/server/db/schema` (split files). `DATABASE_URL_UNPOOLED` or `DATABASE_URL` must be set to run any drizzle-kit command.
- `src/lib/server/db/index.ts`: `drizzle(neon(DATABASE_URL), { schema })` over **neon-http**.
- Applied migrations `drizzle/0000`–`0011`: auth / RBAC / audit tables, RBAC seed, `session.client`, code credential columns, `user.issue_code` seed, drop of `must_change_password` (`0000`–`0005`); workforce, flights, team assignments and imports with their constraints and seeds (`0006` / `0007`); `staff_team_membership` with its overlap constraint and backfill (`0008` / `0009`); roster, attendance, overtime and settings tables, their `EXCLUDE` constraints and the admin-only roster permissions (`0010` / `0011`). The demo `task` table is gone.

### neon-http constraints

- **No interactive transactions** (`db.transaction(async tx => …)` is unsupported). Use **`db.batch([q1, q2, …])`**, which runs atomically in one transaction.
- Logic that must read and then write atomically (overlap checks) relies on **DB constraints**, not app-level checks.
- If a feature truly needs interactive transactions, propose switching that path to `drizzle-orm/neon-serverless` (WebSocket `Pool`, created per request) and ask first.

### Conventions

- Split the schema into `src/lib/server/db/schema/{auth,rbac,workforce,flights,assignments,attendance,imports,audit,settings}.ts` with `schema/index.ts` re-exporting everything. Update `drizzle.config.ts` `schema` to `./src/lib/server/db/schema` when doing so.
- Name tables and columns explicitly in snake_case, singular: `pgTable('flight', { scheduledAt: timestamp('scheduled_at', …) })`.
- IDs: `uuid('id').primaryKey().defaultRandom()` for domain tables. FKs to `user.id` are `uuid` (auth is hand-rolled, §8).
- Timestamps: `timestamp('…', { withTimezone: true })` everywhere. Every mutable table gets `created_at` (`defaultNow()`) and `updated_at` (`.$onUpdate(() => new Date())`).
- Use `pgEnum` for closed sets and lookup tables for sets the ops team configures.
- Relations: `relations()` (v1 API in drizzle-orm 0.45) so the `db.query.*` relational API works.
- Types: export `typeof table.$inferSelect` / `$inferInsert`. Derive zod schemas from tables (drizzle-zod) instead of duplicating them by hand.
- Migration workflow: edit the schema → `pnpm db:generate` → **read the generated SQL** → `pnpm db:migrate`. Put DDL that Drizzle can't express (extensions, EXCLUDE, seeds) in `drizzle-kit generate --custom`.

### Entities (Phases 1–3)

| Area        | Table                              | Key columns / constraints                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth        | `user`, `session`, `login_attempt` | **Built.** `user`: `login_id` (digits, unique), names, `role_id`, `active`, `password_hash` (Argon2 of the 6-digit code), `password_changed_at` / `password_expires_at` (code issued / expires), `failed_login_count`, `locked_at`, `last_login_at`, `created_by`. `session`: `id` = SHA-256 of the token, `client` (`web`/`api`), `expires_at`. `login_attempt`: insert-only rate-limit log (30-day retention)                                 |
| RBAC        | `role`                             | `key` unique (5 seeded keys from §5), `name_en`, `name_ar`                                                                                                                                                                                                                                                                                                                                                                                      |
|             | `permission`                       | `key` unique: `flight.read`, `flight.write`, `assignment.write`, `attendance.record`, `staff.write`, `import.run`, `report.read`, `user.manage`, `user.manage_operational`, `user.issue_code`, `settings.manage`, `audit.read` (seeded); planned `roster.manage`, `overtime.approve` (admin only; `attendance.record` also becomes admin only)                                                                                                  |
|             | `role_permission`                  | PK (`role_id`, `permission_id`)                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Workforce   | `staff_function`                   | Configurable lookup (ramp, baggage, check-in, gate…): `key`, `name_en`, `name_ar`                                                                                                                                                                                                                                                                                                                                                               |
|             | `team`                             | `name_en` unique, `name_ar`, `active`                                                                                                                                                                                                                                                                                                                                                                                                           |
|             | `team_supervisor`                  | Planned. `team_id`, `staff_id`, `added_by` / `added_at`, `removed_by` / `removed_at`; partial unique (`team_id`, `staff_id`) while not removed. Information only until supervisor accounts                                                                                                                                                                                                                                                      |
|             | `staff`                            | `employee_no` unique, `full_name`, `full_name_ar`, `phone`, `function_id`, `team_id` (dropped once `staff_team_membership` is the only reader), `user_id` nullable unique, `active`, `odoo_id` nullable unique                                                                                                                                                                                                                                  |
|             | `staff_team_membership`            | **Built.** `staff_id`, `team_id`, `valid_from`, `valid_to` null = open; EXCLUDE overlap per staff member. Becomes the **source of truth** for "which team, when"; `valid_from` may be a future effective date (00:00 Damascus)                                                                                                                                                                                                                  |
| Roster      | `shift_pattern`                    | Planned. `team_id` **or** `staff_id` (exactly one), `cycle shift_kind[]` (1–28, at least one non-`off`), `anchor_date`, `day_start` / `night_start` `time` (copied from `app_setting`; shifts are 12 h), `effective_from` / `effective_to` dates, `reason`, `created_by`. EXCLUDE overlapping versions per team and per person                                                                                                                  |
|             | `roster_override`                  | Planned. `staff_id`, `shift_date`, `kind shift_kind`, `reason`, `swap_group_id` nullable, `created_by`, `cancelled_by` / `cancelled_at`; partial unique (`staff_id`, `shift_date`) while not cancelled                                                                                                                                                                                                                                          |
|             | `overtime_approval`                | Planned. `staff_id`, `shift_date`, `shift_kind`, approved `minutes`, `approved_by` / `approved_at`, `revoked_by` / `revoked_at`; partial unique (`staff_id`, `shift_date`) while not revoked                                                                                                                                                                                                                                                    |
| Flights     | `flight`                           | `airline_code`, `flight_no`, `direction` enum (`arrival`/`departure`), `origin`, `destination` (IATA), `scheduled_at`, `estimated_at`, `actual_at`, `status` enum (`scheduled`/`delayed`/`boarding`/`departed`/`arrived`/`cancelled`/`diverted`), `stand`, `gate`, `aircraft_type`, `handling_starts_at`, `handling_ends_at`, `source` enum (`manual`/`import`/`feed`), `external_ref`. Unique (`source`, `external_ref`); index `scheduled_at` |
|             | `handling_window_rule`             | `direction`, optional `aircraft_category`, `minutes_before`, `minutes_after`. Computes the default window; per-flight overrides are audited                                                                                                                                                                                                                                                                                                     |
|             | `flight_staffing_requirement`      | `flight_id`, `function_id`, `required_count` (> 0); unique (`flight_id`, `function_id`)                                                                                                                                                                                                                                                                                                                                                         |
| Assignments | `assignment`                       | `flight_id`, `staff_id`, `team_id` nullable, `starts_at`, `ends_at` (copied from the handling window), `status` enum (`assigned`/`cancelled`/`completed`), `assigned_by`, `override_reason`. Indexes `flight_id`, (`staff_id`, `starts_at`)                                                                                                                                                                                                     |
| Attendance  | `attendance_event`                 | **Append-only**: `staff_id`, `type` enum (`check_in`/`check_out`/`break_start`/`break_end`), `occurred_at`, `shift_date` + `shift_kind` + `team_id` (the shift it was counted for, so reports never move), `recorded_by`, `note`, `corrects_event_id` nullable, `reason` (required on corrections). Indexes (`staff_id`, `occurred_at`), (`team_id`, `shift_date`). Corrections are new events, never edits                                     |
|             | `absence`                          | `staff_id`, `starts_on` / `ends_on` **dates** (Damascus, inclusive; rosters are day-granular), `type` enum (`sick`/`leave`/`no_show`/`other`), `reason`, `recorded_by`, `cancelled_at` nullable                                                                                                                                                                                                                                                 |
| Imports     | `import_batch`                     | `kind` (`staff`/`flights`), `file_name`, `status` enum (`previewed`/`committed`/`failed`), `created_by`, row counts                                                                                                                                                                                                                                                                                                                             |
|             | `import_row`                       | `batch_id`, `row_no`, `raw` jsonb, `parsed` jsonb, `errors` jsonb, `action` (`create`/`update`/`skip`), `target_id`. Drives import preview and Odoo reconciliation                                                                                                                                                                                                                                                                              |
| Audit       | `audit_log`                        | **Insert-only**: `actor_user_id`, `action`, `entity_type`, `entity_id`, `before` jsonb, `after` jsonb, `reason`, `created_at`. Indexes (`entity_type`, `entity_id`), `created_at`                                                                                                                                                                                                                                                               |
| Settings    | `app_setting`                      | Planned. `key` PK (`$type<SettingKey>()`), `value` jsonb (`$type` per key), `updated_by`, `updated_at`. First key `roster.shift_starts` `{ day, night }` (`HH:mm`, Damascus), entered by the admin; changes audited                                                                                                                                                                                                                             |

### Required custom migrations

1. **Overlap constraint** (rule §6.2):
   ```sql
   CREATE EXTENSION IF NOT EXISTS btree_gist;
   ALTER TABLE assignment ADD CONSTRAINT assignment_no_overlap
     EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
     WHERE (status <> 'cancelled');
   ```
2. **RBAC seed** (done: `0001_seed_rbac`, `0004_seed_issue_code`): the 5 roles, all permission keys, and the default `role_permission` matrix. Permission keys are also exported as constants from `#lib/server/rbac/permissions.ts`. Keep the two in sync: adding a key means changing both the constant and a new seed migration.

### Derived data (computed at query time in the MVP, not stored)

- Coverage per flight comes from requirements vs. active assignments.
- Each person's roster per date comes from the `src/lib/roster/` engine: memberships + cycle versions + overrides + absences. Nothing is generated or stored, so nothing needs regenerating when cycles or teams change.
- Missing staff are rostered shifts that have started with no `check_in` event and no absence.
- Worked minutes, short, late, overtime (rounded, Day / Night) and "changed since approval" come from the engine over the attendance events.
- Scheduled vs. available comes from the roster − absences − missing − on break.
- Add an `operational_alert` table only once alerts need acknowledgement or escalation.

### Phase 4+ (do not build yet)

Team alignment / staggering, supervisor accounts and scope, public holidays, overtime export and period locking, `flight_feed_sync`, forecasting tables.

## 8. Authentication (built — history in `plans/TRACKING.md`)

Hand-rolled, no auth library. The auth plan is complete; its full text is `git show e47a970:AUTH_PLAN.md`. A change to auth gets a new plan in `plans/` first.

- **Who signs in:** only `admin` and `operations_manager` accounts (`ACCOUNT_ROLES`). Employees have no accounts; the employee scopes (`EMPLOYEE_ROLES`, `user.issue_code`, `user.manage_operational`) are dormant.
- **Credential:** ID number + a **6-digit code** issued by an admin at `/admin/users` (or `pnpm auth:issue-code`). Codes are random, shown once, Argon2id-hashed, expire (default 7 days), and can't be changed by their holder. There is no password and no change-password page.
- **Lockout:** 5 consecutive wrong codes lock the account until a new code is issued. Rate limit: 5 failures per ID (since the current code) or 20 per IP in 15 min.
- **Sessions:** a `session` row is the source of truth. Web: `httpOnly` cookie, 12 h sliding, never past the code's expiry. API (future CSR client): 10-min HS256 access JWT (`AUTH_JWT_SECRET`) + single-use rotating refresh token at `/api/auth/*`. Every request re-loads the session, so deactivation and new codes cut access immediately.
- **Enforcement:** `hooks.server.ts` fills `locals.user` / `session` / `permissions` / `authMethod`. Layout loads call `requireSignedIn(locals)`; every load and action that needs a permission calls `requirePermission(locals, key)` (or its service does). Services take an `Actor` and write `audit_log` in the same batch.
- **Never** log or return a code, cookie token, refresh token, or password hash; never put them in `audit_log`.

## 9. Scaffold cleanup (done)

- [x] Remove the demo `task` table.
- [x] Replace the marketing `Header.svelte` with the app navigation shell.
- [x] Build the real `src/routes/login/`.
- [x] Replace the `Hi` placeholder.
- [x] `git init`.

## 10. Open questions (ask; do not invent answers)

- The exact role → permission matrix.
- The list of handling functions and required headcount defaults per aircraft type.
- Handling-window minutes before/after STA/STD per direction and aircraft category.
- Assignment conflict rules: is a minimum rest or travel buffer between consecutive flights required?
- Odoo export formats and field mapping for staff and flights.
- Pilot period date range and which flights are in scope.

Resolved (2026-10-27, `plans/ROSTER_PLAN.md` Decisions): shift policy (12 h Day / Night, times entered by the admin), break policy (breaks paid, no limit), late grace (15 min), minimum rest between shifts (not checked), overtime rules, who records attendance (admin only).

## 11. MVP acceptance checklist

- [ ] All pilot-period flights are imported and reconciled against the source.
- [ ] Users only perform actions allowed by their assigned permissions.
- [ ] Overlapping staff assignments are rejected by the backend.
- [ ] The admin can record attendance and identify missing staff (supervisors later).
- [ ] Rosters follow each team's and person's cycle, and overtime per day matches the attendance records.
- [ ] Dispatchers can identify uncovered flights and update assignments.
- [ ] Flight changes and manual overrides are audited.
- [ ] Daily reports reconcile with flight, assignment, and attendance records.
- [ ] Backups and recovery are tested before switching away from Odoo.
