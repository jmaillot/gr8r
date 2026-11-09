# Projects Studio MCP — bundle DeepSeek Harness

Configuration-only bundle that connects the Projects Studio (gr8r) MCP server
(`mcp.js`, streamable HTTP) to a DeepSeek Harness deployment. It mounts the
built-in `@deepseek-ai/dsh-mcp-client` plugin; no build step, no runtime
dependency.

## Install

1. **Set the endpoint.** Two options:

   - **Recommended: edit the default URL** in `cordis.patch.yml`:

     ```yaml
     url: !!js "process.env.PRJSTUDIO_MCP_URL ?? 'https://your-instance.example/mcp'"
     ```

     Replace the fallback literal with your own instance URL (must end with
     `/mcp`).

   - **Or use an environment variable** — `PRJSTUDIO_MCP_URL` overrides the
     default. It must exist in the environment **before** the DeepSeek Harness
     process starts (the expression is evaluated once at plugin activation,
     reading the launch environment). On Windows, set it as a user/system
     environment variable, not in `~/.dsh/.env` (that file feeds the
     credential layer, not `process.env`).

2. **Provide the API key** (created in Projects Studio → Settings → API keys)
   the same way: `PRJSTUDIO_MCP_TOKEN=psk_live_…` as an environment variable
   of the harness process. There is no fallback for the token on purpose —
   no secret ever lives in this bundle.

3. **Install the bundle:**

   ```
   dsh plugin install ./integrations/deepseek-harness
   ```

   or from the application: **Plugins → Install** and pick this folder. The
   plugin activates live (HMR); no restart is needed.

4. **Verify** from any session by asking the agent to call
   `mcp__projects-studio__whoami` — it should answer with the workspace, the
   role and the project map. All 35 tools then appear as
   `mcp__projects-studio__<tool>`.

## Rotating the key or changing the URL later

The `!!js` expressions are evaluated at plugin activation. After changing
`PRJSTUDIO_MCP_TOKEN` / `PRJSTUDIO_MCP_URL` or editing `cordis.patch.yml`,
re-activate the plugin (toggle it off/on in the plugin manager, or reinstall)
and the next activation picks the new values up.

## Notes

- `serverName: projects-studio` matches the naming already used in `MCP.md`
  for OpenCode / Claude Desktop / Cursor, so tools surface as
  `mcp__projects-studio__<tool>` everywhere.
- `failOnStartupError: true` makes a bad URL or an invalid key fail loudly in
  the plugin manager instead of silently leaving the agent without tools.

## Snippet for the main MCP.md

```markdown
### DeepSeek Harness

1. Edit the endpoint default in `integrations/deepseek-harness/cordis.patch.yml`
   (or set `PRJSTUDIO_MCP_URL` in the launch environment).
2. Set `PRJSTUDIO_MCP_TOKEN=psk_live_…` in the harness launch environment.
3. Install the bundle: `dsh plugin install ./integrations/deepseek-harness`
   (or Plugins → Install in the app, selecting this folder).
4. Verify by asking the agent to call `mcp__projects-studio__whoami`.
```
