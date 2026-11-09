# Projects Studio MCP — OpenCode (V2)

Connect the Projects Studio (gr8r) MCP server to [OpenCode](https://opencode.ai).
No bundle, no install step: OpenCode reads the server from its own
configuration file. Tools surface as `projects-studio_<tool>` in OpenCode
(the server name is the key you choose).

## Prerequisite

Create an API key in Projects Studio → **Settings → API keys** (choose the
workspace, read-only or read+write, and an expiration), then export two
environment variables **before** starting OpenCode:

```sh
export PRJSTUDIO_MCP_URL="https://your-instance.example/mcp"
export PRJSTUDIO_MCP_TOKEN="psk_live_…"
```

OpenCode expands `{env:NAME}` references when it reads the config; shell
syntax like `$NAME` is **not** expanded inside JSON strings, so always use
the `{env:…}` form.

## Option A — one command

```sh
opencode mcp add projects-studio --global \
  --url https://your-instance.example/mcp \
  --header "Authorization=Bearer {env:PRJSTUDIO_MCP_TOKEN}"
```

Note the single quotes / quoting care: `{env:…}` must be written literally
into the config, so quote the flag so the shell does not expand it.

Check the connection:

```sh
opencode mcp list          # expect: ✓ projects-studio  connected
```

## Option B — configuration file

Copy [`opencode.jsonc`](opencode.jsonc) into your config — project-level
`./opencode.json`, or global `~/.config/opencode/opencode.json`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "projects-studio": {
        "type": "remote",
        "url": "{env:PRJSTUDIO_MCP_URL}",
        "oauth": false,
        "headers": {
          "Authorization": "Bearer {env:PRJSTUDIO_MCP_TOKEN}"
        }
      }
    }
  }
}
```

Field notes:

| Field | Why |
|---|---|
| `type: "remote"` | The gr8r server speaks Streamable HTTP on `/mcp`. |
| `oauth: false` | The server authenticates with the bearer key only; without this, OpenCode would start an OAuth discovery flow and show `needs authentication`. |
| `{env:…}` everywhere | Keeps the key and the instance URL out of the file, so `opencode.json` stays safe to commit. |

## Verify

Open a session and ask the agent to call `whoami` (the gr8r docs recommend it
as the first call of every session):

```
> use the projects-studio whoami tool
```

It should answer with the workspace, your role and the project map; the 35
tools (tasks, projects, comments, prompts…) are then available.

## V1 → V2 migration note

The shape changed in OpenCode V2: servers now live under `mcp.servers.<name>`
instead of `mcp.<name>`. The older snippet from the main `MCP.md`:

```json
{ "mcp": { "projects-studio": { "type": "remote", "url": "…", "headers": { "…": "…" } } } }
```

must be rewritten as:

```json
{ "mcp": { "servers": { "projects-studio": { "type": "remote", "url": "…", "headers": { "…": "…" } } } } }
```

A higher-precedence config that redefines `projects-studio` replaces the
whole server object, so keep every required field (`type`, `url`, `headers`)
when overriding.

## Rotating the key

Nothing to reinstall: update `PRJSTUDIO_MCP_TOKEN` in your environment and
restart OpenCode — the header is re-read at connection time.
