# Postgres backend (optional)

By default the app runs on embedded SQLite — one file on the `/data` volume, zero runtime
dependencies. Setting `DB_URL` in `.env` switches it to Postgres — nothing else changes.
The full runbook (migration, backups, rollback) lives in
[`DEPLOY.md §14`](DEPLOY.md).

## Fail-closed boot

An unreachable or misconfigured `DB_URL` stops the server with a clear error — never a
silent SQLite fallback — and the connection string is never logged.

## Automatic schema initialization and migrations

On an empty database the app creates every table at first boot; additive migrations (new
columns) apply on every start on both backends. No manual migration step exists or is
needed. To create the schema ahead of the first start (CI, first-deploy probe), run:

```sh
npm run db:init                                        # uses DB_URL / DB_PATH from the environment
docker compose exec projects node server.js --db-init  # inside the container
```

## Quick start with Docker

The bundled `docker-compose.yml` ships an optional Postgres service:

```sh
# .env
POSTGRES_PASSWORD=<long unique password>
DB_URL=postgres://projects:<same password>@db:5432/projects?sslmode=disable

docker compose --profile postgres up -d
```

Without the profile, `docker compose up -d` keeps the SQLite default and never starts the
database container.

## How much TLS does Postgres need?

| Where Postgres runs                                              | `sslmode` in `DB_URL`           | Why                                                                     |
| ---------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| Same private network / Docker network / VPC                      | `disable`                       | Traffic never leaves the trusted network; TLS adds nothing              |
| Distant host with self-signed or provider TLS                    | `require`                       | Encrypts the link; server certificate is accepted without verification  |
| Managed endpoint over the public internet (RDS, Neon, Supabase…) | `verify-full` (+ `sslrootcert`) | Encrypts **and** authenticates the server — blocks man-in-the-middle    |

`sslmode` is a parameter of `DB_URL` itself
(`postgres://user:pass@host:5432/db?sslmode=require`) — it is environment configuration,
never a code change.

**Running Postgres in Docker — per mode:**

```sh
# Mode 1 — private network, no TLS (sslmode=disable)
#   Postgres listens without TLS; both containers share a Docker network.
docker network create projects-net
docker run -d --name projects-pg --network projects-net \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=projects \
  -v projects-pgdata:/var/lib/postgresql/data \
  postgres:17-alpine
#   App side: DB_URL=postgres://postgres:secret@projects-pg:5432/projects?sslmode=disable

# Mode 2 — TLS enabled, certificate not verified (sslmode=require)
#   Generate a self-signed cert and start Postgres with TLS on:
openssl req -new -x509 -days 365 -nodes -subj "/CN=projects-pg" \
  -keyout server.key -out server.crt
chmod 600 server.key && chown 999:999 server.key server.crt
docker run -d --name projects-pg \
  -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=projects \
  -v projects-pgdata:/var/lib/postgresql/data \
  -v "$PWD/server.crt:/var/lib/postgresql/server.crt:ro" \
  -v "$PWD/server.key:/var/lib/postgresql/server.key:ro" \
  postgres:17-alpine \
  -c ssl=on
#   App side: DB_URL=postgres://postgres:secret@projects-pg:5432/projects?sslmode=require

# Mode 3 — public internet / managed endpoint (sslmode=verify-full)
#   Download the provider CA certificate and mount it into the APP container:
DB_URL='postgres://user:pass@db.example.com:5432/projects?sslmode=verify-full&sslrootcert=/certs/ca.crt'
docker run -d --name projects-app \
  -v /path/to/ca.crt:/certs/ca.crt:ro \
  --env-file /opt/projects/.env \
  -p 8080:8080 projects-studio
```

With docker-compose, only `.env` changes: add `DB_URL=...` to `/opt/projects/.env`
(already forwarded by `docker-compose.yml`) and `docker compose up -d`. To roll back to
SQLite, remove `DB_URL` and recreate — the old `projects.db` file is never touched by
pg mode.

## Backups

The `server.js --backup` command and automatic pre-migration backups are **SQLite-only**.
Under Postgres, backups become a database-side task:

```sh
pg_dump --format=custom --file=/var/backups/projects/pg-$(date +%F-%H%M).dump "$DB_URL"
```

The dump contains password hashes and session tokens — encrypt or restrict access. See
[`DEPLOY.md §14`](DEPLOY.md) for the full SQLite→Postgres copy runbook and rollback path.
