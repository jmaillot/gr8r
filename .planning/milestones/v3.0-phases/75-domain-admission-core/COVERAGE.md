# Phase 75 — API Coverage Decision

**Detection:** the deterministic scan fired on the noun "mcp" (research threat-table wording "MCP door bypassing UI-path rules").

**Ruling:** No external API integration. The matched noun refers to `mcp.js`, this repo's own in-process MCP tool handler (`invite_member`, `mcp.js:923-956`) — a Phase 75 enforcement point (fourth door), not an external API/SDK/service being integrated. The phase installs zero new dependencies (RESEARCH.md §Package Legitimacy Audit: "No external packages are installed in this phase").

**Coverage matrix:** none required — no external endpoints consumed.
