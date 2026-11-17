# B2.1 — dated settings design checkpoint

**Status:** proposed design

**Date:** 2026-11-17

**Goal:** propose a concrete, bounded implementation for B2 (dated overtime factors and off-day leave-conversion override) on top of existing settings/pay-rule infrastructure, then stop for Codex review before writing production code.

## Approved policy this design implements

- TP25/TP33: other new policies start on **2026-11-01**; only the night-overtime factor starts on **2026-10-25**. Existing Guards/Operations night schedules are unchanged.
- TP28/TP29: separately changeable overtime factors for **normal workday, weekly off day and night shift**, with dated versions. Initial Odoo defaults: **1.25 / 1.50 / 1.50**.
- TP30/TP31: night overtime follows the night shift; rate selection is anchored to the **shift-start day** in the configured timezone; no midnight split or stacked rates.
- TP32: off-day leave conversion uses the employee's normal required workday minutes, with an optional **dated company override** for all employees' off-day conversions. The override is optional; without it the employee's own normal minutes apply. Never seed an 8-hour default.
- TP26: leave conversion is a separate HR action; B2 only stores/resolves the setting, B3 posts the ledger.

## Observed existing infrastructure

### Dated version patterns already in the codebase

1. **`pattern_pay_rule`** (`src/lib/server/db/schema/roster.ts:239`)
   - Stores `otEnabled`, `workDayRate`, `offDayRate`, `holidayRate`, `effectiveFrom`, `effectiveTo`, `reason`.
   - `patternId` is `NULL` for company rules; nullable fields mean "inherit".
   - Inheritance: pattern → company → built-in `OVERTIME_DEFAULTS` (`src/lib/payroll/pay-rule.ts:22`).
   - Version change logic: new version closes the open version at `effectiveFrom`; **later versions are removed** (`src/lib/roster/versions.ts:14`, `src/lib/server/services/pattern-pay/pattern-pay.bl.ts:318`).
   - Overlap: custom migration `0020_company_pay_holidays_constraints.sql` adds an `EXCLUDE` so company rows never overlap.
   - **Hard-delete behavior:** `deletePayRules` removes future versions (`pattern-pay.crud.ts:96`). B2 adds a column to this table but does not change its version model; this existing hard-delete behavior is flagged here and not expanded into new work.

2. **`attendance_rule`** (`src/lib/server/db/schema/attendance-rule.ts:20`)
   - Company-only, whole-row versions, one version per `effectiveFrom` (`uniqueIndex` on `effectiveFrom`).
   - New version closes the previous one; **same-date and later-date changes are rejected**, preserving full history (`attendance-rules.bl.ts:53`).
   - Built-in defaults live in code (`src/lib/roster/attendance-rules.ts:27`).
   - This is the model B2 uses for the new company-only off-day leave-conversion setting.

3. **`app_setting`** (`src/lib/server/db/schema/settings.ts:11`)
   - Single JSON value per key, no history.
   - The brief explicitly forbids using this alone for the off-day override because it would discard dated history.

### Existing consumers that would need compatibility changes

- `src/lib/payroll/pay-rule.ts` — `PayRule`, `OVERTIME_DEFAULTS`, `resolvePayRule`, `overtimePay`.
- `src/lib/schemas/pattern-pay.schema.ts` — `payRuleFormSchema` needs a `nightRate` field.
- `src/lib/server/db/schema/roster.ts` — `patternPayRule` needs a `nightRate` column.
- `src/lib/server/services/pattern-pay/pattern-pay.{bl,crud}.ts` — insert/list/resolve logic.
- `src/lib/server/pattern-pay-forms.ts` — form default values and actions.
- `src/lib/app/patterns/PayRuleCard.svelte` and `PayRuleFormSheet.svelte` — display and editing.
- `src/routes/(dashboard)/admin/settings/+page.server.ts` — load data and actions.
- Messages in `messages/{en,ar}.json`.
- Migration SQL for `pattern_pay_rule` column + new table + EXCLUDE.

## Proposed changes

### 1. Night overtime factor: extend `pattern_pay_rule`

**Decision:** add `nightRate` to the existing `patternPayRule` table and `PayRule` type, using the same nullable/inherit semantics as the other three rates.

**Rationale:**

- Reuses the existing version-overlap constraints, audit pattern, inheritance (pattern → company → default), and UI forms.
- Avoids a parallel payroll engine or duplicate version tables.
- A pattern or the company can set only the night rate and leave the others inherited, exactly like today.

**Rejected alternative:** a separate `overtime_factor` version table.

- Reason: it would duplicate the overlap/audit/inheritance infrastructure for one field and create two sources of truth for the "current overtime rule".

#### Proposed schema change

`src/lib/server/db/schema/roster.ts` — add inside `patternPayRule`:

```ts
nightRate: numeric('night_rate', { precision: 4, scale: 2, mode: 'number' });
```

with a check mirroring the other rates (`BETWEEN 1 AND 5`) and update the `has_value` check to count it.

#### Proposed TypeScript contract changes

`src/lib/payroll/pay-rule.ts`:

- Add `nightRate: number | null` to `PayRule`.
- Keep `OVERTIME_DEFAULTS` unchanged (workDayRate 1.25, offDayRate 1.5, holidayRate 1.5); the night rate default is date-aware, not in `OVERTIME_DEFAULTS`.
- Add constants `NIGHT_RATE_DEFAULT_DATE = '2026-10-25'` and `NIGHT_RATE_DEFAULT = 1.5`.
- Update `resolvePayRule` so that for dates `< NIGHT_RATE_DEFAULT_DATE` it returns `nightRate: null` with source `'default'`; for dates `>= NIGHT_RATE_DEFAULT_DATE` it resolves pattern → company → `NIGHT_RATE_DEFAULT` with source tracking.
- `overtimePay` stays unchanged in B2; B4 will decide how to map a night shift to a rate.

`src/lib/schemas/pattern-pay.schema.ts`:

- Add `nightRate: rate` to `payRuleFormSchema` (same 1.00–5.00, two-decimal, nullable, default null validation).
- Update the existing `superRefine` so a night-rate-only version is accepted: at least one of `otEnabled !== 'inherit'`, `workDayRate !== null`, `offDayRate !== null`, `holidayRate !== null`, or `nightRate !== null`.

### 2. Off-day leave-conversion override: dedicated versioned company table

**Decision:** create a new table `offDayLeaveConversion` (company-only, versioned) with nullable `minutes`.

**Rationale:**

- The override is company-wide (TP32), not pattern-specific, so it does not belong in `patternPayRule`.
- It is a leave-conversion setting, not a pay rule; keeping it separate avoids mixing concerns.
- A dedicated table preserves dated history and supports `effectiveTo` semantics the same way `attendance_rule` does.

**Rejected alternative:** store it in `app_setting` as a single JSON row.

- Reason: the brief explicitly forbids discarding dated history; a single row would silently overwrite the previous override.

#### Proposed table

`src/lib/server/db/schema/leave-conversion.ts`:

```ts
export const offDayLeaveConversion = pgTable(
	'off_day_leave_conversion',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		/** Optional company override in minutes; null means "unset, use employee normal workday". */
		minutes: numeric('minutes', { mode: 'number' }),
		effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
		effectiveTo: date('effective_to', { mode: 'string' }),
		reason: text('reason').notNull(),
		createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		uniqueIndex('off_day_leave_conversion_from_unique').on(t.effectiveFrom),
		check(
			'off_day_leave_conversion_minutes_positive',
			sql`${t.minutes} IS NULL OR ${t.minutes} > 0`
		),
		check('off_day_leave_conversion_reason_present', sql`length(trim(${t.reason})) > 0`),
		check(
			'off_day_leave_conversion_effective_order',
			sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} > ${t.effectiveFrom}`
		)
	]
);
```

A custom migration adds:

```sql
ALTER TABLE "off_day_leave_conversion" ADD CONSTRAINT "off_day_leave_conversion_no_overlap"
  EXCLUDE USING gist (daterange("effective_from", "effective_to", '[)') WITH &&);
```

#### Proposed TypeScript contract

`src/lib/schemas/leave-conversion.schema.ts`:

```ts
export const offDayConversionFormSchema = z.object({
	effectiveFrom: isoDate,
	minutes: z.number().positive().finite().nullable().default(null),
	reason
});
```

`src/lib/leave/conversion.ts` (pure resolver):

```ts
export type ResolvedOffDayConversion = {
	minutes: number | null;
	versionId: string | null;
	source: 'default' | 'company';
};

export function resolveOffDayConversion(
	versions: readonly OffDayConversionVersion[],
	date: string
): ResolvedOffDayConversion;
```

A `null` result means "use the employee's normal workday minutes" (the default). A numeric result means "use this company override".

### 3. Default initialization and the 2026-10-25 boundary

- **`PayRule` type:** add `nightRate: number | null`. Before the night category exists, the resolved night rate is `null`; B4 will treat `null` as "no night premium" and fall back to the existing work-day/off-day behavior.
- **Code defaults:** `OVERTIME_DEFAULTS` in `pay-rule.ts` keeps the existing three rates (`workDayRate: 1.25`, `offDayRate: 1.5`, `holidayRate: 1.5`) and does **not** include a night rate. It remains the fallback for the three existing categories.
- **Date-aware night-rate fallback (resolver-level):**
  - Before **2026-10-25**: `resolvePayRule` always returns `nightRate: null`, regardless of stored versions. Existing pattern/company versions continue to resolve exactly as they do today for `workDayRate`, `offDayRate`, and `holidayRate`.
  - From **2026-10-25 onward**: `resolvePayRule` resolves `nightRate` using the same inheritance chain as the other rates — pattern value → company value → **approved 1.50 default** (`NIGHT_RATE_DEFAULT`). A stored `null` night rate means "inherit" and falls back to the next level; if no level sets it, the 1.50 default applies.
- **October preservation against arbitrary existing versions:** any existing company or pattern versions dated before 2026-10-25 keep their current effect on the three existing rates and have no effect on `nightRate` for those dates. No existing row is overwritten or backdated.
- **Off-day conversion:** no seed override; `resolveOffDayConversion` returns `null` until HR saves a version with a numeric `minutes`.
- **Never seed 8 hours:** the override table starts empty.

**Resolver-level vs. seeded row:** a seeded company row would risk overlapping existing company versions and would pin normal/off-day/holiday values to 1.25/1.50/1.50, overriding any existing configured values. The resolver-level boundary preserves existing configured values and historical versions, so it is the recommended approach.

### 4. Edit, clear, same-date, future-version and concurrency behavior

#### Off-day leave-conversion override (new table)

Uses the `attendance_rule` history-preserving model:

1. A new version must have an `effectiveFrom` that is not already used (`uniqueIndex` on `effectiveFrom`).
2. The open version (if any) is closed at `effectiveFrom`.
3. If any version has `effectiveFrom > newEffectiveFrom`, the change is rejected (`attendance_rules.bl.ts:53` style).
4. **No rows are deleted.** Full history is preserved.
5. Same-date changes are rejected with `ConflictError`.

**Clearing an override:** HR saves a version with `minutes = null` from a date. This records explicitly "no override from this date forward"; the resolver returns `null` and callers fall back to employee normal minutes.

**Concurrent writes:** the `uniqueIndex` and `EXCLUDE` constraints provide the guard; the service catches `23P01` and returns a typed overlap error.

#### Night overtime factor (`pattern_pay_rule`)

The existing pay-rule version model is unchanged: saving a new version may close the current one and remove future versions (`planVersionChange`). B2 adds the `nightRate` column but does not alter this model or introduce new hard-delete behavior elsewhere.

### 5. Permission and service boundaries

- **View:** `settings.manage` (existing settings page guard).
- **Edit:** `roster.manage` (same as pay rules and attendance rules; these are calculation rules, not arbitrary app settings).
- **Service split:**
  - Night factor: extend `src/lib/server/services/pattern-pay/pattern-pay.{bl,crud}.ts` because it is part of the pay-rule version.
  - Off-day conversion: new `src/lib/server/services/leave-conversion/leave-conversion.{bl,crud}.ts` because it is a separate concern.
- **Audit:** every write is one `batch([...writes, auditInsert(...)])`, mirroring attendance rules and pay rules.
- **Recompute scope:**
  - Changing a **night overtime factor** flags stored attendance days from `effectiveFrom` to today for recompute, because displayed/calculated overtime may change.
  - Changing the **off-day leave-conversion override** does **not** flag attendance recomputation and does **not** revise previously posted leave debits. It only affects future leave-debit postings; posted debits keep the divisor that was resolved at posting time.

### 6. Implementation slices (separately reviewable)

1. **Schema + migration**
   - Add nullable `night_rate` to `patternPayRule`.
   - Create `offDayLeaveConversion` table with exact `numeric` minutes column and overlap constraint.
   - No seed data.

2. **Pure resolvers**
   - Update `resolvePayRule` with date-aware night default.
   - Add `resolveOffDayConversion`.
   - Add unit tests for boundaries, inheritance, and fractional-minute round-trip.

3. **Shared schemas + leave-conversion service**
   - Add `offDayConversionFormSchema`.
   - Add `leave-conversion.{bl,crud}.ts` with history-preserving version model, permissions, audit, no recompute.

4. **Pattern-pay extension**
   - Add `nightRate` to `payRuleFormSchema`, forms, CRUD, BL, and UI.
   - Add synthetic DB tests.

5. **Settings page integration**
   - Load off-day conversion versions and form on `/admin/settings`.
   - Add `OffDayConversionCard` component.
   - Add bilingual messages.

6. **Manual review**
   - Verify 2026-10-24 shows `nightRate: null`; 2026-10-25 shows 1.50 default.
   - Verify existing company/pattern versions still resolve as before for the three existing rates.
   - Verify off-day override save/clear does not recompute attendance or change posted debits.

### 7. Exact file list (proposed)

No files are created or modified in B2.1; this is the implementation checklist for the next task.

#### Schema / DB

- `src/lib/server/db/schema/roster.ts` — add nullable `nightRate` to `patternPayRule`.
- `src/lib/server/db/schema/leave-conversion.ts` — new `offDayLeaveConversion` table.
- New migration SQL (not generated now):
  - Add nullable `night_rate numeric(4,2)` to `pattern_pay_rule`.
  - Create `off_day_leave_conversion` table with `minutes numeric`, index/checks/EXCLUDE.
  - No seed data.

#### Shared schemas

- `src/lib/schemas/pattern-pay.schema.ts` — add `nightRate` to `payRuleFormSchema`.
- `src/lib/schemas/leave-conversion.schema.ts` — new `offDayConversionFormSchema`.

#### Pure logic

- `src/lib/payroll/pay-rule.ts` — add nullable `nightRate` to `PayRule`; keep `OVERTIME_DEFAULTS` unchanged; add `nightRate` to `FIELDS` resolution so a `null` result is possible.
- `src/lib/leave/conversion.ts` — new pure resolver `resolveOffDayConversion`.

#### Services

- `src/lib/server/services/pattern-pay/pattern-pay.bl.ts` — handle `nightRate` in forms/resolve; recompute reach.
- `src/lib/server/services/pattern-pay/pattern-pay.crud.ts` — insert/list `nightRate`.
- `src/lib/server/services/leave-conversion/leave-conversion.bl.ts` — new BL for off-day override (get/set, permissions, audit).
- `src/lib/server/services/leave-conversion/leave-conversion.crud.ts` — new CRUD for `offDayLeaveConversion`.

#### Forms / routes

- `src/lib/server/pattern-pay-forms.ts` — add `nightRate` default; actions unchanged.
- `src/routes/(dashboard)/admin/settings/+page.server.ts` — load off-day conversion versions + form; wire action.

#### UI

- `src/lib/app/patterns/PayRuleCard.svelte` — show night rate tile and history column.
- `src/lib/app/patterns/PayRuleFormSheet.svelte` — add night-rate field.
- `src/lib/app/settings/OffDayConversionCard.svelte` — new card for the override (list + form sheet).
- `src/routes/(dashboard)/admin/settings/+page.svelte` — render the new card.

#### Messages

- `messages/en.json` and `messages/ar.json` — keys for night rate, off-day conversion override, validation errors.

#### Tests

- `src/lib/payroll/pay-rule.test.ts` — night-rate resolution tests, including pre-2026-10-25 `null` and post-boundary `1.50`.
- `src/lib/leave/conversion.test.ts` — off-day override resolution tests.
- `src/lib/server/services/leave-conversion/leave-conversion.test.ts` — new synthetic DB tests for set/clear/overlap/audit.
- `src/lib/server/services/pattern-pay/pattern-pay.test.ts` — **new** synthetic DB tests for night rate persistence (no existing test file).

### 7. Boundaries with B3 and B4

- **B2 does not:** post or reverse leave ledger entries, read balances, cap debits, or decide debit timing.
- **B2 does not:** change how overtime is calculated, how shifts are classified as night, how holiday precedence works, or the existing calculation effect of `otEnabled` (TP18's display-only hiding is a B4 concern).
- **B2 does not:** run migrations or touch production data.
- **B3** will call `resolveOffDayConversion(date)` and the employee's normal minutes to choose a divisor, then post the ledger.
- **B4** will call `resolvePayRule(patternVersions, date, companyVersions)` to obtain `nightRate` and integrate it with shift-start-day attribution.

### 8. Migration requirements and deployment compatibility

1. **Additive only:** add nullable `night_rate` column and a new `off_day_leave_conversion` table. No data transformation of existing rows.
2. **No seed data:** the night-rate default is handled by the resolver; no company `pattern_pay_rule` row is inserted. The off-day conversion table starts empty.
3. **Storage compatibility:** `off_day_leave_conversion.minutes` uses `numeric` without precision/scale so fractional minutes store exactly; validation is `z.number().positive().finite()`.
4. **Apply to all three databases** (`attendance_app_test`, `attendance_app_e2e`, then `attendance_app` after row-count check and user approval).
5. **Synthetic validation before production:**
   - Run `pnpm test` and `pnpm check` with the new schema/types.
   - Apply migration to `attendance_app_test` and `attendance_app_e2e` without asking.
   - Apply migration to `attendance_app_e2e`; verify screens in both EN/AR, RTL, and that 2026-10-24 still uses the existing three defaults with `nightRate: null`.
   - Production gate: row-count check on `attendance_app` (`pattern_pay_rule` row count unchanged, new table empty), then user approval, then `pnpm db:migrate`.

### 9. Synthetic test matrix

| Area                      | Test                                                                                                                       | Pure / DB     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Date boundaries           | Resolver returns `nightRate: null` before 2026-10-25; from 2026-10-25 pattern → company → 1.50 default.                    | Pure          |
| History preservation      | Saving a new override on 2026-12-01 closes the 2026-11-01 version but keeps it in history; no rows deleted.                | DB            |
| Inherited factors         | Pattern night rate wins over company night rate; before 2026-10-25 resolves to `null`; from that date unset inherits 1.50. | Pure          |
| Invalid values            | Reject rate 0.999, 5.01, NaN, 3 decimals; reject override minutes 0, negative, NaN, Infinity.                              | Pure (schema) |
| Fractional-minute storage | A value like 60.75 minutes is stored and resolved unchanged (round-trip).                                                  | DB            |
| Unset/cleared override    | Saving `minutes = null` from a date makes resolver return `null`.                                                          | Pure + DB     |
| Permissions               | `settings.manage` can view; `roster.manage` can edit; others denied.                                                       | DB            |
| Audit atomicity           | One batch contains close + insert + audit row.                                                                             | DB            |
| Night recompute           | Changing a night factor flags attendance days for recompute.                                                               | DB            |
| Override no recompute     | Changing the off-day override does not flag attendance recomputation or revise posted debits.                              | DB            |
| Concurrent/overlap        | Same `effectiveFrom` or overlapping ranges are rejected.                                                                   | DB            |
| Unchanged October outputs | Before 2026-10-25, preserve existing configured rates and return `nightRate: null`.                                        | Pure          |

## Open questions / approval points

1. **Permission choice:** proposal uses `roster.manage` for edits (same as pay rules). Confirm or choose `settings.manage`.
2. **Future versions for off-day override:** proposal follows `attendance_rule` and rejects any change before an existing later version. Confirm this is acceptable, or approve a model that allows inserting future versions.
3. **Night-rate UI placement:** proposal places it in the existing Company/PayRule card. Confirm, or prefer a separate "Overtime categories" card.
4. **Override minutes label:** confirm the Arabic/English messages for "employee normal workday fallback" vs "company override".
5. **Resolver-level night default:** confirm the approved 1.50 night rate should be applied by the resolver from 2026-10-25 when no pattern/company value exists, rather than by seeding a row.

## Rejected alternatives summary

| Alternative                                               | Why rejected                                                                                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single `app_setting` row for off-day override             | Discards dated history; explicitly forbidden by brief.                                                                                              |
| Separate `overtime_factor` version table                  | Duplicates existing overlap/audit/inheritance infrastructure for one field.                                                                         |
| Adding off-day conversion override to `pattern_pay_rule`  | The override is company-only (TP32), not pattern-specific, and is a leave concern, not a pay rule.                                                  |
| Using `pattern_pay_rule`'s version model for the override | That model removes future versions (hard-delete); the override uses the history-preserving `attendance_rule` model.                                 |
| Seeding a company `pattern_pay_rule` row for 2026-10-25   | Would overlap existing company versions and override configured normal/off-day/holiday values; resolver-level boundary preserves existing versions. |
| Seeding 8-hour default override                           | User did not supply a number; never invent defaults.                                                                                                |

## Verification for this design document

- `pnpm exec prettier --check plans/2026-11-17-b2-dated-settings-design.md` — format check.
- `git diff --check` — whitespace check.

No implementation checks, database tests, or Svelte autofixer runs were performed because B2.1 is design-only and no production code changed.
