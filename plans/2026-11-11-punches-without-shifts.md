# Punches without shifts: you type the date, in and out; the roster decides the rest

**Status:** in progress (user's rule 2026-11-11; built, all three databases migrated, October imported: 116 events; waiting for the user's checks 3 and 5)
**Date:** 2026-11-11
**Goal:** a punch is only **person + date + check-in + check-out**. Nobody picks a shift, not when
typing, not in an import, not from a device. For that date the **roster** says what was planned
(a shift, or a day off), and the day is compared with it: on time, late, short, overtime, or
day-off work. Then the Operations October punches are imported.

Replaces `2026-11-09-off-day-work-and-shift-changes.md` (superseded): its first question (Q-OW1)
is answered by this rule, and most of its other decisions were only needed because punches
carried a shift.

## 1. The rule (user, 2026-11-11)

| ID | Rule |
|---|---|
| PS1 | **A punch has no shift.** `attendance_event.shift_id` is removed. The real database has 0 punches, so nothing is lost; the dev databases are reseeded |
| PS2 | **The date is the day you enter it on** (entry sheet, day editor, the import row's date). A check-out earlier than the check-in is the next morning. On a planned night shift a check-in typed after midnight is read as the next morning (as today, using the roster's shift) |
| PS3 | **The roster decides the comparison:** planned shift → required, late, short, overtime against that shift; planned day off → every minute is day-off work (×1.5), with the existing "worked a day off" tag; full-day leave/sick → punches kept, not counted |
| PS4 | **No reason is required** to save a punch on a day off; the day shows the tag and HR can add a note |
| PS5 | **Times that don't fit the planned shift** (for example a night worked on a day-shift date) are saved and shown with a warning "times don't fit the planned shift". The fix is in the roster (a swap today; a shift change request later), never on the punch |

## 2. What changes in the code

- Migration: drop `attendance_event.shift_id` (and its index use).
- `src/lib/attendance/entry.ts`: `resolvePair` / `validatePair` take the roster day's planned shift
  (or none) instead of a chosen one.
- `src/lib/server/services/attendance/attendance.bl.ts` + `.crud.ts`: entry sheet and day editor
  save date, in, out only; no "shift required", no "reason required" for unplanned days.
- `src/lib/roster/attendance.ts` `shiftSummary`: the shift is always the roster's; overtime is
  computed on a day off too (today it waits for a shift id on the punch).
- `src/lib/attendance/day-result.ts`: unchanged rules; `shiftId` = the planned shift.
- `src/lib/attendance/punch-import.ts` + `scripts/import-october-punches.ts`: no shift choice.
- Screens: entry sheet (`EntrySheetForm`), day editor (`DayPanel`, `DayPunchesForm`,
  `AddPairForm`), daily page: no shift picker; the planned shift is shown from the roster.
- `scripts/seed-e2e-operation.ts`, tests, `messages/en.json` + `ar.json`.

## 3. Tasks

- [x] 1 Build PS1–PS5 (code, migration, tests, both languages). **Done when** `pnpm check`,
      `pnpm test` and eslint pass.
      > note: 2026-11-11 migration `drizzle/0022_punches_without_shift.sql` (drops
      > `attendance_event.shift_id` and its FK). `pnpm check` 0 errors, `pnpm test` 481 passed,
      > eslint clean on touched files, svelte-autofixer clean on EntrySheetForm, DayPunchesForm,
      > AddPairForm, DayPanel. A shift's "used" flag now counts stored days planned on it. The import
      > reads the Markdown table (`readPunchMarkdown`) as well as the template.
- [x] 2 Reseed the dev database (`attendance_app_e2e`) and apply the migration to all three
      databases (`attendance_app` after your OK).
      > note: 2026-11-11 applied to `attendance_app_e2e` and `attendance_app_test`; e2e reseeded
      > (6 made-up people, 176 pairs, 350 events, no shifts). `attendance_app` after the user's OK
      > the same day: before and after 0 events, 240 stored days, 310 staff; `shift_id` gone.
- [ ] 3 You check on the test server: type a day-off punch, a normal day, a late day, a night.
- [x] 4 Import Operations October (6 people, 2026-10-01 → 10-31) into `attendance_app` from the
      Markdown file (user, 2026-11-11: "fill it from the md file"), after you see the dry run.
      > note: 2026-11-11 the file moved from the repo root to
      > `~/secure/syravia/imports/punches/2026-10/operations_attendance_october_2026.md` (mode 600).
      > Parsed: 58 rows with times (6 people, 2026-10-01 → 10-20), 128 without, 0 unreadable,
      > 0 open pairs. Command: `pnpm exec tsx --env-file=.env scripts/import-october-punches.ts
      > --file ~/secure/syravia/imports/punches/2026-10/operations_attendance_october_2026.md
      > --database attendance_app --team 31da93d7-07cf-4ee6-bf02-606158f67fa2 --from 2026-10-01
      > --to 2026-10-31` (add `--commit` only after the user's OK).
      > note: 2026-11-11 dry run on `attendance_app`: 6 people matched, 58 pairs / 116 events,
      > 0 rejected, 0 duplicates, 0 open pairs. Planned days: D8 36, N8 18, day off 4. Warnings:
      > 4e26598d 10-13 and 10-14 on planned D8 with night times (outside the window: shows as late
      > unless the roster is fixed with a swap); day-off work 4e26598d 10-17, 8b8d9748 10-16,
      > b2339c1f 10-01 and 10-02 (the 1–4 Oct swap-off days). 4 full-day states in the file
      > (b2339c1f 10-16, 10-17; 412d2b7e 10-01, 10-02) for the day editor.
      > note: 2026-11-11 the roster check (`verify`) against HR's October workbook: 186/186 days
      > match, so the swaps are right; the 6 warned rows are punches that differ from the workbook's
      > plan (13–14 Oct D in the workbook, nights punched; 4 days O in the workbook, punched).
      > Committed after the user's OK: 116 events, 1 audit row; `attendance_app` now 116 events.
      > Next: the user recomputes Operations October on `/attendance/days`; the shift change
      > request (plan `2026-11-11-shift-change-request.md`) fixes 13–14 Oct.
- [ ] 5 You check the October results on the Month tab and two people's days.

## 4. Later (not needed for the Operations flow)

Shift change request (old OW7/OW9), the payroll column for day-off work, the "swap-off day" flag,
the guard for times that belong to the previous night, the import from Odoo with the check page
(`2026-11-11-attendance-import-odoo-and-devices.md`), engine v2.
