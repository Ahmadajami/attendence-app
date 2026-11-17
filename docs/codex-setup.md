# Codex setup

Run `codex` from the repository root. `AGENTS.md` remains a symlink to
`CLAUDE.md`, which contains the shared conventions and Codex workflow.

The project configuration is `.codex/config.toml`. Trust this repository in
Codex when prompted, then start a new session to load the configuration and
Svelte MCP tools. The configuration preserves your model and sign-in choices.

Verify registration with `codex mcp get svelte`. In the new session, ask Codex
to list Svelte documentation sections to verify an actual MCP connection.
The server uses the same `npx -y @sveltejs/mcp` command as OpenCode; its first
start may need a package download. Do not treat registration as a connection test.

OpenCode is installed and the user reports an available subscription. Codex
can use it for bounded coding work under the rules in `CLAUDE.md`; no login,
paid model call or subscription verification was performed during setup.

Workspace sandboxing and on-request approvals are defaults, not a substitute
for the project's real-data rules. Never forward secure files or employee data
to an external provider. Production migrations still require counts and approval.

Configuration reference: https://developers.openai.com/codex/config-reference
