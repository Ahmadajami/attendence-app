# Repository Codex setup

**Status:** in progress
**Date:** 2026-11-17
**Goal:** Configure Codex using shared project rules and record OpenCode availability.

## Decisions

CS1: Keep `AGENTS.md` linked to `CLAUDE.md`; use repository Codex config for
sandbox defaults and Svelte MCP. Direct requests are Codex briefs. OpenCode
is available for bounded delegation with diff review and existing permissions.
Keep the user's model, authentication and real-data restrictions.

## Tasks

- [x] Add repository Codex configuration and shared Codex workflow.
- [x] Document setup and record CS1 in both decision-log languages.
- [x] Validate TOML, Codex MCP registration, decision-log JavaScript, type checks and unit tests.
  > note: 57 test files; 595 tests; 0 errors; 1 existing warning.
- [ ] Verify Svelte MCP connection in a restarted, trusted Codex session.
- [ ] Verify OpenCode authentication when first needed for an authorized task.
- [ ] Refresh documentation semantics in the local graph (marked stale).
