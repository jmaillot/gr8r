# Projects Studio

A calm, structured project management workspace: home dashboard, inbox, my tasks, projects with
board / list / table / calendar / timeline / files views, members, teams, activity and settings.

Built with plain JavaScript ES modules and CSS, bundled by [Vite](https://vite.dev). There is no
UI framework and no runtime dependency.

![Projects Studio home dashboard](docs/preview.png)

> **Fork notice** — this project started as a fork of
> [gr8rstudio/gr8r-studio](https://github.com/gr8rstudio/gr8r-studio), the browser-only demo.
> See [What this fork adds](#what-this-fork-adds) below.

## What you can do with it

**In the browser (demo mode)** — the original experience: open the app, explore a seeded demo
workspace, everything stays in your browser (`localStorage`). No server, no accounts. That is
what [gr8r-studio](https://gr8rstudio/gr8r-studio) ships, and it still works here.

**Self-hosted** — run one Node container and the same interface becomes a real multi-user tool:

- **Accounts and roles.** Sign in with email and password (or Microsoft Entra SSO). Owners,
  admins, members and guests each see and change only what their role allows. Admins manage
  accounts, workspaces and password resets from a CLI or the settings pages.
- **Several workspaces in one instance.** Each workspace has its own URL (`/w/<slug>`), its own
  projects, members and settings. Switch from the sidebar or the command palette; the server
  enforces membership on every call — a non-member gets `404`, never a leak.
- **Private projects.** A project can be shared with everyone or restricted to an invited list.
  Hidden projects are filtered out of every response — tasks, comments, files, activity,
  notifications and saved views included.
- **Real file uploads.** Attach files to tasks; they are stored as real binaries on the server
  (25 MB per file by default, configurable) with image and PDF previews in the browser.
- **Invitations by email (optional).** Configure SMTP and invite teammates by link or email;
  without SMTP the server still generates invite links to copy.
- **AI agents via MCP.** A built-in Model Context Protocol server exposes 35 tools (tasks,
  projects, comments, prompts…) over streamable HTTP, authenticated with per-agent API keys.
  Ready-made integration guides for OpenCode, Claude Code and the DeepSeek harness live in
  [`integrations/`](integrations/) — see [`docs/MCP.md`](docs/MCP.md) for the full manual.
- **Bilingual interface.** English and French, chosen per account. A browser sweep and a
  build-time scan guarantee no untranslated string ships.

Run it in five minutes with the bundled compose file — see
[`docs/DEPLOY.md`](docs/DEPLOY.md).

## Deploy

`vercel.json` builds with Vite and serves `dist/` as a static, browser-local demo.

For a self-hosted instance — one Node container behind Traefik, accounts and server-side
storage — see [`docs/DEPLOY.md`](docs/DEPLOY.md).

By default the app runs on embedded SQLite. Setting `DB_URL` in `.env` switches it to Postgres
(fail-closed boot, automatic schema and migrations). See
[`docs/POSTGRES.md`](docs/POSTGRES.md) and [`docs/DEPLOY.md §14`](docs/DEPLOY.md).

## What this fork adds

Compared with the original
[gr8rstudio/gr8r-studio](https://github.com/gr8rstudio/gr8r-studio) — a static,
browser-only demo with seeded data and no backend — this fork turns it into a
self-hostable product:

| Area | Original | This fork |
|---|---|---|
| Backend | None — data lives in `localStorage` | Node 24 server (`server.js`), hand-rolled JSON API, accounts and sessions |
| Persistence | Browser only | Server-side SQLite (default) or PostgreSQL, on a Docker volume |
| Users | Single local user | Accounts, scrypt passwords, sessions, Microsoft Entra SSO, invitations (SMTP optional) |
| Tenancy | One local workspace | Multiple workspaces per instance, role-based access (owner/admin/member/guest) |
| Privacy | Everything visible | Private projects filtered server-side from every response |
| Files | Records only, no binary | Real uploads on disk with previews and workspace-scoped links |
| AI | — | MCP server (35 tools), API keys per agent, integration bundles for OpenCode, [CC] and [DSH] |
| CLI | — | Account/workspace management, backups, key rotation (`node server.js …`) |
| Operations | Static hosting | Docker image, Traefik guide, backups and restore, updates and rollback runbook |
| Languages | English only | English + French catalogues with a translation guarantee enforced in CI |
| CI | Lint, format, build | Plus server tests, browser UAT (Playwright) and a Docker image build job |

## Project structure

```
index.html              HTML entry; loads src/main.js
public/favicon.svg      brand mark
vite.config.js          Vite config, including the Lucide icon-subset plugin
eslint.config.js        lint rules (ESLint flat config); formatting by Prettier (.prettierrc.json)
.github/workflows/      CI: lint, format check, build, server tests, browser UAT
docs/                   deployment, development, MCP and i18n guides
integrations/           ready-made MCP bundles (OpenCode, [CC], [DSH])
src/
  main.js               entry: imports styles and modules, then boots the app
  server.js             self-hosted server: JSON API, auth, storage (SQLite/Postgres)
  styles/               tokens, base, components, views and pages stylesheets
  core/                 utilities, constants, icons, store (state + lookups), theme
  locales/              en.json / fr.json catalogues
  data/seed.js          demo workspace data
  ui/ shell/ components/  render helpers, layout, router, view engine
  pages/ views/ overlays/ one module per route, project views, task drawer & modals
  features/ actions/    teams & archive rendering, user actions, drag and drop
```

## Continuous integration

Every push to `main` and every pull request runs two required jobs
(`.github/workflows/ci.yml`), both reading the Node version from `.nvmrc` (24):

- **build** — `npm ci`, `npm run lint`, `npm run format:check`, `npm run build` and `npm test`.
- **e2e** — builds `dist/`, installs Chromium with system dependencies
  (`npx playwright install --with-deps chromium`) and runs `npm run e2e`. Playwright traces and
  screenshots are uploaded as an artifact only when the job fails.

A third job, `docker-build`, builds the image and asserts the French catalogue is served
with French content — so the shipped image is verified to carry the French catalogue.

## Documentation

- [`docs/DEPLOY.md`](docs/DEPLOY.md) — self-hosting runbook: Docker, Traefik, accounts,
  backups, updates, SSO, key rotation
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — local development and testing
- [`docs/POSTGRES.md`](docs/POSTGRES.md) — the optional PostgreSQL backend
- [`docs/MCP.md`](docs/MCP.md) — MCP server: API keys and the 35-tool manual
- [`integrations/`](integrations/) — connect an agent (OpenCode, [CC], [DSH])
- [`docs/i18n-fr-glossary.md`](docs/i18n-fr-glossary.md) — French terminology choices
- [`CHANGELOG.md`](CHANGELOG.md) — release history
