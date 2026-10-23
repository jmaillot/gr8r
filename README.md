# Gr8r Studio

A calm, structured project management workspace: home dashboard, inbox, my tasks, projects with
board / list / table / calendar / timeline / files views, members, teams, activity and settings.

Built with plain JavaScript ES modules and CSS, bundled by [Vite](https://vite.dev). There is no
UI framework and no runtime dependency.

![Gr8r Studio home dashboard](docs/preview.png)

## Getting started

Requires Node.js 24 or newer (`.nvmrc` pins 24, and the Docker image uses `node:24-alpine`).

```bash
npm install
npm run dev       # http://localhost:5173 with hot reload
npm run build     # production build in dist/
npm run preview   # serve the production build locally
npm run lint      # ESLint
npm run format    # Prettier
```

## Project structure

```
index.html              HTML entry; loads src/main.js
public/favicon.svg      brand mark
vite.config.js          Vite config, including the Lucide icon-subset plugin
eslint.config.js        lint rules (ESLint flat config); formatting by Prettier (.prettierrc.json)
.github/workflows/      CI: lint, format check, build, server tests, browser UAT
docs/preview.png        README screenshot
src/
  main.js               entry: imports styles and modules, then boots the app
  styles/
    index.css           imports every stylesheet in cascade order
    tokens.css          colours, spacing, type, radius, the shared --gutter
    base.css  components.css  shell.css  panels.css  overlays.css  states.css  motion.css  responsive.css
    views/              list, board, table, calendar, timeline, projects & files
    pages/              settings, auth & onboarding
  core/                 utilities, constants, icons, store (state + lookups), theme
  data/seed.js          demo workspace data
  ui/                   shared render helpers, toasts, the select dropdown
  shell/                render loop and router, sidebar/topbar layout, skeletons, view engine
  components/           task list renderer
  pages/                one module per route
  views/                project views: board, table, calendar, timeline, files, overview
  overlays/             task drawer, modals, popovers, context menu, command palette
  features/             teams, subtasks, archive (rendering)
  actions/              user actions, event wiring, keyboard shortcuts, drag and drop
```

### Layers

Dependencies point downward:

1. `core/` and `data/` depend on nothing else in the app.
2. `ui/`, `shell/`, `components/`, `pages/`, `views/`, `overlays/` and `features/` render HTML from state.
3. `actions/` change state and re-render. Each action module registers its handlers on the
   shared action table (`A`) when it loads, so `main.js` imports them after `actions/actions.js`.

## Conventions

- **Rendering:** each page or view is a function that returns an HTML string from the store
  (`S`). `render()` rebuilds the shell and keeps focus and scroll positions.
- **Interactions:** elements declare `data-a="actionName"`. `actions/events.js` delegates the
  click to `A.actionName`. Inputs use `data-in`, blur handlers use `data-blur`.
- **Layout:** every page edge uses `var(--gutter)`, so the breadcrumb, page header, toolbar,
  list, table and board start on the same line.
- **Dropdowns:** write a normal `<select class="select">`. `ui/select.js` renders it as the
  design-system menu and keeps the native element as the source of truth.
- **Icons:** call `ic('name')` with any [Lucide](https://lucide.dev) icon name. The
  `virtual:icons` plugin bundles only the icons the source uses.
- **Project templates:** how to add or edit the new-project templates —
  see [docs/project-templates.md](docs/project-templates.md).

## Continuous integration

Every push to `main` and every pull request runs two required jobs
(`.github/workflows/ci.yml`), both reading the Node version from `.nvmrc` (24):

- **build** — `npm ci`, `npm run lint`, `npm run format:check`, `npm run build` and `npm test`.
- **e2e** — builds `dist/`, installs Chromium with system dependencies
  (`npx playwright install --with-deps chromium`) and runs `npm run e2e`. Playwright traces and
  screenshots are uploaded as an artifact only when the job fails.

## Testing

```bash
npm test              # isolated Node suite: tenancy, membership, privacy, migration
npm run test:privacy  # the phase 3 privacy matrix on its own
npm run build && npx playwright install chromium && npm run e2e
```

`npm test` spawns real `server.js` processes on ephemeral loopback ports, each with its own
temporary `DATA_DIR`, so no developer database, port 8080 or prebuilt `dist/` is involved.
`npm run test:privacy` stays available as the phase 3 release gate.

The browser suite needs a production build (`npm run build`) and Chromium
(`npx playwright install chromium`). It boots its own throwaway server and database, creates two
workspaces and three accounts through the API, and asserts the tenancy and private-project
contract in Chromium.

## Deploy

`vercel.json` builds with Vite and serves `dist/` as a static, browser-local demo.

For a self-hosted instance — one Node container, accounts and server-side SQLite storage —
see [DEPLOY.md](DEPLOY.md).

## Workspaces

The self-hosted server keeps **several workspaces in one SQLite file**. Each has its own URL
(`/w/<slug>`), its own document (projects, tasks, members, settings) and its own membership
list. Every API call is scoped to a slug and the server enforces the signed-in account's role
on both reads and writes; an account that is not a member of a workspace gets `404`, and the
per-account `me` is derived from the session instead of being stored in the shared document.
Workspaces are listed in the sidebar menu and the command palette, and new ones are created
from the setup wizard.

Projects inside a workspace can be **private** to an invited list instead of shared with
everyone. The server filters hidden projects, tasks, comments, files, activity, notifications
and saved views out of every response, and refuses writes that try to touch a project the
caller cannot see. Owners and admins can always manage a project; its lead manages the access
list and the private switch.

The browser-only demo (Vite dev without the server, and the static Vercel build) has exactly
one local workspace backed by `localStorage`: there is no workspace switcher and no workspace
creation, so nothing implies server-backed multi-tenancy. It applies the same private-project
visibility in the browser.
