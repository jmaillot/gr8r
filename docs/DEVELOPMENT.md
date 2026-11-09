# Developing Projects Studio

How to run the app locally and work on the code. For self-hosting — one Node
container behind Traefik — see [`DEPLOY.md`](DEPLOY.md).

## Quick start

Browser-local demo, no API (the original behaviour):

```sh
npm ci
npm run dev            # http://localhost:5173
```

Full stack:

```sh
npm ci
npm run build
npm run seed:json
DATA_DIR=./data ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='local password' \
  PORT=8080 npm start
npm run dev            # Vite proxies /api to localhost:8080
```

`API_ORIGIN` overrides the proxy target. If the API is not running, `/api/config` fails and
the client falls back to local demo mode.

## Tests

```sh
npm test              # tenancy, membership, privacy and migration suites (real servers)
npm run test:privacy  # phase 3 privacy matrix only
```

Both spawn `server.js` on an ephemeral loopback port with a temporary `DATA_DIR`; they need
Node 24 (for `node:sqlite`), no developer database and no built `dist/`.

The browser suite needs a production build and Chromium first:

```sh
npm run build
npx playwright install chromium   # add --with-deps on a fresh Linux host
npm run e2e
```

## Continuous integration

CI runs `npm test` in the build job and `npm run e2e` in a separate job that uploads Playwright
traces when it fails (`.github/workflows/ci.yml`). A third job, `docker-build`, builds the
image, boots a throwaway container from it, and asserts the French catalogue chunk is served
with French content — so the shipped image is verified to carry the French catalogue.
