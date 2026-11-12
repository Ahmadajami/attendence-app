# October 2026 matches Odoo; November gets a new flow

**Status:** in progress
**Date:** 2026-11-12
**Goal:** every October 2026 day in the app gives Odoo's figures (required, worked, overtime,
shortage, full-day states), proven day by day on the check page, with every rule that makes the
difference a **setting** (set to Odoo's value for October). 21–31 October, which Odoo doesn't have,
is entered in the app. November gets a new, better flow, designed after October closes. There is no
payroll page or export yet, so nothing already paid has to be reconciled.

Decided by the agent on the user's instruction (2026-11-12: "decide to achieve that"). This plan
only orders and closes the work of three plans: `2026-11-12-roster-import.md`,
`2026-11-11-attendance-import-odoo-and-devices.md`, `2026-11-11-engine-v2-hourly-leave-carry.md`.

## 0. How Odoo computed October (read-only, 2026-11-12)

| Item | Odoo |
|---|---|
| Worked | first check-in → last check-out (4 149 / 4 149 punched days) |
| Overtime / shortage | worked − required, **no rounding** (4 133 / 4 149) ; required − worked |
| Lateness | flagged on 124 days, **never charged** (tardiness applied on 0 days) |
| Break days (23) | the break is taken off (only 5 count the full span) |
| Mission with punches (8 in 1–20 Oct) | the mission day, no overtime (the app already does this) |
| Unmarked day changes (all rostered people) | 21 pair up as self swaps; 48 lone extra days off; 5 lone days worked on a usual day off (2 punched) |
| Last change to an October row | 2026-11-04 |

## 1. Decisions

| ID | Decision | Why |
|---|---|---|
| OC1 | **October = Odoo, proven by the check page** (IM8): for each person and day, app vs Odoo on required, worked, overtime, shortage, state; a difference needs a named cause. October is done when the check shows 0 unexplained days (IM9) | One finish line the user can see |
| OC2 | **Roster = Odoo's day plan**, per department (RI10), with Odoo's **required minutes per day**: a day with another required length is a day with another shift | Required decides overtime and shortage in Odoo |
| OC3 | **Shifts:** Odoo's required length; start = the group's median check-in (the 19 shifts already proposed). Lateness stays information only, as in Odoo (no charge) | Odoo's own start hours are placeholders; lateness is not paid in Odoo |
| OC4 | **Day changes** (answers Q-RI3): Odoo-marked swap days and unmarked off/work pairs of the same person become **self swaps** (same week, else same month; normal pay). A lone extra day off is a day-off edit. The **5 lone worked days** (2 with punches) are day edits; the app counts them as extra work, so they show on the check page as cause "plan differs" (accepted once, IM9) | Matches Odoo everywhere a pair exists; the 2 punched days are visible, not hidden |
| OC5 | **Punches 1–20 Oct from Odoo** (file ready): breaks as two parts; leave / sick / mission as full-day states | What Odoo paid |
| OC6 | **21–31 Oct is entered in the app**, planned by the same imported October roster: typed on the entry sheet or day editor now; device files when a sample exists (Q-IM5). The 9 Odoo states after the 20th come with the punch file | Odoo has no punches after the 20th |
| OC7 | **Settings for parity, set to Odoo's value for October:** overtime rounding (Odoo: none; the app's 15 becomes a setting, Q-EN2), Friday prayer +60 on a work day with a break (FP1, EN5). Built as the first piece of engine v2, nothing else of it before October closes | "Still configurable": the rule is a setting, October uses Odoo's |
| OC8 | **No payroll page or export for October before the check is clean**; the check page and the Daily page are October's output. November's flow (roster from HR's workbooks or the app, device files daily, payroll page and export) is planned after October closes | One month at a time; nothing paid from unchecked figures |

## 2. Order of work

- [x] 1. People: the 3 Admin-team drivers get department DAM Porters && Drivers (user); the 5
      same-badge-different-name people checked (user).
      > note: 2026-11-12, on the user's word ("yes"; "choose odoo name"): the 3 drivers' department
      > set to DAM Porters && Drivers, the 5 people's English and Arabic full names set to Odoo's (same
      > person); one transaction on `attendance_app`, 8 `staff.update` audit rows with the values before.
- [x] 2. Roster import built (`2026-11-12-roster-import.md` Phases 2–5, department grid, OC2–OC4),
      October imported on e2e, then on `attendance_app` after the user's OK; every group verified.
      > note: 2026-11-12 imported on `attendance_app` and checked: 7 976 / 7 976 planned days equal the
      > file, stored and recomputed (roster-import plan 5.2).
- [x] 3. Punch import of `punches_2026-10.md` on `attendance_app` after the user's OK (counts add up).
      > note: 2026-11-12 imported and checked: every punch and state equals Odoo; first figure
      > comparison in the attendance import plan (task 6.1 note): the remaining differences are
      > rounding and Friday prayer (step 4), Odoo credits (hourly leave), Operations' HR roster, and a
      > small shortage rule to find (step 5).
- [ ] 4. Settings OC7 (rounding, Friday prayer) with October set to Odoo's values (`2026-11-12-attendance-rules-settings.md`); recompute October after the user's OK.
      > note: 2026-11-12 built and tested (547 tests); migrations 0026/0027 on e2e and test; the recompute on `attendance_app` waits for the user's OK.
- [ ] 5. Odoo reference and check page (attendance import plan Phase 3); October reaches 0 unexplained.
- [ ] 6. 21–31 Oct entered (entry sheet / day editor, or device files).
- [ ] 7. November flow: a new plan.
