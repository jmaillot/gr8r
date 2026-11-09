# Projects Studio MCP — Claude Code

Connect the Projects Studio MCP server to [Claude Code](https://code.claude.com).
Claude Code speaks Streamable HTTP natively (`"type": "http"`), with
`${VAR}` environment-variable expansion inside the config file — so the
token never has to be committed.

Tools surface as `mcp__projects-studio__<tool>` (server name = the key in
`mcpServers`), matching the naming used in the DeepSeek Harness integration.

## Prerequisite

Create an API key in Projects Studio → **Settings → API keys**, then export:

```sh
export PRJSTUDIO_MCP_TOKEN="psk_live_…"
# optional — the config file carries a default fallback:
export PRJSTUDIO_MCP_URL="https://your-instance.example/mcp"
```

## Option A — one command

```sh
claude mcp add --transport http projects-studio \
  https://your-instance.example/mcp \
  --header "Authorization: Bearer ${PRJSTUDIO_MCP_TOKEN}"
```

Scope with `--scope`: `local` (default, this project only, stored in
`~/.claude.json`), `project` (writes `.mcp.json` at the repo root, shared
with the team), or `user` (all your projects).

Check the connection:

```sh
claude mcp list          # expect: ✓ projects-studio … connected
claude mcp               # interactive TUI
```

## Option B — `.mcp.json` at the repo root

Copy [`mcp.json.example`](mcp.json.example) to `.mcp.json` in the project:

```json
{
  "mcpServers": {
    "projects-studio": {
      "type": "http",
      "url": "${PRJSTUDIO_MCP_URL:-https://your-instance.example/mcp}",
      "headers": {
        "Authorization": "Bearer ${PRJSTUDIO_MCP_TOKEN}"
      }
    }
  }
}
```

Notes:

- `${VAR}` is expanded when Claude Code reads the file; `${VAR:-default}`
  falls back to the literal default when the variable is unset — that is how
  the example ships your instance URL as the default without a hard-to-find
  override.
- The file itself is safe to commit: the token always comes from the
  environment. Teammates cloning the repo are prompted to approve the
  project-scoped server on first use.
- Unlike OpenCode, no `oauth: false` field is needed — an `http` server with
  explicit headers does not trigger OAuth discovery.

## Verify

From a session:

```
> use the projects-studio whoami tool
```

It should answer with the workspace, your role and the project map; the 35
tools (tasks, projects, comments, prompts `daily-standup`, `triage-backlog`,
`prepare-review`…) are then available. The docs recommend `whoami` as
the first call of every session.

## Troubleshooting

- `needs authentication` / 401 on every call: the header did not expand —
  check that `PRJSTUDIO_MCP_TOKEN` is exported in the shell that launched
  Claude Code (expansion happens at config read time, in that process's
  environment).
- Key revoked or expired: update the environment variable and restart
  Claude Code; nothing else to change.

## Snippet for the main MCP.md

```markdown
### Claude Code

1. Export the key: `PRJSTUDIO_MCP_TOKEN=psk_live_…`
   (optional: `PRJSTUDIO_MCP_URL` overrides the default endpoint).
2. Copy `integrations/claude-code/mcp.json.example` to `.mcp.json` at the
   repo root, or run:
   `claude mcp add --transport http projects-studio https://…/mcp --header "Authorization: Bearer ${PRJSTUDIO_MCP_TOKEN}"`
3. Verify with `claude mcp list`, then ask the agent to call `whoami`.
```
