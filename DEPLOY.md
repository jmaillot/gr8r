# Self-hosting Gr8r Studio

This checkout runs as **one container**: a Node 24 process serves the built SPA and a small
JSON API, and stores everything in SQLite on a volume. There is no external database, no
runtime npm dependency and no build step at startup.

```
browser ──HTTPS──> Traefik ──> gr8r container :8080
                                   ├── dist/          static SPA
                                   └── /api/*         Node + node:sqlite
                                                        └── /data/gr8r.db
```

## 1. Prerequisites

- Docker with Compose v2.
- A Traefik instance already running, with:
  - an external Docker network named `traefik`,
  - `web` and `websecure` entrypoints,
  - a certificate resolver named `letsencrypt`.
- A DNS record for your hostname pointing at the server.

If your Traefik names differ, edit `docker-compose.yml` (network, entrypoints, resolver).

## 2. Configure

```sh
cp .env.example .env
$EDITOR .env
```

Set `GR8R_HOST`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `ADMIN_NAME`. The admin account is
created **only when the database is empty** — changing these later has no effect.
`ALLOW_SIGNUP=false` is the safe default: accounts are then created by an admin.

## 3. Start

```sh
docker compose up -d --build
docker compose logs -f gr8r
```

The log shows the bootstrap account. If you did not set `ADMIN_PASSWORD`, a random one is
printed **once** — copy it, sign in, then change it (section 4).

Open `https://<GR8R_HOST>` and sign in. The service is not published on the host; only
Traefik reaches it over the shared network.

## 4. Accounts

Sign-ups are disabled unless `ALLOW_SIGNUP=true`. New accounts always get the `member`
role and a matching member row in the workspace.

Create an account from the host:

```sh
docker compose exec gr8r node server.js --add-user alice@example.com "Alice"
```

Without `USER_PASSWORD`, a random password is printed once:

```sh
docker compose exec -e USER_PASSWORD='a long unique password' \
  gr8r node server.js --add-user bob@example.com "Bob"
```

Reset a password (also revokes that user's sessions):

```sh
docker compose exec -e USER_PASSWORD='the new password' \
  gr8r node server.js --set-password alice@example.com
```

Roles are enforced by the API: `owner`, `admin` and `member` can write, `viewer` is
read-only. There is no role-management UI yet; accounts created above are `member`.

## 5. Data and backups

The database lives in the `gr8r-data` volume mounted at `/data` (WAL mode). A volume is
**not** a backup: `docker compose down -v`, a disk failure or a bad release takes it with it.

Take a consistent snapshot while the server is running:

```sh
docker compose exec gr8r node server.js --backup /data/backup-$(date +%F).db
mkdir -p backups
docker cp gr8r-studio:/data/backup-$(date +%F).db ./backups/
```

Then copy `backups/` somewhere else (another host, object storage) on a schedule, and
restore one at least once to prove it works.

Restore:

```sh
docker compose stop gr8r
docker cp ./backups/backup-2026-10-21.db gr8r-studio:/data/gr8r.db
VOL=$(docker inspect gr8r-studio --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')
docker run --rm -v "$VOL":/data gr8r-studio:1.0.0 sh -c 'rm -f /data/gr8r.db-wal /data/gr8r.db-shm'
docker compose start gr8r
```

The snapshot contains password hashes and sessions: treat it as a secret.

## 6. Updating

```sh
docker compose exec gr8r node server.js --backup /data/pre-update.db
docker compose up -d --build
```

The schema is created with `create table if not exists` and migrations are additive, so the
volume survives rebuilds. Back up first anyway.

## 7. Local development

Browser-local demo (no API, as before):

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

`API_ORIGIN` overrides the proxy target. If the API is not running, `/api/config` fails,
the client disables server mode and the app stays a local demo.

## 8. What this is, and what it is not

- **One workspace, one JSON document.** The server stores the same shape the browser used
  to keep in `localStorage`, with an integer `revision`. `PUT /api/workspace` succeeds only
  if the revision matches; otherwise it returns `409` and the client asks you to reload.
  This prevents silent overwrites, but it is not real-time collaboration: another person's
  changes appear after a save or a reload.
- **Single Node process, SQLite WAL.** Fine for a small team. Concurrent writers are
  serialized; if you outgrow it, replace the SQLite layer with Postgres — the API and
  document model are isolated in `server.js`.
- **Sessions** are opaque random tokens, stored hashed, sent in an httpOnly `SameSite=Lax`
  cookie, valid for `SESSION_DAYS`. Passwords are scrypt hashes.
- **`TRUST_PROXY=true`** trusts `X-Forwarded-*`; keep the container behind Traefik (it
  publishes no port). Direct exposure would let clients spoof their IP for throttling.
- **Rate limiting** is in memory and resets on restart.
- **Uploads are still simulated.** Attachment names and sizes are stored in the workspace
  document; file contents are not uploaded anywhere. Do not treat them as backed-up files.
- **No email.** There is no self-service password reset or verification; admins reset
  passwords with the CLI.
- **CSP allows Google Fonts.** For an air-gapped deployment, self-host the fonts and tighten
  `Content-Security-Policy` in `server.js`.
- **No multi-workspace UI.** The database schema has memberships, but the app exposes one
  workspace.

## 9. Without Traefik

```sh
docker build -t gr8r-studio:1.0.0 .
docker run -d --name gr8r-studio --restart unless-stopped \
  --env-file .env -e DATA_DIR=/data \
  -v gr8r-data:/data -p 127.0.0.1:8080:8080 gr8r-studio:1.0.0
```

Put your own TLS-terminating proxy in front, or set `SECURE_COOKIE=false` when testing over
plain HTTP (never in production). Binding to `127.0.0.1` keeps the port off the network.

Health check: `curl http://127.0.0.1:8080/api/health`.
