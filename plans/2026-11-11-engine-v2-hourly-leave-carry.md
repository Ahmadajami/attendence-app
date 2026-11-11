# Engine v2: the discussed rules as settings, then hourly leave by kind, then balance carry

**Status:** to do (proposed 2026-11-11; waiting for approval and the answers to Q-EN1–Q-EN10)
**Date:** 2026-11-11
**Goal:** the app's day engine gives the same figures HR saw in Odoo, plus the improvements
agreed in the off-day-work discussion. Every rule that differed between Odoo and the app becomes a
**setting** (company → department → pattern, dated versions), not a hard-coded constant. Then
HR can record **hourly leave by kind** (annual, sick, mission, unpaid), and **balances carry**:
leave days into the new year, and the attendance **time balance** (overtime − shortage) from one
pay period to the next, with a clear page to review, close and carry.

Order (user, 2026-11-11): **1** engine differences → **2** hourly leave with kinds →
**3** balance carry (both kinds, Q answered 2026-11-11: "Both") with good UI and UX.
Depends on the off-day-work plan (`2026-11-09-off-day-work-and-shift-changes.md`, OW1–OW13),
which is built first: v2 assumes punches may have no shift on an off day and that a shift change
request exists.

Reference: the discussion page `dummy-html/ops-october-entry.html` (deleted 2026-11-11; summary in
`answers/2026-11-11-revision.html`) ran both engines side by side. Its "Odoo rules" column
reproduced Odoo's stored balance on all 126 Operations rows of 1–21 Oct 2026; its "new engine"
column is the target of this plan. The comparison now becomes an app page: plan
`2026-11-11-attendance-import-odoo-and-devices.md` (IM8). Real data: CLAUDE.md §1. This plan uses
made-up people and counts only.

## 0. Where we start (read 2026-11-11)

What the **implemented** engine does (`src/lib/roster/attendance.ts`, `overtime.ts`, `shift.ts`,
`src/lib/attendance/day-result.ts`, `src/lib/payroll/pay-rule.ts`), what the **discussion page**
engine does, and what **Odoo** did (`roster_line.py`, read logic only).

| # | Topic | Implemented today | Discussion page (target) | Odoo | v2 |
|---|---|---|---|---|---|
| 1 | Punch without a shift | every event needs `shift_id`; an unplanned punch is counted for the best-fitting active shift | no shift on a day off (OW1); another shift on a planned day → shift change (OW7, OW9) | punches never had a shift | from the off-day plan |
| 2 | Two segments | closed pairs summed; the gap between pairs is unpaid; `break_start/end` events are paid | same | in1→out2 span minus `break_minutes` | keep |
| 3 | Friday Prayer | none | +60 paid credit on a Friday with two segments (FP1, approved 2026-11-10) | +60 mission credit on import | **add** (EN5) |
| 4 | Credits (paid minutes away) | none | credit counts toward required, paid, never OT | leave / mission / sick / training credit minutes | from hourly leave (Phase 2) + Friday Prayer |
| 5 | Shortage minutes | only a `short` flag | `required − worked − credit` | `shortage_minutes` | **add** column |
| 6 | Day balance ("Final − Required") | none | paid minutes − required, OT weighted | `deduction_extra_pay` | **add** column (EN3) |
| 7 | Period card (Required / Worked / OT / Shortage / Balance) | none | yes, per person | Odoo summary card, period report | **add** (Phase 1 UI) |
| 8 | OT rounding | nearest 15 min, constant | nearest 15 | none | **setting** (EN4, Q-EN2) |
| 9 | Late minutes | raw (check-in − start); `late` status after grace | raw | net of grace | keep raw, show grace |
| 10 | Grace minutes paid (late within grace) | no | no | yes (`_grace_forgiven_minutes`) | **setting** (Q-EN3) |
| 11 | Make-up rule (late beyond grace → surplus is not OT) | no | no | yes | **setting** (Q-EN4) |
| 12 | Tardiness brackets (60/120/240/540) | no | no | shown always, charged only when HR ticks the day | **setting** + day action (Q-EN5) |
| 13 | Early out minutes | no | no | yes, after grace | **add** (display, no pay effect) |
| 14 | Cancel OT on one day | no | no | `suppress_ot` (control panel) | **add** day action |
| 15 | Off-day / holiday rates, OT on/off, person not OT-eligible | pay rule versions (pattern → company → default) | same | config | keep; extend the resolver with the department level |
| 16 | Period netting (shortage eats OT before pay) | no | no | `compute_period_totals`: cheapest OT (×1.25) first | **setting** (Phase 4, Q-EN9) |
| 17 | Carry between periods / years | no | no | no carry (each report period stands alone) | Phases 3 and 4 |
| 18 | Hourly leave | not built (`2026-11-09-hourly-leave.md`, paid/unpaid) | — | minutes only, typed by HR | kinds (Phase 2) |

## 1. Decisions (proposed 2026-11-11 unless marked)

| ID | Decision | Why |
|---|---|---|
| EN1 | **One versioned rule set, three levels:** a new table `attendance_rule` (nullable fields = inherit), rows for the **company** (`pattern_id` and `department_id` NULL), a **department** or a **pattern**, each with `effective_from` / `effective_to`, reason, audit. Resolution per day: pattern → department → company → built-in default (the Odoo values), with the source of each field kept for the explanation (like PR35). The rates stay in `pattern_pay_rule`; its resolver gains the department level too (Q-EN1) | "More configuration" without a constant per rule; dated versions mean a change never rewrites past months silently |
| EN2 | **Settings in v2** (defaults = Odoo unless a question says otherwise): grace minutes (company default 15; a shift's own grace still wins), grace paid (on), make-up rule (on), tardiness brackets (13–30→60, 31–60→120, 61–120→240, 121+→540; charge only when HR ticks the day), OT rounding step and mode (15, nearest), minimum OT per day (0), Friday Prayer (on, 60 min, weekday Friday, needs two segments), early-out tracking (on, uses grace) | Each row of §0 that differed becomes a choice HR can see and change |
| EN3 | **Day balance** = Final − Required, stored on `day_result` with the parts: `credit_minutes`, `shortage_minutes`, `early_out_minutes`, `grace_paid_minutes`, `bracket_minutes` (+ `bracket_charged`), `ot_cancelled`, `final_minutes`, `balance_minutes` (numeric, 2 decimals, because ×1.25 gives quarter minutes). Work day: Final = paid work + credit + OT × (rate − 1) + grace paid − charged bracket. Off day: (rounded work + credit) × off-day rate. Full-day paid state: Final = required. `DAY_RESULT_ENGINE` → 2 so every stored day is recomputed | One number per day that adds up to the period; the parts explain it (explanation drawer) |
| EN4 | **OT minutes and balance are both shown**: "OT 7:25 (paid as 9:16)" and "Balance +10:38", never only the weighted figure | The +10:38 vs 8:47 confusion of 2026-11-10 came from showing only the weighted figure |
| EN5 | **Friday Prayer as an engine rule, not a stored credit row:** the engine adds the credit when the day qualifies (FP1). The day shows a "Friday Prayer +60" tag. A day action "No prayer credit" turns it off for that day (audited) | Re-imports and corrections can't stack or lose it (Odoo needed idempotency code for that) |
| EN6 | **Day actions** on the day editor: Charge tardiness bracket, Cancel OT, No prayer credit. Each is a stored, audited flag on a new `day_adjustment` row (one per person and date), reversible, with a reason | Odoo's per-day HR switches, without editing figures by hand |
| EN7 | **Validation against Odoo before switching on:** a read-only script compares v2 day balances with the October report (secure folder, outside the repo) and lists every difference with its cause; Vitest gets made-up cases for each rule (§5). v2 replaces v1 only when the October comparison shows 0 unexplained rows | The discussion page already reached 126/126 with the Odoo rules; v2 must stay explainable row by row |
| EN8 | *(approved 2026-11-11, user)* **Hourly leave kinds: annual, sick, mission, unpaid.** Annual and sick are paid and come off their balance as a fraction of that day's required time; mission is paid with no balance; unpaid is excused but not paid. Amends `2026-11-09-hourly-leave.md` (HL1 `paid boolean` → `kind`, HL7–HL9) | User's choice of kinds |
| EN9 | **Hourly-leave UX:** in the day editor, "Cover the gap" prefills the range from the last check-out to the shift end (or from the shift start to the first check-in); the kind defaults to the last one used; the day shows the leave as a band on the shift timeline; sick ranges never show a reason outside the editor | Odoo's "Mark partial leave" in one click, but with times |
| EN10 | *(approved 2026-11-11, user: "Both")* **Two carries:** leave days into the new year (the existing `2026-11-09-leave-sick-balances.md`, Hold/Reset), and the attendance time balance between pay periods (Phase 4) | User's answer |
| EN11 | **Time balance by pay period:** a `pay_period` table (start, end, state `open → closed → locked`); one `time_balance` row per person and period: opening (carried in), earned (Σ day balances, after netting if on), paid out, written off, closing, carried out, `closed_by/at`, reason. Closing a period writes these rows; reopening (not locked) reverses them, audited | One place where carry, payout and corrections are visible and undoable |
| EN12 | **Carry settings** (in `attendance_rule`, company → department → pattern): netting on/off (Odoo: on, shortage eats ×1.25 OT first), carry mode (`none` / `both` / `negative_only` / `positive_only`), cap (hours, optional), what happens to a positive balance at close (`carry` or `pay`) | Different teams pay OT differently; the defaults follow the answers to Q-EN8, Q-EN9 |
| EN13 | **One "Balances" page** (`/balances`, sidebar after Attendance): tabs **Time**, **Annual leave**, **Sick leave**; same filters (period or year, department, team, search); per person: opening, earned, used/paid, closing, a sparkline of the last 6 periods, a badge for how the row was opened/closed; **Close period** and **Open year** are sheets with a **preview table first** (what each person will carry, who is over the cap, who has open problems such as missing punches or held shift changes) and Confirm second; each figure opens an explanation drawer listing the days or absences behind it. Replaces the `/leave` page of the balances plan (LB19) | Good UX: one page for every balance, nothing written before a preview, every number traceable |
| EN14 | **Employee page: one Balances card** (time balance of the current period with its days, annual and sick days left, the last carries) | HR answers "how much does this person have" in one place |

## 2. Data model

- `attendance_rule` (EN1, EN2, EN12): `id`, `pattern_id` NULL, `department_id` NULL (at most one set;
  both NULL = company), `grace_minutes`, `grace_paid`, `makeup_rule`, `brackets` (jsonb
  `[{upTo, minutes}]`, zod-checked), `ot_round_step`, `ot_round_mode` (`nearest | down`),
  `ot_min_minutes`, `prayer_enabled`, `prayer_minutes`, `prayer_weekday`, `early_out_enabled`,
  `netting`, `carry_mode`, `carry_cap_minutes`, `positive_at_close` (`carry | pay`),
  `effective_from`, `effective_to`, `reason`, audit columns. All rule fields nullable; a CHECK
  that at least one is set; no overlapping versions per owner (EXCLUDE, custom migration).
- `pattern_pay_rule`: add `department_id` (same pattern as above) for the department level.
- `day_result` (EN3): the new columns in EN3; engine version 2.
- `day_adjustment` (EN6): `staff_id`, `shift_date`, `charge_bracket`, `cancel_ot`, `no_prayer_credit`,
  reason, audit; unique (staff, date).
- Hourly leave: as `2026-11-09-hourly-leave.md` §3 with `kind` (`annual | sick | mission | unpaid`)
  instead of `paid`.
- `pay_period`, `time_balance` (EN11).
- Leave carry: as `2026-11-09-leave-sick-balances.md` §2.

Migrations: generate, read the SQL, apply to `_test` and `_e2e`; `attendance_app` after the row
count and the user's OK (CLAUDE.md §4).

## 3. Pure logic (no DB, Node tests)

- `src/lib/payroll/rules.ts`: `resolveAttendanceRule(versions, date, levels)` → values + sources.
- `src/lib/payroll/day.ts`: v2 day figures from the summary (worked, segments, late, early out),
  credits (hourly leave, Friday Prayer), adjustments and the rule: shortage, OT (rounding, minimum,
  make-up rule, cancel), grace paid, bracket, Final, balance, with an explanation list
  (`{ step, minutes, source }`), ids only.
- `src/lib/payroll/period.ts`: period totals (Required / Worked / OT / Shortage / Balance), netting
  (cheapest rate first, as Odoo `compute_period_totals`), carry (mode, cap, positive at close).
- `day-result.ts` calls `day.ts`; `shiftSummary` stays the punch reader.

## 4. UI

- **Rules** (EN1, EN2, EN12): company settings page section "Attendance rules"; a "Rules" tab on the
  department page and on the pattern page; each shows the values in force with where they come from
  ("from company", "this pattern"), a dated history, and **Change from a date** (sheet with a
  preview: how many stored days in open periods this changes, and the balance difference for the
  first 10 people).
- **Day** (EN3–EN6, EN9): the daily page and the day editor show the balance and its parts, the
  tags (Friday Prayer, bracket charged, OT cancelled, hourly leave kind), the day actions and the
  hourly-leave section.
- **Period card** (EN4, EN14): on the employee page and the attendance month view, the five Odoo
  figures plus OT minutes.
- **Balances page** (EN13).
- Every string in `messages/en.json` and `messages/ar.json`; RTL checked on `/ar/...`.

## 5. Tests (Vitest, made-up people only)

| Case | Expect |
|---|---|
| V1 work day 07:46–20:40 on 08:00–20:00 | OT 54 (rounded 60 when rounding on), balance +67.5 with no rounding |
| V2 Friday 07:30–12:10, 13:25–20:15 | worked 690, prayer +60, shortage 0, balance +30, OT 0 |
| V3 same with "No prayer credit" | shortage 30, balance −30 |
| V4 late 5 min within grace, worked 715 | grace paid 5, shortage 0, balance 0 |
| V5 late 40 min, worked 760 | bracket 120 shown, not charged; OT 0 (make-up); balance +40 |
| V6 V5 with Charge bracket | balance −80 |
| V7 off day 13:00–19:45 | day-off work 405 → 405 (rounding 15), balance +607.5 at ×1.5 |
| V8 Cancel OT on V1 | OT 0, balance 0 |
| V9 hourly leave annual 04:00–08:00 on a night | worked 480 + credit 240, no early out, annual −0.33 day |
| V10 hourly leave unpaid 2 h | not late or short, balance −120 (not paid) |
| V11 period netting: +3 h at ×1.25, −1 h shortage, +2 h off-day | net: ×1.25 2 h, ×1.5 2 h |
| V12 carry `negative_only`, cap none: closing −2:00 | next period opens −2:00; a +5:00 closes at +3:00 net |
| V13 rule versions: pattern rounding 0 from 2026-11-15 | days before keep 15, days from the 15th use 0 |
| V14 October comparison script on the e2e seed | 0 unexplained differences |

## 6. Tasks

### Phase 0 · Prerequisite
- [ ] 0.1 Off-day-work plan approved (Q-OW1–Q-OW13) and built. **Done when** its tasks are ticked.

### Phase 1 · Engine v2 (rules as settings)
- [ ] 1.1 Answers to Q-EN1–Q-EN7; decisions EN1–EN7 approved and recorded in `docs/decisions.html`.
- [ ] 1.2 Migration: `attendance_rule`, `pattern_pay_rule.department_id`, `day_result` columns,
      `day_adjustment`. **Done when** applied to `_test` and `_e2e`; `attendance_app` after the user's OK.
- [ ] 1.3 `rules.ts`, `day.ts` + tests V1–V8, V13. **Done when** `pnpm test` passes.
- [ ] 1.4 `day-result.ts` uses `day.ts`; engine version 2; recompute of open days.
- [ ] 1.5 Read-only October comparison script (secure folder input, output counts and row ids only).
      **Done when** 0 unexplained differences, or each listed with its cause and approved by the user.
- [ ] 1.6 Rules UI (company, department, pattern) with change-from-a-date preview.
- [ ] 1.7 Day UI: balance and parts, tags, day actions (EN6), explanation drawer lines.
- [ ] 1.8 Period card on the employee page and the month view.
- [ ] 1.9 Manual check by the user (checklist in the hand-off; unticked until reported).

### Phase 2 · Hourly leave with kinds
- [ ] 2.1 Amend `2026-11-09-hourly-leave.md` with EN8, EN9 (kinds, cover-the-gap) and get its
      remaining questions answered.
- [ ] 2.2 Build that plan (its own tasks), with V9, V10 here.
- [ ] 2.3 Annual and sick hourly leave counted in the balances (LB23).

### Phase 3 · Leave-day carry (new year)
- [ ] 3.1 Approve `2026-11-09-leave-sick-balances.md` (Q-LB1–Q-LB7) with LB19 replaced by EN13.
- [ ] 3.2 Build it (its own tasks): opening balances, Open year (Hold / Reset), on the Balances page.

### Phase 4 · Time-balance carry (pay periods)
- [ ] 4.1 Answers to Q-EN8–Q-EN10; EN11–EN14 approved.
- [ ] 4.2 Migration `pay_period`, `time_balance`; carry fields in `attendance_rule`.
- [ ] 4.3 `period.ts` + tests V11, V12.
- [ ] 4.4 Close period / reopen (BL: permission, audit, preview then confirm; locked periods refuse).
- [ ] 4.5 Balances page Time tab, employee Balances card, explanation drawers.
- [ ] 4.6 Manual check by the user.

## 7. Questions for the user (defaults in **bold**)

| ID | Question | Default |
|---|---|---|
| Q-EN1 | Rule levels: company → department → pattern? | **yes, all three** (EN1) |
| Q-EN2 | Overtime rounding: keep the app's nearest 15 min, or Odoo's none? | **keep 15, nearest; a setting** |
| Q-EN3 | Pay the minutes of a late arrival within grace (Odoo)? | **yes** |
| Q-EN4 | Late beyond grace: the extra time that day is make-up, not overtime (Odoo)? | **yes** |
| Q-EN5 | Tardiness brackets: shown always, charged only when HR ticks the day (Odoo)? | **yes** |
| Q-EN6 | Show OT minutes and the weighted balance side by side? | **yes** (EN4) |
| Q-EN7 | Friday Prayer also on an off day (Odoo did, paid ×1.5)? | **no: work days only** |
| Q-EN8 | Pay period: calendar month, or 21st → 20th (main plan `period`)? | **calendar month** (the October report and Odoo's card use months) |
| Q-EN9 | Time balance: netting on (shortage eats overtime first, cheapest first)? What carries: both signs, only a negative balance, only a positive one? A cap? Positive balance at close: paid or carried? | **netting on; carry only a negative balance; no cap; positive paid at close** |
| Q-EN10 | One Balances page with Time / Annual / Sick tabs instead of a separate `/leave` page? | **yes** (EN13) |

## 8. Not in this plan

Payroll export columns (the off-day plan's 4.2 and S5), employee requests and approvals (needs
login, S8), night premium (P4), weekly OT basis.
