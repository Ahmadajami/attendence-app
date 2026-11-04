# Day tags: an explanation on every tag, and one colour guide

**Status:** in progress (approved 2026-11-03; built 2026-11-03, waiting for the user's check 4.3 and 5.3)
**Date:** 2026-11-03
**Goal:** On the daily attendance table (`/attendance/days`), every tag (status, day state,
holiday, swap, source, overtime…) opens a **popover that explains it**: what it means, how it
counts for pay, and what to do about it. Tags get **one colour per meaning** (leave, sick,
absent, late, missing…), and a **colour guide** lists every tag with its colour and meaning. The
same tags, colours and texts are reused on the entry sheet, the employee page and the roster
preview.

**Lane:** `app/main`, after the PR45 person combobox is committed. One commit per phase, plan file
included. Resume point = the first unticked box.

## 0. Starting point (checked 2026-11-03)

- The table shows tags from four components in `#lib/app/attendance/`: the **Status** column is
  plain text (`DAY_STATUS_LABEL`), then `DayBadges` (Holiday, day state, Swap on / off,
  Corrected, Unauthorised swap), "Waiting for recompute" (inline on the page), `PunchTime`
  (Typed / Punch reading / Odoo seed, Next day) and `OvertimeCell` (×rate, "Not paid" with a
  **hover-only tooltip**, the only tag that explains itself today).
- Colours today: every tag is a shadcn `Badge` in `secondary`, `outline` or `destructive`. Leave,
  Sick, Mission and Other look the same; Late has no colour at all; only "Unauthorised swap" is
  red. `RosterPreview` paints every absence `bg-destructive/10`.
- **18 kinds of tags** in all: 9 statuses (`DAY_STATUSES`), 5 day states (`ABSENCE_TYPES`), and
  Holiday, Swap: works, Swap: off, Unauthorised swap, Corrected, Waiting for recompute, Next day,
  3 punch sources, paid overtime and "Not paid" (4 reasons).
- **A late day that is finished shows "Done", not "Late"** (`shiftSummary`,
  `#lib/roster/attendance.ts`: `closed` wins over `late`). Lateness then shows only as minutes in
  the Late column. The **Late** status itself means "checked in after the grace, still at work".
- **"Absent" appears twice**: the status `absent` ("there is a full-day state") and the state
  `no_show` (label "Absent"). A leave day shows status "Absent" plus a "Leave" tag.
- Theme tokens (`src/routes/layout.css`): `destructive`, `warning` (same value in light and dark),
  `muted`, `chart-1…5`, `shift-1…8`. There is no `success` / `info` token. Shift chips are
  **solid** fills (`ShiftChip`), several in the same hues the day tags need.
- bits-ui `Popover.Content` accepts `customAnchor`, so **one** popover can serve every tag of a
  table (see DT5).
- The page has no pagination: 7 days × ~300 people ≈ 2,100 rows, ~5,000 tags.

## 1. Decisions (approved 2026-11-03; stop and ask before departing from one)

| # | Decision | Why |
|---|---|---|
| DT1 | **One tag catalogue** in pure code: `#lib/attendance/day-tags.ts` defines every tag id, and `dayTags(figures, shift)` returns the tags of one stored day **in a fixed order** (status, state, marks, then the in / out and overtime tags stay in their columns). The labels, explanations and tones are looked up by tag id, so the table, the popovers and the colour guide can never disagree | One source of truth; testable without a browser |
| DT2 | **Tones, not colours, per tag.** Each tag has one tone (§2); a tone maps to one theme token. The tag style is **tinted** (`border-<tone>/30 bg-<tone>/10 text-<tone>`), never solid, so it never looks like a shift chip (solid) | Shift chips already use solid fills in the same hues |
| DT3 | **New theme tokens, in `:root` and `.dark`, in the same change as their first use:** `success`, `info`, `state-leave`, `state-sick`, `state-mission`, `holiday`. `warning` gets a **lighter dark-mode value** so its text stays readable on a dark tint. Values in §2; every tone's text must reach **4.5 : 1** on its tint in both modes (checked, task 1.2) | The UI rules allow a new token only in both modes; amber text at L 0.555 is too dark on a dark background |
| DT4 | **Colour is never the only cue:** every tag keeps its text label (and minutes where there are some: "Late 0:12"); the colour guide and the popovers say the same in words | Colour-blind users, printouts, Arabic and English alike |
| DT5 | **A tag is a button that opens a popover on click / tap / Enter.** The table renders tags as plain buttons with `data-day-tag`; **one shared `DayTagPopover` per table** (bits-ui Popover with `customAnchor` = the clicked tag) shows the explanation. No popover instance per tag | Works on touch and keyboard (a tooltip is hover-only); ~5,000 popover roots would slow the page |
| DT6 | **A popover says three things:** the tag's name (with its colour), **what it means**, **how it counts** (worked time, lateness, overtime, pay), and, for problems, **what to do** (e.g. Missing → "Type the punches on the entry sheet, or set a state with Edit day"). Texts in §3, in `messages/{en,ar}.json` as `day_tag_<id>_help` (+ `_action` where there is one) | The user asked for an explanation of each tag |
| DT7 | **Status column = one coloured tag.** When the status is `absent`, the column shows **the day state's tag** (Leave, Sick, Absent, Mission, Other) instead of the word "Absent" + a second tag | Removes the double "Absent" and the duplicate tag |
| DT8 | **Late on a finished day:** when the status is Done (or On break) and the check-in was later than the shift's grace (`lateMinutes > graceOf(shift)`), a **Late 0:12** mark is added beside the status. The status rule itself does not change | The user wants late days visible by colour; the stored status keeps its meaning (PR20) |
| DT9 | **Colour guide:** a **Colour guide** button (phosphor `PaletteIcon`) in the table card's header opens a side sheet from the inline end (`endSide()`) listing every tag by group (Status, Day states, Marks, Sources, Overtime): sample tag, name, one-line meaning. Built from the catalogue (DT1), so it lists exactly what the table can show | One place to learn all colours; a sheet has room for ~20 entries and works on a phone |
| DT10 | **Reuse everywhere a stored day is shown:** the entry sheet's "Stored record" column, the employee page's day panel (`DayFiguresSummary`), and the **Status** filter on `/attendance/days` (a colour dot per option). `RosterPreview` paints absence days in their state's tone instead of red for all | One meaning, one colour, on every screen |
| DT11 | **Sources stay neutral:** Typed / Punch reading / Odoo seed / Next day are grey outline tags (they explain where a time came from, not a problem) | Keeps colour for things that need attention |

## 1b. Questions for the user (defaults used until answered)

| # | Question | Default |
|---|---|---|
| Q-DT1 | Should a tag's explanation open on **click / tap** or on **mouse hover**? | click / tap (DT5): works on phones and with the keyboard. **Answered 2026-11-03: default kept** |
| Q-DT2 | Are the colours in §2 right (e.g. Sick violet, Leave blue, Mission teal, Holiday pink, Absent and Missing red, Late amber, Present / Done green)? | as in §2. **Answered 2026-11-03: default kept** |
| Q-DT3 | Show a **Late** mark on finished days when the check-in was after the grace (DT8)? Only beyond the grace, or any minute late? | yes, only beyond the grace (same rule as the status). **Answered 2026-11-03: default kept** |
| Q-DT4 | Colour guide as a **button + side sheet** (DT9), or an always-visible strip of tags above the table? | button + side sheet. **Answered 2026-11-03: default kept** |
| Q-DT5 | On a day with a state, show **only the state** (Leave, Sick…) in the Status column instead of "Absent" + the state (DT7)? | yes. **Answered 2026-11-03: yes** |
| Q-DT6 | Apply the same tags and colours to the entry sheet, the employee page and the roster preview (DT10), or only the daily page for now? | everywhere (Phase 5). **Answered 2026-11-03: default kept** |
| Q-DT7 | Should the state "Absent" (`no_show`) be renamed (e.g. "No show") so it can't be confused with other absences? | keep "Absent" (DT7 removes the duplicate). **Answered 2026-11-03: keep "Absent"** |

## 2. Colour guide (tones)

Tag style: `border-<token>/30 bg-<token>/10 text-<token>` (DT2). Values are OKLCH; light `:root`,
dark `.dark`. Final values may move a little to pass the contrast check (task 1.2).

| Tone | Token | Light | Dark | Tags |
|---|---|---|---|---|
| OK | `success` (new) | `oklch(0.5 0.13 150)` green | `oklch(0.78 0.15 150)` | Present, Done, paid overtime (×rate) |
| Attention | `warning` (both values change) | `oklch(0.52 0.15 49)` amber | `oklch(0.8 0.15 70)` | Late, Late 0:12 mark, Waiting for recompute |
| Problem | `problem` (new; `destructive` itself unchanged) | `oklch(0.5 0.2 27)` red | `oklch(0.704 0.191 22.216)` (= dark `destructive`) | Missing, Absent (`no_show`), Unauthorised swap |
| Leave | `state-leave` (new) | `oklch(0.5 0.17 260)` blue | `oklch(0.75 0.13 260)` | Leave |
| Sick | `state-sick` (new) | `oklch(0.52 0.2 300)` violet | `oklch(0.76 0.14 300)` | Sick |
| Mission | `state-mission` (new) | `oklch(0.5 0.1 185)` teal | `oklch(0.78 0.1 185)` | Mission |
| Holiday | `holiday` (new) | `oklch(0.53 0.18 350)` pink | `oklch(0.78 0.13 350)` | Holiday |
| Info | `info` (new) | `oklch(0.52 0.12 230)` sky | `oklch(0.78 0.11 230)` | On break, Unscheduled, Swap: works, Swap: off, Corrected |
| Neutral | `muted-foreground` + `border` | existing | existing | Expected, Off, Other (state), Typed, Punch reading, Odoo seed, Next day, Not paid |

## 3. Tag catalogue: what each popover says (English draft; Arabic written with the strings)

Facts come from the rules in code (`shiftSummary`, `dayResultOf`, `overtimePay`); wording to be
confirmed by the user at the manual check.

| Tag id | Label | Tone | Means | Counts / do |
|---|---|---|---|---|
| `status.expected` | Expected | neutral | Has a shift that has not started yet, or is still inside the grace minutes; no check-in yet | Nothing to do yet |
| `status.present` | Present | OK | Checked in on time (inside the grace) and still at work | Worked time is counted at check-out |
| `status.late` | Late | attention | Checked in more than the grace minutes after the shift start and still at work | The Late column shows the minutes from the shift start |
| `status.on_break` | On break | info | Checked in and started a break that has not ended | — |
| `status.done` | Done | OK | Checked in and out | Worked time and overtime are counted |
| `status.missing` | Missing | problem | Has a shift, the grace minutes have passed, and there is no check-in | Type the punches on the entry sheet, or set a state with **Edit day** |
| `status.off` | Off | neutral | No shift and no punches | — |
| `status.unscheduled` | Unscheduled | info | Punches on a day with no shift | All worked time counts as overtime (off-day work) |
| `state.leave` | Leave | leave | A full-day leave set with Edit day | Punches on this day count for nothing; nothing is required |
| `state.sick` | Sick | sick | A full-day sick day set with Edit day | as Leave |
| `state.no_show` | Absent | problem | Marked absent for the whole day | as Leave |
| `state.mission` | Mission | mission | A pattern mission; set and cleared on the pattern's Missions tab, not with Edit day (PR40) | as Leave |
| `state.other` | Other | neutral | Another full-day state, with its reason in the day's History | as Leave |
| `mark.holiday` | Holiday | holiday | A holiday of the pattern or the company | Nothing is required; work on it is overtime when the holiday allows overtime |
| `mark.late` | Late 0:12 | attention | Finished day whose check-in was later than the grace (DT8) | The minutes are the Late column |
| `mark.swap_on` | Swap: works | info | Works this day because of an approved swap | Paid as the swap says (normal day or overtime) |
| `mark.swap_off` | Swap: off | info | Off this day because of an approved swap | — |
| `mark.unauth_swap` | Unauthorised swap | problem | Worked a planned off day with no approved swap or override | Shown, not penalised (R12); approve a swap if it was agreed |
| `mark.corrected` | Corrected | info | A check-in or check-out of this day was corrected | **History** shows who changed what and when |
| `mark.flagged` | Waiting for recompute | attention | A recompute failed after a change | Repaired automatically when the page loads; Recompute these days also fixes it |
| `source.typed` | Typed | neutral | The time was typed on the entry sheet | — |
| `source.punch_reading` | Punch reading | neutral | The time came from a punch-file import | — |
| `source.odoo_seed` | Odoo seed | neutral | The time came from the one-time Odoo import | — |
| `mark.next_day` | Next day | neutral | The time is on the calendar day after the shift date (overnight shift) | — |
| `ot.paid` | 1:30 ×1.5 | OK | Overtime paid at this rate | — |
| `ot.unpaid` | Not paid 0:40 | neutral | Extra time not paid as overtime | The popover gives the reason (`UNPAID_REASON_LABEL`): overtime off, person earns none, holiday not eligible, or a full-day state |

## 4. Files

- `src/lib/attendance/day-tags.ts` (+ `day-tags.test.ts`): tag ids, groups, `dayTags(figures,
  shift)` (DT1, DT7, DT8). Pure, no Svelte, no `m.*` calls.
- `src/lib/app/attendance/day-tag-tones.ts`: tone → literal Tailwind classes (Tailwind scans for
  them, as `colours.ts` does) and tag id → label / help / action message functions.
- `src/lib/app/attendance/DayTag.svelte`: one tag as a `<button>` with tone classes and
  `data-day-tag` (DT5). Form-agnostic, `HTMLButtonAttributes` props.
- `src/lib/app/attendance/DayTagPopover.svelte`: the shared popover; listens for clicks on
  `[data-day-tag]` inside its container (an `{@attach}`), anchors with `customAnchor`, closes on
  Escape / outside click and returns focus to the tag.
- `src/lib/app/attendance/DayColourGuide.svelte`: the side sheet (DT9).
- Changed: `DayBadges`, `PunchTime`, `OvertimeCell` (tooltip → tag), `DayFiguresSummary`,
  `RosterPreview`, `/attendance/days/+page.svelte`, `EntrySheetForm.svelte`,
  `src/routes/layout.css`, `messages/{en,ar}.json`, `docs/decisions.html`.

## 5. Tasks

### Phase 0 · Confirm and record
- [x] 0.1 The user answers Q-DT1–Q-DT7 (or keeps the defaults); decisions DT1–DT11 become
      `approved` in `docs/decisions.html`, answered questions leave the `DEFAULTS` table
      done when: every Q-DT row says "Answered …" or "default kept"
      > note: 2026-11-03 Q-DT5 yes, Q-DT7 keep "Absent"; the user kept every other default.

### Phase 1 · Tokens and tones
- [x] 1.1 Tokens `success`, `info`, `state-leave`, `state-sick`, `state-mission`, `holiday` in
      `:root` and `.dark` (+ `@theme inline` entries), dark `warning` lighter (DT3)
      done when: `pnpm check` passes and `bg-success/10 text-success` compiles
      > note: 2026-11-03 tokens in `:root`, `.dark` and `@theme inline`. Deviation: a 7th token
      > `problem` (light `destructive` reaches only 3.99 : 1 on its tint and buttons use it, so it
      > stays); light `warning` also darkened (0.555 → 0.52, it was 4.39 : 1).
- [x] 1.2 Contrast check: each tone's text on its 10 % tint and on `card`, light and dark, ≥ 4.5 : 1
      (a one-off script in the scratchpad, results as a note; values adjusted until they pass)
      done when: a note lists the 9 tones × 2 modes ratios, all ≥ 4.5
      > note: 2026-11-03 tint ratio light / dark: success 4.91 / 8.11, warning 5.04 / 7.86, problem
      > 5.56 / 5.45, leave 5.32 / 6.92, sick 5.25 / 6.83, mission 4.85 / 8.00, holiday 5.02 / 7.16,
      > info 4.57 / 7.86, neutral (muted-foreground) 4.58 / 6.19. All ≥ 4.5; §2 has the final values.
- [x] 1.3 `day-tag-tones.ts`: tone → classes, tag id → tone (§2)
      done when: every tag id of §3 has a tone (a type error otherwise)
      > note: 2026-11-03 tone per tag in `DAY_TAG_TONE` (`day-tags.ts`, typed `Record`); classes,
      > names, help and action texts in `day-tag-tones.ts` (no separate labels file).

### Phase 2 · Pure rules (Vitest)
- [x] 2.1 `day-tags.ts`: ids, groups, `dayTags(figures, shift)`
      done when: tests cover each status, each state replacing "Absent" (DT7), Late mark beyond
      the grace only (DT8, grace from `graceOf`), holiday + state together, swap on / off,
      unauthorised swap, corrected, flagged, fixed order; `pnpm test` passes
      > note: 2026-11-03 `dayTags`, `statusTag`, `overtimeTags`, `STATE_TAG`, `PUNCH_SOURCE_TAG`;
      > 12 tests (`day-tags.test.ts`), 383 in all pass.

### Phase 3 · Components and strings
- [x] 3.1 Strings: `day_tag_<id>_help` and `_action` (§3), `day_tag_guide`, group headings, in en
      and ar
      done when: `pnpm check` passes with no missing key in either file
      > note: 2026-11-03 43 strings (en + ar). The Unauthorised swap "what to do" was dropped: it
      > pointed at a Changes page that is not built yet (swaps, pay plan Phase 6).
- [x] 3.2 `DayTag.svelte` and `DayTagPopover.svelte` (DT5, DT6): click, tap, Enter / Space open;
      Escape closes and refocuses the tag; one popover open at a time
      done when: `svelte-autofixer` clean, eslint clean
      > note: 2026-11-03 a tag finds its popover through a Svelte context (`day-tag-popover.ts`)
      > instead of a click listener on `[data-day-tag]`; still one popover per table. Outside a
      > popover (the colour guide) a tag is a plain `<span>`.
- [x] 3.3 `DayColourGuide.svelte` (DT9) built from the catalogue
      done when: autofixer clean; it lists every tag id once, grouped
      > note: 2026-11-03 built from `DAY_TAG_GROUPS`; a test checks every tag is listed once.

### Phase 4 · Daily page
- [x] 4.1 Status column = one tag (+ Late mark); `DayBadges`, `PunchTime`, `OvertimeCell` render
      `DayTag`s; one `DayTagPopover` around the table; "Waiting for recompute" becomes a tag
      done when: `pnpm check`, eslint, autofixer clean
      > note: 2026-11-03 `DayBadges` replaced by `DayStatusTags`; `PunchTime` and `OvertimeCell`
      > render tags (the "not paid" tooltip became a tag whose popover gives the reason).
- [x] 4.2 **Colour guide** button in the card header; colour dots in the Status filter
      done when: as 4.1
      > note: 2026-11-03 the guide button sits beside Recompute these days (shown to everyone);
      > the Status filter's "Absent" has no dot (it covers every state).
- [ ] 4.3 Manual check by the user (§6, items 1–10)

### Phase 5 · Other screens (DT10, unless Q-DT6 says otherwise)
- [x] 5.1 Entry sheet "Stored record" column and the employee day panel use the same tags and
      popover
      > note: 2026-11-03 the entry sheet's table and `DayFiguresSummary` each wrap their tags in a
      > `DayTagPopover`; the day panel passes the day's shift for the Late mark.
- [x] 5.2 `RosterPreview`: absence days in their state's tone
      > note: 2026-11-03 absence cells use their state's tag classes; the cell title names the
      > state (Leave, Sick…) instead of "Absent".
- [ ] 5.3 Manual check by the user (§6, items 11–13)

### Phase 6 · Wrap-up
- [ ] 6.1 `pnpm check && pnpm test`, eslint + prettier on touched code, autofixer on every touched
      `.svelte`; `graphify update .`; plan notes; README index row → done

## 6. Manual check (by the user, on `http://127.0.0.1:5174`, `_e2e`)

1. `/attendance/days` (Sep–Oct range, Operation team): statuses show in colour: Done / Present
   green, Late amber, Missing red, Off / Expected grey.
2. A leave day shows one blue **Leave** tag in the Status column (no "Absent" beside it); a sick
   day violet **Sick**; a no-show red **Absent**; a mission teal **Mission**.
3. A finished day with a late check-in shows **Done** and an amber **Late 0:12**.
4. Click any tag: a popover opens next to it with the name, meaning and how it counts; click
   another tag: the first closes, the second opens.
5. Keyboard: Tab to a tag, Enter opens, Escape closes and focus returns to the tag.
6. **Not paid** opens a popover with the reason (no hover needed).
7. **Colour guide** opens a side sheet with every tag grouped; the colours match the table.
8. Dark mode: every tag is readable; amber text is not dark-on-dark.
9. `/ar/attendance/days`: tags, popovers and the guide are in Arabic, right to left; the sheet
   opens from the left; times read left to right.
10. A wide range (e.g. a full month, Everyone): the page scrolls smoothly and a tag opens at once.
11. Entry sheet: the "Stored record" column uses the same tags and popovers.
12. Employee page, Schedule tab, a day: the same tags and popovers.
13. Roster preview: a leave day is blue, a sick day violet (not all red).

## 7. Not in this plan

- Changing how a status is decided (PR20) or any stored figure: tags only read what is stored.
- Pagination or virtual scrolling of the daily table (separate if 4.3 item 10 is slow).
- User-chosen colours per state (a settings page): fixed tones for now.
- Exports and printouts in colour.
