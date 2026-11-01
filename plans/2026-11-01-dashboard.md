# Dashboard: today, staffing, people and (later) the payroll period

**Status:** proposed (2026-11-01; waiting for the user's approval and answers to Q-K1–Q-K5)
**Date:** 2026-11-01
**Goal:** Turn the empty `/dashboard` (a placeholder line today) into HR's first screen: a row of
"today" numbers, today's and the next 14 days' staffing, people and data-quality charts, and
— once the payroll engine exists — the payroll period's attendance, overtime and readiness to
close. Every number is a **count or a total** (CLAUDE.md §1) and every chart **opens the list
behind it**. This is the detailed plan of the main plan's S4.4 dashboard part (F14).

**Lane:** A. Read `CLAUDE.md` first: §1 (counts only, health data), §3 (UI rules: `Card`, tokens
only, `chart-1…5`, a chart library loads with `import()`), §8 (the "On your laptop" hand-off).
Load the `dataviz` skill before writing the first chart. One commit per phase, plan included.

---

## 0. Starting point (checked 2026-11-01)

- `src/routes/(dashboard)/dashboard/+page.svelte`: title + `m.dashboard_placeholder()` only; no
  load. Sidebar entry exists (`nav.ts`, `SquaresFourIcon`).
- Charts: `layerchart` 2.9 + `d3-scale` / `d3-shape` are installed; shadcn-svelte's chart wrapper
  is in `#lib/components/ui/chart/` (`ChartContainer`, tooltip, style). Theme tokens `chart-1…5`
  exist in `src/routes/layout.css` (burgundy theme), plus `shift-1…8` for shifts.
- Data the app has **now**: staff (active, department, team, start date, profile fields incl. ID
  number, Arabic names, ID expiry), departments, teams, management (`listGaps`, chains), the
  roster engine (`rosterRange`, `staffing` from builder 2.4), manual punches
  (`attendance_event`), absences, documents (`documentSummary`), custody.
- Data the app does **not** have yet: day results (status, OT, shortage, Final) — they come from
  the payroll engine (S4.1–S4.3) and `period` (S3.1).

## 1. Decisions (defaults; stop and ask before departing from one)

| # | Decision | Why |
|---|---|---|
| K1 | **Four rows, top to bottom:** (1) today's tiles, (2) today's and the next 14 days' staffing, (3) people & data quality, (4) the payroll period. Rows 1–3 now (phases 1–4); row 4 after S4.1–S4.3 (phase 5) | Today first, then planning, then housekeeping; row 4 needs data that doesn't exist yet |
| K2 | **Counts and totals only.** No names on the dashboard except the "top overtime" list (row 4, pay data HR already sees). Sick and leave appear only as **aggregates** (R18: health data); no per-person sick view here | CLAUDE.md §1; brief R18 |
| K3 | **Every tile and bar is a link** to the list behind it (`localizedHref` + query filters on `/employees`, `/attendance/entry`, `/management`, the team page) | A number is only useful if it leads to the people to fix |
| K4 | **Filters in the URL** (GET form, CLAUDE.md §3): department (with sub-departments, nearest-first like D10) and date (default today). Row 4 adds the period. No "view as" (dropped in the management plan) | Bookmarkable, shareable state; same pattern as the other pages |
| K5 | **One BL** `services/dashboard/dashboard.bl.ts` (`staff.write`, as `/employees`) returning plain counts for the page; it **reuses** existing services and pure helpers (roster engine, `staffing`, `listGaps`, `documentSummary`) and adds a pure `src/lib/workforce/dashboard.ts` for the counting (Vitest) | One load, tested counting, no duplicate rules |
| K6 | **Charts with `layerchart` through `#lib/components/ui/chart`**, colours only from `chart-1…5` (and `shift-*` for shift series via `shiftColourClass`), **loaded with `import()`** inside the chart components so the page shell stays light (CLAUDE.md §3 performance). Number tiles are plain `Card`s, no library | Library already installed; tokens keep light/dark themes right |
| K7 | **No live refresh.** The page loads on open and on filter change; a "refreshed at hh:mm" line and a refresh button (`invalidate('app:dashboard')`) | A local single-user app; polling adds load for little value |
| K8 | **Empty and partial data are normal:** each card shows the `Empty` state (`#lib/app/state/`) with what is missing ("No roster for today: assign a pattern") instead of a zero chart | Many departments have no patterns or punches yet |

Questions for the user (each default above is used until answered):

| # | Question | Default |
|---|---|---|
| Q-K1 | "Missing punch" today: only check-in without check-out, or also **planned but no punch at all** after the shift start + grace? | Both, as two numbers |
| Q-K2 | Staffing chart range: **14 days** from today, or the rest of the payroll period? | 14 days |
| Q-K3 | Which profile fields count for **data completeness**? | ID number, Arabic name parts, start date, required documents received, at least one emergency contact |
| Q-K4 | **ID expiry** warning windows? | 30 / 60 / 90 days, and already expired |
| Q-K5 | Should the dashboard be the **home page** after opening the app (instead of `/`)? | Yes: `/` redirects to `/dashboard` |

---

## 2. What each card shows

### Row 1 · Today at a glance (number tiles, phase 2)
| Tile | Value | Opens |
|---|---|---|
| Active employees | active staff in the filter; "+N started this month" (start date) | `/employees?status=active` |
| Planned today | people with a shift today (roster engine), split by shift code | `/attendance/entry?date=today` |
| Punched in | planned people with a check-in for today's shift date, "41 of 58" | entry sheet |
| Missing punches | (a) check-in without check-out, (b) planned, shift started + grace passed, no punch (Q-K1) | entry sheet, filtered |
| Off / absent today | planned off + absences, by absence type as counts | `/employees` (filtered) |

### Row 2 · Staffing (phase 3)
1. **Planned vs present by shift, today**: grouped bars per shift code (planned, punched in).
   *Purpose:* which shift is short right now.
2. **Staffing next 14 days** (Q-K2): stacked bars per day, one series per shift (shift colours),
   from the roster engine's `staffing`. *Purpose:* see thin days before they happen.

### Row 3 · People & data quality (phase 4)
3. **Headcount by department**: horizontal bars, active staff, sub-departments rolled up on a
   toggle. *Purpose:* where people are; a 0 is a setup gap.
4. **Data completeness** (Q-K3): one progress bar per item ("274 of 312 have an ID number"), each
   bar a link to the employees missing it. *Purpose:* HR's profile to-do list.
5. **Management gaps**: the counts from `listGaps` (team without supervisor, department without a
   manager in its chain, …), each a link to `/management`. *Purpose:* fix the structure.
6. **ID cards expiring** (Q-K4): counts for expired / ≤ 30 / ≤ 60 / ≤ 90 days. *Purpose:* renew
   on time.

### Row 4 · Payroll period 21 → 20 (phase 5, after S3.1 + S4.1–S4.3)
7. **Daily attendance status**: stacked bars per day (on time, grace, late, shortage, overtime,
   absent, missing info). *Purpose:* the period's health and trends.
8. **Overtime vs shortage by department**: diverging bars (shortage left, OT right, minutes).
   *Purpose:* who over- or under-works; OT cost.
9. **Top overtime**: top 10 employees by OT minutes in the period (names allowed here, K2).
   *Purpose:* check before close.
10. **Period readiness**: days entered / approved / remaining and "N missing punches to fix before
    close". *Purpose:* is the period ready for the Payroll and Period Balance exports (S5)?

## 3. Tasks

### Phase 0 · Agree the plan
- [ ] 0.1 The user approves K1–K8 (or changes them) and answers Q-K1–Q-K5 (or keeps the
      defaults); decisions log statuses `proposed` → `approved`.

### Phase 1 · Counting engine and service
- [ ] 1.1 `src/lib/workforce/dashboard.ts` (pure, no DB/SvelteKit): `todayTiles(people, rosterDays,
      events, absences, now)`, `completeness(profiles)`, `expiryBuckets(dates, today)`,
      `headcount(people, departments)`.
- [ ] 1.2 Vitest with **made-up** people: a night shift that started yesterday counts for
      yesterday's shift date; check-in without check-out; planned-not-punched only after start +
      grace; an inactive person never counts; expiry buckets at the 30/60/90 edges; sub-department
      roll-up. **Done when** `pnpm test` is green
- [ ] 1.3 `services/dashboard/dashboard.{bl,crud}.ts`: `getDashboard(actor, { date, departmentId
      })` → all counts of rows 1–3 in one call; queries only counts or the ids the engine needs.
- [ ] 1.4 `src/routes/(dashboard)/dashboard/+page.server.ts` load (`depends('app:dashboard')`) +
      the GET filter (department `Select`, date).

### Phase 2 · Row 1 tiles
- [ ] 2.1 `#lib/app/dashboard/StatTile.svelte` (Card, value, label, optional delta, link).
- [ ] 2.2 The five tiles with links (K3); "refreshed at" + refresh button (K7).

### Phase 3 · Row 2 charts
- [ ] 3.1 `#lib/app/dashboard/ShiftBars.svelte` (planned vs present) and `StaffingChart.svelte`
      (14 days), `layerchart` via `import()` (K6), shift colours, accessible table fallback
      (`sr-only` data table).
- [ ] 3.2 `Empty` states (K8).

### Phase 4 · Row 3 charts
- [ ] 4.1 Headcount bars, completeness bars (links), management gaps (counts → `/management`),
      ID expiry buckets.
- [ ] 4.2 `/` → `/dashboard` redirect if Q-K5 = yes.
- [ ] 4.3 en + ar strings (`dashboard_*`), RTL in `/ar` (bars grow from the inline start),
      dark mode; `svelte-autofixer`, `pnpm check`, eslint + prettier, `pnpm test`.

### Phase 5 · Row 4 (blocked until S3.1 `period` and S4.1–S4.3 `day_result`)
- [ ] 5.1 Period filter; status-per-day, OT vs shortage by department, top overtime, readiness;
      counting in `dashboard.ts` + Vitest; links to the roster and the period page.

### Phase 6 · Verify
- [ ] 6.1 Manual check **by the user** on `attendance_app_e2e` (made-up people): tiles match the
      entry sheet for today (planned, punched, missing); a night shift entered for yesterday counts
      yesterday; the 14-day chart matches a team's staffing strip; completeness and expiry counts
      match the employee filters they open; every tile/bar opens the right list; department filter
      changes every card; `/ar` and dark mode read correctly. **Done when** the user reports every
      line holds
- [ ] 6.2 Playwright (written, the user runs it): open the dashboard, change the department, click
      "Missing punches" → the entry sheet opens filtered.
- [ ] 6.3 Tick, README row, decisions statuses, commit.

---

## Risks

- **Shift dates vs calendar dates:** a 20:00 → 08:00 night belongs to the day it starts (brief
  §10.2). "Today" tiles must use shift dates, tested in 1.2.
- **Load time:** counting 312 people × 14 days through the roster engine on every open; keep it
  in one load, measure, and cache per request only if the user reports it is slow.
- **Health data:** absence types stay aggregated (K2); the per-person attendance-pattern view (R18)
  is not part of this plan.
- **Scope creep:** row 4 waits for the payroll engine; no new reports here (S5 does the exports).

## Verification (each phase)

`pnpm check`, eslint + prettier on touched files, `pnpm test`, `svelte-autofixer` clean, `git
status` without data files, no real names in fixtures, tests, plans or commits. Agents don't start
a dev server, open a browser, run Playwright or install packages; every reply that changes code
ends with the "On your laptop" hand-off (CLAUDE.md §8).
