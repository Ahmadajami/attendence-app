# Daily attendance page: fast with a whole month of everyone

**Status:** in progress (built 2026-11-12; waiting for the user's check in the browser)
**Date:** 2026-11-12
**Goal:** `/attendance/days` is slow now that 310 people have stored days. Make it fast without
changing what it shows or computes, deciding from measurements: first the database indexes, then
how the page loads.

All numbers below are from `attendance_app_e2e`, enlarged with made-up people to the real size
(310 people, 22,377 stored days, 15,155 punches, 204 day edits, 27 teams, 23 departments;
`attendance_app` has 310 people and 22,248 stored days). Counts and milliseconds only.

## 1. Decisions

| ID | Decision |
|---|---|
| DS1 | No new index. Every query of the page already uses one, or reads a table of at most 310 rows. No migration. |
| DS2 | The rows are paged in SQL: 100 rows a page, `?page=<n>` in the URL, Previous / Next under the table. |
| DS3 | The numbers in the card title ("N of M days") and the "no stored record yet" count come from one separate count query over the whole range, not from the shown page. The Status and Source filters run in SQL. |
| DS4 | The catch-up stays in the load, before the rows are read. With nothing flagged it is one index lookup (about 1 ms). Its query names the bare column so the partial index is always usable. |
| DS5 | The catch-up recomputes people flagged over the same dates together, not one by one. |
| DS6 | No streaming (`{#await}`): after DS2 the whole load takes about 10 ms, so there is nothing to wait for. |

Reasons and rejected alternatives: `docs/decisions.html`, group "Speed".

## 2. Indexes (read-only check)

- [x] 2.1 List every query the load runs, and the existing indexes (schema and `pg_indexes`).
  Done when: each query has a plan on e2e (`EXPLAIN (ANALYZE, BUFFERS)`) and on `attendance_app`
  (plain `EXPLAIN`).
  > note: the load runs 8 queries: flagged days, departments, teams, shifts, people in scope
  > (active staff + people with punches in the range, or team members, or department staff),
  > person search, picked person, stored days.
  > note: plan and time per query on e2e (one day / one month, everyone):

  | Query | Plan | Time | Missing or unused index |
  |---|---|---|---|
  | Stored days, everyone, one day (304 rows) | bitmap scan on `day_result_date_idx` | 1.1 ms | none |
  | Stored days, everyone, one month (9,424 rows) | bitmap scan on `day_result_date_idx` | 40 ms | none: the time is reading and sorting 9,424 wide rows, which no index removes (see DS2) |
  | Stored days, one team (6 people) | index scan on `day_result_staff_date_unique` | under 1 ms | none |
  | Stored days, one department (14 people) | bitmap scan on `day_result_staff_date_unique` | 1.4 ms (month) | none |
  | Stored days, one person | index scan on `day_result_staff_date_unique` | 0.2 / 0.3 ms | none |
  | Stored days with a status, first 100 (new) | backward index scan on `day_result_date_idx` | 1.4 ms | none |
  | People with punches in the range | bitmap scan on `attendance_event_date_idx` | 0.4 / 1.6 ms | none |
  | Flagged days | index scan on the partial `day_result_recompute_idx` | 0.03 ms | none; but with a generic prepared plan (`needs_recompute = $1`) it read 22,385 buffers in 8.4 ms, because the partial index cannot be proved usable. Fixed in the query (DS4), not with an index |
  | Active staff, team members, department staff, person search, picked person | seq scan on `staff` (310 rows, 6 pages) or `staff_pkey` | under 0.3 ms | none: a 6-page table is faster to read whole |
  | Departments, teams, shifts | seq scan (at most 27 rows) | under 0.1 ms | none |

  > note: `attendance_app`, plain `EXPLAIN`: the same plans, with two expected differences. The
  > one-month read of everyone is a parallel seq scan (a month is 43% of the table, so the
  > planner is right), and punches are a seq scan (116 rows).
  > note: `day_result (shift_date, team_id)` and `(staff_id, shift_date)` were checked as the
  > brief asked: the page never filters stored days by `team_id` (a scope becomes a list of
  > people), and `(staff_id, shift_date)` exists as the unique index.
- [x] 2.2 Add the indexes the plans show are needed. Done when: the schema, a generated migration
  and both synthetic databases have them.
  > note: nothing to add (DS1). No migration in this plan; `attendance_app` is not touched.

## 3. Where the load spends its time

- [x] 3.1 Time each awaited call of the load with a throwaway script (not committed), no dev
  server. Done when: one day, the default 7 days and one month, everyone, are measured.
  > note: before, median of 5:

  | Range (everyone) | Rows sent | Load on the server | Of which stored days | Catch-up | Page data |
  |---|---|---|---|---|---|
  | One day | 304 | 10 ms | 7 ms | 1.6 ms | 227 KB |
  | 7 days (the default) | 2,128 | 42 ms | 34 ms | 0.9 ms | 1,548 KB |
  | One month | 9,424 | 162 ms | 147 ms | 0.9 ms | 6,836 KB |

  > note: the server was never slow. The page sent every row at once: 9,424 table rows of about
  > 10 components each to render on the server, send, and make interactive in the browser.
  > note: catch-up with flagged rows, one flagged day per person: 10 people 203 ms, 100 people
  > 1,228 ms, 304 people 3,464 ms (about 11 ms a person, one roster load each).

## 4. The fix

- [x] 4.1 Page helper `#lib/utils/pagination.ts` (`parsePage`, `pageWindow`) with tests. Done
  when: Vitest passes.
  > note: 10 tests pass.
- [x] 4.2 `listDailyRows` pages in SQL (`LIMIT` / `OFFSET`, order: date newest first, name,
  employee number, id) and takes the Status and Source filters; `countDailyRows` returns total,
  matching and in-scope counts in one query. Done when: the paged pages put together equal the
  old unpaged list.
  > note: checked on e2e for October, everyone, all 30 Status × Source combinations: the same
  > rows in the same order, the same total (9,424) and matching counts (for example 3,141 Done).
  > Team, department, one person and a text search return the same totals and "missing" counts
  > as before (186, 434, 31, 3,069 rows; missing 0).
- [x] 4.3 Page controls on `/attendance/days` (Previous / Next, "Rows a–b of N · page x of y"),
  English and Arabic, shown only when there is more than one page; the links keep every filter;
  changing a filter goes back to page 1; a page past the end shows the last page. Done when:
  `pnpm check`, eslint and the Svelte autofixer are clean.
- [x] 4.4 Catch-up: the flagged-days query uses the partial index under any plan; people flagged
  over the same dates are recomputed together (`#lib/attendance/catch-up.ts`, 5 tests). Done
  when: the same rows are written, faster.
  > note: 304 people flagged on one day, same rows written (304): 3,260 ms one by one, 135 ms
  > together.
- [x] 4.5 Measure again. Done when: before / after numbers are here.
  > note: after, median of 5:

  | Range (everyone) | Rows sent | Load before | Load after | Page data before | Page data after |
  |---|---|---|---|---|---|
  | One day | 100 of 304 | 10 ms | 12 ms | 227 KB | 79 KB |
  | 7 days (the default) | 100 of 2,128 | 42 ms | 10 ms | 1,548 KB | 79 KB |
  | One month | 100 of 9,424 | 162 ms | 12 ms | 6,836 KB | 79 KB |

  > note: after, per query: one page of stored days 5 to 8 ms, the count query 1.4 to 3.6 ms.
  > The last page of a month (page 95, offset 9,400) takes 48 ms in total.
  > note: one team 8.5 ms, one department 7.6 ms, one person 13.5 ms, text search 9.9 ms
  > (single runs, one month).
- [x] 4.6 `pnpm check`, `pnpm test`, eslint and prettier on the touched files.
  > note: check 0 errors; 53 test files, 524 tests pass (15 of them new).

## 5. Manual check (the user, in the browser)

- [ ] 5.1 `http://127.0.0.1:5174/attendance/days`: the filters and the first 100 rows appear at
  once; one day and one month of everyone load quickly.
- [ ] 5.2 Previous / Next keep every filter; changing a filter goes back to page 1.
- [ ] 5.3 The card title's two numbers and the "no stored record yet" count equal the old ones.
- [ ] 5.4 `/ar/attendance/days` is right to left, with the arrows mirrored.
- [ ] 5.5 Recompute these days, Edit day, History and Shift change still work, also from page 2.
