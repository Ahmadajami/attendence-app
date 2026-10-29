# Pattern editor: drag and drop, and editor state in sync

**Status:** done (approved 2026-10-29 with the builder plan as its phase 0; browser-checked by the user 2026-10-29)
**Date:** 2026-10-28
**Goal:** Make the pattern editor (`src/lib/app/roster/CycleEditor.svelte`)
work with drag and drop as in the mockup's pattern builder (F2), and fix
the cases where the palette, the day cells and the saved form values drift
apart. Tap-to-paint and typing a code stay, so it still works on a phone and
from the keyboard.

**Lane:** A, branch `app/main`. One commit when every box is ticked (plan
file included). Read `CLAUDE.md` first: §3 "UI rules" and "Forms" apply to
every `.svelte` change here. Resume point = the first unticked box.

---

## 0. Starting point (checked 2026-10-28)

- `CycleEditor.svelte` takes `value: (string | null)[]` (shift id per slot,
  `null` = off, `$bindable`), `type: 'weekly' | 'cycle'` and `shifts` (all
  shifts; the active ones form the palette). Painting today: click a palette
  chip to pick the "brush", then press a day (`pointerdown`) and sweep over
  others (`pointerenter` while `painting`). Keys: a one-letter shift code, or
  `-` for off. `+` / `−` buttons resize a cycle (1–28).
- It is used by `PatternForm.svelte` (`bind:value={$formData.slots}`,
  `type={$formData.type}`), which is a Superforms form (`dataType: 'json'`,
  `id: 'pattern'`) rendered on `/teams/[id]` and `/employees/[id]`. The live
  preview applies the draft only when the form is tainted.
- Drag and drop already exists in the app: `@dnd-kit-svelte/svelte` 0.1.6
  (`DragDropProvider`, `useDraggable`, `useDroppable`, `DragOverlay`,
  `PointerSensor`, `KeyboardSensor`; `useSortable` from
  `@dnd-kit-svelte/svelte/sortable`) and `@dnd-kit/helpers` (`arrayMove`,
  `arraySwap`). Pattern to copy: `src/routes/(dashboard)/employees/`
  (`+page.svelte` `handleDragEnd`, `EmployeeRow.svelte`, `DragHandle.svelte`).
- Mockup reference (`docs/mockup/attendance-builder.html`, "Pattern builder",
  `onDrop()` around line 719): a shift dropped on a day sets it (weekly) or
  inserts it there (cycle); a shift dropped on "+ add" appends; a day
  dragged onto another day swaps (weekly) or moves (cycle); a day dropped
  on the bin is removed (cycle). Tap a shift, then tap days, paints.

### Sync defects found by reading the code

The user reported "the palette and the values are not synced". Reading the
code shows four ways this can happen. Task A1 confirms which one(s) the user
saw. All four are real, so fix all four.

| # | Defect | Where | Effect |
|---|---|---|---|
| S1 | The page component is **reused** when navigating `/teams/a` → `/teams/b` (or one employee to another). `superForm(untrack(() => data))` keeps the first entity's form, so the editor shows team A's slots, type and anchor on team B, and saving writes them to B | `teams/[id]/+page.svelte`, `employees/[id]/+page.svelte`, `PatternForm.svelte` | wrong pattern shown, can be saved to the wrong owner |
| S2 | `brush` is set once (`untrack`) from the first active shift. If the palette changes (shifts reload, the brush shift is deactivated), the brush still points at a shift that is no longer in the palette, so no chip looks selected while painting still uses the old id. The server then refuses with "Use active shifts only." | `CycleEditor.svelte` | palette selection ≠ what gets painted |
| S3 | `painting` is cleared only on `window` `pointerup`/`pointercancel`. Releasing the button outside the browser window leaves it `true`, so merely hovering over days repaints them | `CycleEditor.svelte` | days change without a click |
| S4 | The weekly/cycle `ToggleGroup` gets `value={$formData.type}` one way. Clicking the selected item deselects it inside bits-ui (`''`), `setType('')` returns early, and the toggle then shows nothing selected while the form still says `cycle` | `PatternForm.svelte` | toggle and form disagree |

---

## 1. Decisions (defaults; stop and ask before departing from one)

| # | Decision | Why |
|---|---|---|
| E1 | Follow the mockup's drop rules: shift → day sets it (weekly) / **inserts before** it (cycle); shift → "+ add" appends (cycle); day → day swaps (weekly) / moves (cycle); day → bin removes (cycle, never below 1 day). Inserts and appends stop at 28 days with a toast | Mockup F2 is the agreed UI reference (plan §9a) |
| E2 | Remove sweep-painting (`pointerenter` while held). A press-and-move now starts a drag. Painting = pick a palette chip, then **tap/click** days. This also removes S3 | Sweep-painting and dragging a day can't share the same gesture |
| E3 | ~~Use `@dnd-kit-svelte/svelte` (already used on `/employees`); no new dependency. Day cells are `useSortable` items; palette chips are `useDraggable`; "+ add" and the bin are `useDroppable`. `DragOverlay` shows the chip under the pointer~~ **Revised 2026-10-29 (user OK): use the official `@dnd-kit/svelte` 0.5.0** (`DragDropProvider`, `DragOverlay`, sensors), replacing `@dnd-kit-svelte/svelte` on `/employees` too; dnd-kit core pinned to 0.5.0 via `pnpm-workspace.yaml` overrides | One DnD library in the app; works with mouse, touch and keyboard |
| E4 | Activation: mouse after 4 px of movement; touch after a 200 ms press (so a tap still paints and the page still scrolls). Keyboard: dnd-kit `KeyboardSensor` (Space to lift, arrows, Space to drop) | A tap must stay a paint; mobile must scroll |
| E5 | The array logic lives in a **pure** module `src/lib/roster/slots.ts` with Vitest, not in the component | Same rule as the rest of `src/lib/roster/`: logic tested in Node |
| E6 | A dropped/dragged shift also becomes the brush (mockup does this) | Keeps the palette selection equal to the last shift used (helps S2) |

---

## 2. Tasks

### A · Reproduce and pin down the sync bug
- [x] A1 Ask the user which of S1–S4 they saw (or for their steps). The
      user reproduces it in the browser; agents never test in a browser
      (CLAUDE.md §1, 2026-10-29).
      > note: record which defects were reproduced; a defect not on the list
      > gets a new row in §0 and a task in B.
      > note: 2026-10-29: the user did not say which of S1–S4 they first saw;
      > all four fixes passed their browser check (V2). No new defect reported.
      > Two more found by reading the code: stale `{const}` tags (V1) and the
      > day panel keyed by date only (B1).

### B · Fix the sync defects
- [x] B1 (S1) Remount the pattern editor per owner: wrap `<PatternForm>` in
      `{#key data.team.id}` (teams) and `{#key data.person.staffId}`
      (employees). Also key the employee day panel's `selectedDay` state the
      same way. Paging the preview (`?from=`) must **not** reset unsaved
      edits (the key does not change then).
      **Done when** going team A → team B shows B's current pattern, and
      paging the preview keeps an unsaved edit
      > note: done; browser-checked by the user 2026-10-29 (V2).
      > `{#key data.team.id}` / `{#key person.staffId}` around `PatternForm` and
      > `EndPatternForm`; `selectedDay` is a writable `$derived` that restarts from
      > `?day=` only when `staffId` changes. Found while checking: the day panel
      > was keyed by date only and `AddPairForm` keeps the staff id it opened with,
      > so person A → B on the same `?day=` could save a pair to A. Now keyed by
      > `staffId:date`.
- [x] B2 (S2) Derive the brush from the palette: keep the picked id in
      `$state`, and use `const brush = $derived(palette.some(s => s.id === picked) ? picked : (palette[0]?.id ?? null))`,
      where `null` means off. The chip highlight and painting both read the
      derived value.
      **Done when** deactivating the brush shift (on `/shifts`) and returning
      shows the first active shift selected, and painting uses it
      > note: done; browser-checked by the user 2026-10-29. `picked` (`undefined` until a
      > chip is picked, `null` = off) + derived `brush`; chip highlight and
      > painting both read `brush`. The "+ add" chip's code read `brush` through a
      > plain `{const}`, which never updates (see V1): now `$derived`.
- [x] B3 (S3) Gone with E2. If any pointer-held state remains, clear it on
      `pointerup` / `pointercancel` / `lostpointercapture` of the editor
      **and** on `window` `blur`.
      > note: done. No pointer-held state is left in `CycleEditor` (sweep painting
      > removed per E2; dnd-kit owns the drag state).
- [x] B4 (S4) Toggle bound both ways with a guard:
      `bind:value={() => $formData.type, (v) => v && setType(v as PatternType)}`
      (Svelte function binding), so a click on the selected item is ignored.
      **Done when** clicking the selected toggle leaves it selected and the
      form value unchanged
      > note: done; browser-checked by the user 2026-10-29. Function binding on
      > `ToggleGroup.Root`; `setType('')` returns early.

### C · Pure slot operations (`src/lib/roster/slots.ts` + `slots.test.ts`)
- [x] C1 Functions on `(string | null)[]`, each returning a **new** array
      (never mutate), all respecting `type` and the 1–28 / 7 limits:
      `setSlot(slots, i, shiftId)`, `insertSlot(slots, i, shiftId)` (cycle),
      `appendSlot(slots, shiftId)` (cycle), `moveSlot(slots, from, to)` (cycle,
      `arrayMove`), `swapSlots(slots, a, b)` (weekly, `arraySwap`),
      `removeSlot(slots, i)` (cycle, min 1), and
      `applyDrop(slots, type, source, target)`, which turns a dnd-kit drop
      (`{ kind: 'shift', shiftId } | { kind: 'slot', index }` onto
      `{ kind: 'slot', index } | { kind: 'end' } | { kind: 'bin' }`) into one of
      the above, returning `{ slots, refused?: 'full' | 'last_day' }`.
      Import `@dnd-kit/helpers` only if it stays free of DOM/Svelte imports;
      otherwise write the two-line versions.
      > note: done in `src/lib/roster/slots.ts`: own two-line move/swap, no
      > `@dnd-kit/helpers` (removed from `package.json` with the old library).
      > Only imports: `PatternType` and `MAX_CYCLE_DAYS`.
- [x] C2 Vitest for every rule in E1 and its edges: weekly set / swap; cycle
      insert at 0, middle, end; append at 27 → 28; insert or append at 28 →
      refused `full`; move forwards and backwards; remove down to 1, then
      refused `last_day`; bin and "+ add" ignored for weekly; same-index drop
      = no change; the input array is never mutated.
      **Done when** `pnpm test` is green and `slots.ts` has no Svelte/DOM
      import
      > note: done. `slots.test.ts`: 13 cases (every rule above, plus out-of-range
      > indices and "a new array even when unchanged"); `pnpm test` 150/150.

### D · Drag and drop in `CycleEditor.svelte`
- [x] D1 Wrap the editor in its own `DragDropProvider` (sensors per E4) with
      one `onDragEnd` that maps `source.data` / `target.data` to `applyDrop`
      and assigns the result to `value` (one assignment per drop, so the form
      taints once). On `refused`, toast `m.roster_drop_full()` /
      `m.roster_drop_last_day()` (via `toast` from `svelte-sonner`).
      > note: done with the official `@dnd-kit/svelte` 0.5.0 (E3 revised, approved by
      > the user 2026-10-29): `DragDropProvider` + `PointerSensor` (mouse/pen 4 px,
      > touch 200 ms press, tolerance 5) + `KeyboardSensor`. Refusals toast via
      > `toast.error`.
- [x] D2 Day cells: `useSortable({ id: index-free stable id, index, type: 'slot', accept: ['slot', 'shift'], data: { kind: 'slot', index } })`.
      Stable ids: keep a parallel array of generated keys that moves with the
      slots (so `{#each}` is keyed by key, not index, per the UI rules). A
      cell is still a `<button>`: click/Enter/Space paints with the brush,
      typing a code or `-` still works.
      > note: done: `SlotCell.svelte` with `createSortable` (only the
      > `SortableKeyboardPlugin`, so no optimistic re-sort: `applyDrop` decides).
      > Keys move with the slots (`keys` array, placeholder keys for days set from
      > outside). Departure: **Space lifts** a day for keyboard dragging (dnd-kit's
      > keyboard start key), so **Enter** paints; the sr help text says so.
- [x] D3 Palette chips: `useDraggable({ type: 'shift', data: { kind: 'shift', shiftId } })`;
      the Off chip drags `shiftId: null`. Click still picks the brush (E6:
      a drop also picks it).
      > note: done: `PaletteChip.svelte` (`createDraggable`), a radio group
      > (`aria-checked`, since dnd-kit writes `aria-pressed`). A drop picks the brush.
- [x] D4 Cycle only: a "+ add" drop target after the last day (click =
      append the brush) and a bin drop target ("Drop a day here to remove
      it"). Keep the `+` / `−` buttons for keyboard users. Weekly shows
      neither.
      > note: done: `DropZone.svelte` (`createDroppable`) for "+ add" (also takes a
      > dragged day: moves it to the end) and the bin; `+` / `−` kept.
- [x] D5 `DragOverlay` renders a `ShiftChip` of the dragged shift/slot. Visual
      feedback only with tokens: the drop target gets `ring-2 ring-ring`, the
      source `opacity-40`. No `transition-all`, no blur (UI rules,
      Performance).
      > note: done: `DragOverlay` (no drop animation) with `ShiftChip`;
      > `ring-2 ring-ring` on targets, `opacity-40` on the source, named
      > `transition-[…]` only, no blur.
- [x] D6 RTL: cells and palette flow with the document direction; drop
      indices stay logical (index 0 = day 1 / Sunday) whatever the visual
      side. Check in `/ar`.
      > note: done: flex-wrap rows follow `dir`, drop data carries logical
      > indices. `/ar` checked by the user 2026-10-29.
- [x] D7 Hint text: replace `roster_cycle_hint` with two messages
      (`roster_cycle_hint_cycle`, `roster_cycle_hint_weekly`), worded like the
      mockup, plus `roster_drop_full`, `roster_drop_last_day`,
      `roster_drop_add`, `roster_drop_bin`, `roster_drag_day` (sr label) in
      **both** `messages/en.json` and `messages/ar.json`; delete
      `roster_cycle_hint` if unused.
      > note: done: both hints, `roster_drop_full|last_day|add|bin`, `roster_drag_day`
      > and `roster_drag_shift` (sr help for chips) in en + ar; `roster_cycle_hint`
      > removed (no uses left).

### V · Verify
- [x] V1 `svelte-autofixer` on every touched `.svelte` until clean;
      `pnpm check` 0 errors; `pnpm exec eslint` + `prettier --check` on
      touched files; `pnpm test` green.
      > note: done 2026-10-29. `svelte-autofixer` clean on every touched `.svelte`
      > (only the generic "attachment instead of `use:enhance`" hint, which is
      > Superforms' API); `pnpm check` 0 errors (1 warning in the untouched
      > `ui/stepper`); eslint 0 problems and prettier clean on touched files;
      > `pnpm test` 150/150. Found: a plain declaration tag `{const x = …}` is
      > computed **once** (unlike `{@const}`); 15 tags across 9 files were
      > stale, e.g. the entry sheet's
      > `row` / `result` (absence toggle, reason field, live checks) and the day
      > panel's `correction`. All now `{const x = $derived(…)}`; CLAUDE.md §3
      > Markup rule corrected. Also `/employees` uses `refreshAll` (`invalidateAll`
      > is deprecated in SvelteKit 3.1) and `flex flex-col gap-1` for `space-y-1`.
- [x] V2 Manual check **by the user** (agents never test in a browser,
      CLAUDE.md §1): hand this list to the user, who runs it on
      `attendance_app_e2e` (port 5174, `--mode e2e`); tick when they report:
      - drag D onto day 3 of a cycle → inserted; onto a weekly Wednesday → set;
      - drag day 2 onto day 5 (cycle) → moved; weekly Mon onto Fri → swapped;
      - drag a day to the bin → removed; at 1 day → refused toast;
      - fill to 28 → a further drop is refused;
      - tap-to-paint and typing `N` / `-` still work; touch (device mode)
        scrolls on a swipe and paints on a tap;
      - team A → team B shows B's pattern (S1); toggle click (S4); brush
        after deactivation (S2);
      - save → the history row and the preview match the editor.
      **Done when** every line holds and the saved `shift_pattern.slots`
      equal what the editor showed
      > note: 2026-10-29: the user ran the combined checklist (16 lines: these,
      > the S2.2 shift checks, `/employees` drag between teams, `/ar`) and
      > reported every line holds. DB check on `_e2e`: no `shift_pattern` row
      > written that day, so the slots comparison rests on the user's report;
      > no slot in any DB points at a missing shift (0 in `_e2e`, 0 in
      > `attendance_app`).
- [x] V3 Tick this plan, add a row to `plans/README.md` (status done),
      commit.

---

## Risks

- **Two gestures on one cell** (tap = paint, press-and-move = drag). E4's
  activation constraints separate them; test on touch (device mode) and
  with a real mouse.
- **dnd-kit-svelte is 0.x.** If `useSortable` misbehaves with a changing
  item count, fall back to `useDraggable` + `useDroppable` per cell and do
  the reordering in `applyDrop` (the pure logic does not change).
- **Index-keyed state.** Any state tied to a cell index (focus, the
  dragged cell) must move with the slot keys, or it points at the wrong day
  after a move.
