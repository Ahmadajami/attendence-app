# Template source

- Copied from `/home/xxskullxx/Documents/Syravia-projects/Airport-Staff`,
  branch `roster`, commit `a99e348` (2026-10-27), with `git archive`
  (tracked files only: no history, no `.env`, no `.vercel`, no `node_modules`).
- Copied on 2026-10-28 (task S0.2 of `plans/2026-10-28-attendance-app.md`).
- Not copied to the root (kept here for reference): the template's
  `CLAUDE.md`, `plans/`, `SYSTEM_OVERVIEW.html`. Not copied: its
  `README.md` and `.gitignore` (ours were merged by hand).
- Baseline right after the copy: `pnpm test` 63/63 passed;
  `pnpm check` 0 errors, 1 warning (`ui/stepper/stepper-item.svelte`).
- Removed later (S0.4/S0.5): Neon client, Vercel adapter, the flight
  domain, `overtime_approval`.
