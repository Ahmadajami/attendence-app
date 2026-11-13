# CLAUDE.md — Attendance App

Monthly rosters, attendance calculation and payroll exports for the
airport's HR, as a standalone **SvelteKit** app. It replaces the Odoo module
`roster_attendance`. **All data lives in this app** (seeded once from Odoo;
punches entered by hand now, file import later; new hires get an
app-generated employee number). Odoo **only sends the attendance emails**.

**Start here:** `plans/2026-11-13-october-odoo-november-new.md` (the one plan:
decisions, the two rule sets, tasks with "done when"). Plain-language overview with diagrams (EN/AR):
`docs/architecture-guide.html`. UI reference: `docs/mockup/attendance-builder.html`.
Every decision with its reasons and the rejected alternatives (EN/AR):
`docs/decisions.html` (rules in §6).

## 1. Real data rules (non-negotiable)

This app holds **real personal data** of airport staff (names, badges,
punches, sick days = health information).

- **Never write personal data** in code, tests, fixtures, commit messages,
  plans, docs or chat answers: no names, badges, phone numbers, emails,
  leave reasons. Use counts, aggregates and record IDs. Tests and fixtures
  use **made-up people** only.
- **Data files never enter this repo.** Exports from Odoo, punch files,
  Excel outputs, DB dumps and logs with data live in `~/secure/syravia/`
  (mode 700; files 600). The versioned pre-commit hook (`tools/hooks/`)
  blocks the usual file types.
- **No cloud.** No Neon, Vercel, CDN, analytics, error-reporting SaaS or
  any external service receives data. Runtime network calls go only to the
  local PostgreSQL and to Odoo (emails).
- **Local only while there is no login:** the dev server and the app DB
  listen on `127.0.0.1` only. Never `0.0.0.0`, tunnels or port forwarding.
- Ask the user before dropping or overwriting a database, deleting anything
  in `~/secure/syravia/`, or exposing anything on the network.
- **The user does all browser testing and all package changes.** Agents
  never open the app in a browser, never start a dev server to check
  something at runtime, and never run Playwright. A plan's "manual check" is
  a checklist handed to the user and ticked only when the user reports the
  result. Agents never install, uninstall, add, remove or upgrade packages
  (`pnpm add/remove/install/update`, browser binaries, system packages):
  write the exact command for the user and wait. Static checks stay with the
  agent: `pnpm check`, `pnpm test`, eslint, prettier, `svelte-autofixer`.

## 2. Reference material (read-only)

- `docs/reference/BRIEF.md` — business rules: §4 (R1–R18, golden numbers
  G1–G8), §9 (data model ideas), §10 (engine, overnight matching), §11
  (test cases N/A/S/O/H).
- `docs/reference/DIFF_OLD_VS_NEW.md` — §4 how the Payroll and Period
  Balance reports differ; §8 recompute check; P1–P25 known problems.
- `docs/reference/OPEN_QUESTIONS.md` (Q1–Q18), `DATA_PROFILE.md` (counts),
  `OLD_MODULE_INVENTORY.md`, `DECISIONS_PHASE0_1.md` (D0–D22).
- `docs/reference/schedule_spec/` — the overnight-shift and cycle maths in
  Python with 11 tests: port them 1:1 to TypeScript.
- The old Odoo module (for line references only):
  `/home/xxskullxx/Documents/Syravia-projects/Roster/custom_addons/roster_attendance/`.
  ⚠️ Its tests and some comments contain **real employee names and badges**
  (`tests/test_biotime_sync.py`, `test_night_shift_import.py`,
  `test_period_balance_day_hours.py`, `models/period_balance_report.py`
  :14,85,478,807, `models/raw_attendance_log.py`:279). Port **logic only**;
  never copy their comments, docstrings or example values.
- Golden numbers (real data, outside any repo): `~/secure/syravia/golden/`.

## 3. Conventions

The template's rules apply in full. The UI and Forms rules are copied
below; read the rest in `docs/template/CLAUDE.md`
§3 ("Stack & conventions", "Service layer", "Shared zod
schemas", "Backend typing", "Services, errors & types", "Error handling"),
§6 rules 1, 3, 4, 5, 6 (server-side permissions, audit every mutation, time
as `timestamptz`, en+ar strings with logical/RTL utilities, never
hard-delete) and §7 "Conventions". In short: SvelteKit 3 + Svelte 5 runes,
pnpm only, `#lib` imports (not `$lib`), env vars declared in `src/env.ts` and
read from `$app/env/private`, superforms v3 + zod 4 with one shared schema per
service, shadcn-svelte `lyra` + phosphor icons, `localizedHref()` for every
internal link, every string through `m.*()` in **both** `messages/en.json` and
`messages/ar.json`, services split into `<service>.bl.ts` (permission, rules,
audit, errors; the only thing routes import) and `<service>.crud.ts` (queries;
writes return unexecuted queries), `AppError` subclasses for expected
failures.

### UI rules (from `docs/template/CLAUDE.md`; mandatory for every `.svelte` change)

| Area | Rule |
|---|---|
| UI | Tailwind CSS 4 (`src/routes/layout.css`), shadcn-svelte (style `lyra`) in `#lib/components/ui`. Add components with `pnpm dlx shadcn-svelte@latest add <name>`. Use `cn()` from `#lib/utils.js`. |
| Cards | Use `Card.*` from `#lib/components/ui/card` for any card/panel. **Never change a card's border**: no `border`/`ring`/`rounded` overrides on `Card.Root`, and no hand-rolled `border bg-card` look-alikes. |
| Icons | **phosphor-svelte** (the `components.json` icon library), imported per icon: `import ListIcon from 'phosphor-svelte/lib/ListIcon'`. Don't add new lucide usages. |
| Feedback | `svelte-sonner` toasts (`<Toaster />` is in the root layout); `mode-watcher` (`<ModeWatcher />` in the root layout) for dark mode. |
| Dates | `@internationalized/date` for timezone-aware display/parsing. Show instants with `formatDateTime()` from `#lib/utils/datetime.js` (Asia/Damascus, current locale) inside `<bdi>`. |
| i18n | Paraglide JS: `en` (base) + `ar`, strategy `['url', 'cookie', 'baseLocale']` (`/ar/...` prefix). Messages in `messages/{en,ar}.json`; use `m.key()` from `#lib/paraglide/messages.js`. `src/lib/paraglide/` is generated — never edit it. |
| Links | Internal links are **always** `localizedHref('/route')` or `localizedHref('/route', 'ar')` from `#lib/i18n.js`, which returns `localizeHref(resolve(url), { locale })`. Never a plain `href="/x"` or `resolve()` alone (drops `/ar`). Dynamic routes take params: `localizedHref('/employees/[id]', { id })`. `paths.relative` is `false` so it works in SSR. |
| Svelte MCP | For every `.svelte` / `.svelte.ts` file created or edited, run the Svelte MCP `svelte-autofixer` until it reports no issues. Use `get-documentation` for SvelteKit 3 / Svelte 5 APIs instead of guessing. |

- **Markup.** Key every `{#each}` (`(item.id)`; the index only when nothing unique exists). Use declaration tags `{const x = $derived(…)}` / `{let x = $state(…)}` (Svelte ≥ 5.56) instead of the legacy `{@const}`. A plain `{const x = …}` is computed **once** and never updates (unlike `{@const}`), so anything that reads state, props, stores or a block value goes through `$derived`. Local edit state inside a block is `{let x = $state(…)}`. A declaration is visible to its siblings and their children; an inner one with the same name shadows it. The remaining `{@const}` in `NavMain.svelte`, `imports/[id]`, `admin/users` move to declaration tags when touched (not in generated `ui/`). Close snippets with `{/snippet}`.
- **Spacing.** No `space-y-*` / `space-x-*`. Use `flex flex-col gap-*` or grid `gap-*`. Sibling-margin spacing breaks when children render conditionally.
- **Colors.** Only tokens defined in `src/routes/layout.css`: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `chart-1`…`chart-5`, `sidebar-*` (plus their `-foreground` pairs). No raw palette colors (`border-gray-200`). There is **no** `warning`/`success`/`info` token: use `destructive` with opacity (`bg-destructive/10`), or add the token to both `:root` and `.dark` in the same change as its first use. Separators use `<Separator />`.
- **shadcn primitives.** Don't modify `#lib/components/ui/` for one feature. Wrap or compose the primitive in `#lib/app/` instead. Edit `ui/` only for a project-wide fix.
- **Component props.** Type them with `svelte/elements` (`HTMLAttributes<HTMLDivElement>`, `HTMLButtonAttributes`), never `any`. `Snippet` and `Component` come from `svelte`. Merge classes with an array (`class={['base', className]}`) or `cn()`.
- **Back buttons.** phosphor `ArrowLeftIcon` with `rtl:rotate-180`, `href={localizedHref(...)}`, label from `m.*()`. Never choose the icon by `getLocale()`.
- **No template scaffolding.** Nav, user menu, and command items are wired to real routes, session data, and handlers: no placeholder avatars, "Upgrade" links, or fake lists.
- **State components** (`#lib/app/state/`): `ErrorState` (done) renders an `App.Error` and backs `src/routes/+error.svelte` and `(dashboard)/+error.svelte`. `Empty`, `Unauthorized`, `Loader` are planned. Use them instead of ad-hoc empty/error markup.
- **Performance.** No `backdrop-blur`/`blur` on repeated items or sticky/fixed bars. Use `transition-colors`/`-opacity`/`-transform`, not `transition-all`. No looping decorative animations (spinners are fine). A client library over ~10 KB gzip used by one feature (charts, spreadsheet parsing) loads with `import()` when used, never statically in a layout or page.
- **Strings.** Every user-facing string is `m.*()`, including thrown error messages, `setError()` text, toasts, and **default prop values**. Keys are descriptive snake_case prefixed by feature (`flights_error_conflict`), never random phrase keys.

**This app's additions:**

- **Theme tokens added here:** `warning` (non-blocking notices, e.g. entry
  sheet warnings) and the shift palette `shift-1`…`shift-8` +
  `shift-foreground`. A shift stores a palette key (`SHIFT_COLOURS`); show it
  with `shiftColourClass()` (`#lib/app/roster/colours.js`), never as an
  inline colour.
- **Toasts:** forms whose message is `{ kind, text }` (what `failForm`
  returns) spread `statusToasts(onSuccess?)` from `#lib/utils/form-toasts.js`;
  plain `{ notice }` actions use `toastNotice` (`#lib/utils/notice-toasts.js`).
- **GET filter forms** (date, scope, preview range) are navigation, not
  Superforms: a `<form method="GET">` with shadcn inputs/`Select` (`name` on
  `Select.Root`) that submits on change, so the state lives in the URL.
- **No native `<select>`**, no `bind:ref` into array slots (use an
  `{@attach}` that stores the element), no hand-rolled `aria-invalid`.

### Forms (Superforms + Formsnap; from the template)

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
- **`use:enhance` options keep their defaults** (`applyAction: true`, `invalidateAll: true`, `resetForm: true`; don't write them out). Change one only for a reason, stated in a comment next to it:
  - `invalidateAll: 'pessimistic'` when the action saves only **part** of what the load returns, or **several forms share a page**: the load data then wins over the action's returned form, and `reset()` uses it. (This Superforms option keeps its name; it is not SvelteKit's deprecated function.)
  - `resetForm: false` when the form must keep its values after a successful save (an editor that stays open, e.g. `PatternForm`).
  - `applyAction: false` only to isolate a form from other page updates; `applyAction: 'never'` only when you rerun loads yourself and the form must not revert.
  - **Never `onError: 'apply'`.** Superforms turns an `error` result into a failure so typed data isn't lost; expected problems are `fail()` + a message, and the mandatory `onError` toasts the rest.
  - With the default `invalidateAll: true`, a successful submit already reruns the page's loads: don't also call `refreshAll()` in `onUpdated`. (`ShiftFormSheet`, `StaffFormSheet`, `DepartmentFormSheet` still do; remove it when you touch them, after checking the list still updates.)
- **SvelteKit navigation APIs.** Use `refreshAll()` from `$app/navigation`, never the deprecated `invalidateAll()` (it also resets `page.state`). In `goto`, use `{ refreshAll: true }`, not `{ invalidateAll: true }`. For shallow routing, use `goto(url, { state, shallow: true })` (plus `replace: true`), not the deprecated `pushState` / `replaceState`. Rerun a single dependency with `invalidate('app:…')` + `depends()`. Existing `invalidateAll()` calls (`ErrorState.svelte` and the two sheets above) move to `refreshAll()` when touched.
- **Proxies** (`dateProxy`, `intProxy`, `numberProxy`, `booleanProxy`, `stringProxy`, `fieldProxy`, `arrayProxy`, `formFieldProxy`) are created **once**, at the top of the component, from the whole `SuperForm` (not the `form` store), so `{ taint: false }` is available. Bind the input inside `Form.Control` to `$proxy` instead of `$formData.x`.
  - Programmatic writes that aren't user edits use `fieldProxy(form, 'x', { taint: false })`.
  - `intProxy` / `numberProxy` are rarely needed: `bind:value` on `type="number"` converts already. Use one only for its `empty` option (`'null'` / `'undefined'` when the input is cleared).
  - **Dates here are `z.iso.date()` strings** (`yyyy-mm-dd`, e.g. `roster.schema.ts`), so `<input type="date">` binds `$formData.x` directly, with no proxy. Only a `z.date()` field needs `dateProxy(form, 'x', { format: 'date' })`; the default format is a full ISO instant, which a date input can't show.
  - A nested path (`'owner.teamId'`) creates its missing parent objects.
- One component per form. Two forms with the same schema on a page get distinct `superForm` `id`s.

**Differences from the template (this app wins):**

| Topic | Here |
|---|---|
| Atomic writes | `batch([...writes, auditInsert(...)])` from `#lib/server/db/index.js` (postgres.js transaction; `src/lib/server/db/batch.ts`), not Neon's `db.batch` |
| Database | local PostgreSQL in Docker (`docker-compose.dev.yml`), `postgres.js` driver; interactive `db.transaction` is available when a BL really needs read-then-write |
| Deploy | `adapter-node` on a separate facility server (S8); no Vercel, no serverless limits |
| Auth | `AUTH_MODE=local_single_user` (no sign-in, loopback only, `src/lib/server/auth/local-mode.ts`); `login` returns before S8 |
| Scope | no flights/assignments; payroll **is** in scope (the template said "not payroll") |
| Timezone | template code shows `Asia/Damascus`; new code reads the timezone setting (default `Asia/Damascus`) |
| Migrations | `drizzle/0000_baseline` + `0001_constraints_seed` replace the template's history; keep editing the schema → `pnpm db:generate` → read the SQL → `pnpm db:migrate`; custom SQL via `drizzle-kit generate --custom` |

**Commands** (drizzle-kit needs the env loaded):

```sh
docker compose --env-file ~/secure/syravia/attendance_app.env -f docker-compose.dev.yml up -d
pnpm dev                     # http://127.0.0.1:5173 (pinned to loopback)
pnpm check && pnpm test      # types + Vitest (pure logic, Node, no DB)
pnpm exec eslint <files>     # whole-repo `pnpm lint` fails on ~160 untouched template files (mostly generated `ui/`)
set -a; . ./.env; set +a; pnpm db:generate   # / pnpm db:migrate
pnpm auth:create-admin <id> "<name>"         # first admin = the local-mode account
```

- Run the Svelte MCP `svelte-autofixer` on every `.svelte` / `.svelte.ts`
  file you touch until clean; use `get-documentation` for SvelteKit 3 /
  Svelte 5 APIs instead of guessing.
- `pnpm check`, eslint + prettier on touched files and `pnpm test` before
  declaring work done.

## 4. Environment (this laptop)

| Thing | Where |
|---|---|
| App dev server | `http://127.0.0.1:5173` |
| App DB | Docker container `attendance-app-db`, `127.0.0.1:5433`; DBs `attendance_app` (real data), `attendance_app_test` (synthetic, Playwright) and `attendance_app_e2e` (synthetic, manual testing) |
| Manual-test server | `pnpm exec vite dev --mode e2e --port 5174` → `http://127.0.0.1:5174` on `attendance_app_e2e` (gitignored `.env.e2e`, a copy of `.env` with that DB). Never point a dev server at another DB by exporting `DATABASE_URL`: after a reload it falls back to `.env` (real data) |
| Migrations | apply each new one to all three DBs: the two synthetic ones without asking, `attendance_app` after a row-count check and the user's OK |
| Odoo (emails only) | `http://127.0.0.1:8069`, DB `syravia_night_shift`, module `attendance_app_connector`, MailHog `http://127.0.0.1:8025` |
| Secrets | `~/secure/syravia/attendance_app.env` (DB password, Odoo API key) |
| Seed files from Odoo (one-time) | `~/secure/syravia/imports/` |
| Golden snapshot | `~/secure/syravia/golden/` |

The Odoo side (connector module, extraction tool) lives in the Roster repo:
`/home/xxskullxx/Documents/Syravia-projects/Roster`, plan
`plans/2026-10-28-attendance-app-odoo-side.md` there, under that repo's own
CLAUDE.md.

## 5. Plans

Every plan lives in `plans/` (convention in `plans/README.md`). Tick a box
as soon as its "done when" is true, add `> note:` lines with results
(counts and IDs only), commit the plan with the work. Never delete a plan;
a replaced one becomes `**Status:** superseded` with a pointer.
(One reset on the user's instruction, 2026-11-13: the 30 earlier plans were
removed; read one with `git show 39b1bc5:plans/<file>.md`.)

## 6. Decisions log (`docs/decisions.html`)

One self-contained HTML page (English + Arabic, no external resources) that
records **every decision**: what was decided, **why**, and the
**alternatives not chosen** with the reason for each.

- Whenever a decision is made or changed (a `D`/`P`/`E`/`B`/… row in a plan,
  a choice the user makes in chat, a default that changes), add or update
  its entry **in the same change**: one object in the `DECISIONS` array
  with `id`, `group`, `status` (`approved` | `default` | `proposed` |
  `pending` | `replaced`), `date`, `src` (plan file + section), and
  `title` / `decision` / `why` / `alts` in **both** `en` and `ar`.
- A default waiting for the user's answer goes in the `DEFAULTS` table.
- Never delete an entry: a replaced decision gets `status: 'replaced'` and
  names its replacement. When a proposed plan is approved, change its
  decisions to `approved`.
- No personal data (§1): IDs, counts and made-up examples only.
- Check the script after editing (`node --check` on the extracted script).

## 7. Token saving: graphify and RTK

Use both on every task to keep context small.

- **graphify** (knowledge graph of this repo, `graphify-out/`, gitignored,
  local only). Before broad exploration ("where is X", "what calls Y",
  how a flow works), read `graphify-out/GRAPH_REPORT.md` or run
  `graphify query "<question>"`, `graphify path "A" "B"`,
  `graphify explain "X"`; open files only where the graph points. The graph
  can lag behind the code: confirm in the source before editing.
  - Refresh: `graphify update .` after code changes (AST only, no LLM);
    `/graphify . --update` after docs or plans change.
  - `.graphifyignore` excludes generated code, vendored `ui/`, `messages/`,
    `drizzle/meta/` and data files. Add any new generated folder there.
  - Known gaps: `.svelte` files with `<script lang="ts">` parse only
    partially, and `.sql` adds nothing without `graphifyy[sql]`: read those
    files directly.
  - §1 applies: build the graph from this repo only. Never point graphify at
    `~/secure/syravia/` or the old Odoo module (real names), and never use
    its Gemini backend (no cloud).
- **RTK** (`rtk`, Rust Token Killer). It filters and compresses command
  output before it reaches the LLM context: a single Rust binary, 100+
  supported commands, <10 ms overhead. A Claude Code hook rewrites shell
  commands (`git status` → `rtk git status`) and trims their output. Use
  `rtk proxy <cmd>` when the full raw output matters (an exact test failure,
  a diff to read line by line); `rtk gain` shows the savings. Don't bypass
  or disable the hook.

## 8. Hand-off to the user: "On your laptop" (every reply that changes code)

Agents in a cloud session have no `node_modules`, database or browser, so every reply that
changes code ends with an **"On your laptop"** section. Always include it, in this order:

1. **Get the change:** the git commands to fetch and merge the agent's branch into `app/main`
   (each command in its own `bash` block).
2. **Checks the agent could not run:** `pnpm check && pnpm test`, eslint on the touched folders,
   and "Also run the Svelte autofixer on `<each touched .svelte file>`" naming the files.
3. **Migrations:** every migration not yet applied, why it is needed ("must be applied before …,
   or … will fail"), and the commands: `_e2e` first, `attendance_app` only after the row count and
   the user's OK.
4. **Start the test server:** `pnpm exec vite dev --mode e2e --port 5174`.
5. **"Please test on http://127.0.0.1:5174/<route>:"** a numbered checklist, one observable result
   per line (what to click, what must appear), including `/ar/...` (right to left) and anything
   an earlier change could have broken.
6. **Still pending from earlier changes:** repeat every check the user has not yet confirmed
   (keep the list until the user reports it holds), then "paste me any errors".

Keep the pending list in step with the plans' unticked manual-check boxes.
