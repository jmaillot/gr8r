# Deploying Gr8r Studio

This guide takes a fresh Ubuntu/Debian server to a working HTTPS instance behind Traefik.
The app runs as **one container**: a Node 24 process serves the built SPA and a JSON API,
and stores everything in SQLite on a Docker volume. There is no external database and no
runtime npm dependency.

```
browser ──HTTPS──> Traefik ──> gr8r container :8080
                                   ├── dist/          static SPA
                                   └── /api/*         Node + node:sqlite
                                                        └── /data/gr8r.db
```

## 0. What you need

- A VPS with Docker Engine 24+ and Compose v2 (about 1 GB RAM is enough).
- A DNS record for the hostname pointing at the server.
- Ports **80** and **443** reachable from the internet.
- Traefik with:
  - an external Docker network named `traefik`,
  - entrypoints `web` and `websecure`,
  - a certificate resolver named `letsencrypt`.

If your Traefik uses different names, adjust the labels in `docker-compose.yml`. If you do
not have Traefik yet, see the [appendix](#appendix-minimal-traefik).

## 1. Point DNS at the server

At your DNS provider:

```
Type  A     Name  gr8r    Value  <SERVER_IP>
Type  AAAA  Name  gr8r    Value  <SERVER_IPv6>   # only if you have IPv6
```

Verify before starting the container — Let's Encrypt validates over HTTP/TLS:

```sh
dig +short gr8r.example.com
```

## 2. Install Docker

Skip this if `docker compose version` already works.

```sh
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
docker compose version
```

On Debian, replace `linux/ubuntu` with `linux/debian` in the repository URL.

Check Traefik and its network:

```sh
docker network ls | grep traefik
docker ps --filter name=traefik
```

If the network is missing but Traefik uses another name, either create it:

```sh
docker network create traefik
```

…or change `traefik.docker.network` and the `networks:` section in `docker-compose.yml`.

## 3. Firewall

```sh
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Do **not** open 8080. The app publishes no host port; Traefik reaches it over the Docker
network.

## 4. Get the code onto the server

The repository is private, so use a read-only deploy key.

**On your laptop:**

```sh
ssh-keygen -t ed25519 -f ~/.ssh/gr8r_deploy -N '' -C 'gr8r server deploy'
gh repo deploy-key add ~/.ssh/gr8r_deploy.pub \
  --repo jmaillot/gr8r --title 'gr8r server' --allow-write=false
scp ~/.ssh/gr8r_deploy root@SERVER_IP:/root/.ssh/gr8r_deploy
```

Without the GitHub CLI, add the public key under
**Repository → Settings → Deploy keys → Add deploy key** (leave "Allow write access" off).

**On the server:**

```sh
chmod 600 /root/.ssh/gr8r_deploy

cat >> /root/.ssh/config <<'EOF'
Host gr8r-github
  HostName github.com
  User git
  IdentityFile /root/.ssh/gr8r_deploy
  IdentitiesOnly yes
EOF
chmod 600 /root/.ssh/config

ssh -T gr8r-github     # expect "successfully authenticated" (no shell)

mkdir -p /opt/gr8r
git clone gr8r-github:jmaillot/gr8r.git /opt/gr8r
cd /opt/gr8r
```

The alias keeps the deploy key scoped to this repository and leaves your other GitHub SSH
keys alone.

## 5. Configure

```sh
cd /opt/gr8r
cp .env.example .env
chmod 600 .env
nano .env
```

Set at least:

```dotenv
GR8R_HOST=gr8r.example.com
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=<long unique password>
ADMIN_NAME=Your Name
WORKSPACE_NAME=Gr8r Studio
PUID=1000
PGID=1000
ALLOW_SIGNUP=false
SEED_DATA=true
SESSION_DAYS=30
SECURE_COOKIE=auto
```

`PUID`/`PGID` are the user and group the app runs as. Find yours with `id -u` and `id -g`.
The entrypoint fixes ownership of `/data` at startup, so a bind-mounted directory or a
restored database does not need manual `chown`. `PGID` defaults to `PUID` when empty.

`SEED_DATA=false` creates a workspace with no sample projects, tasks, comments or activity —
just your admin account (the default team categories are created on first use). It only
applies when the database is first created; on an existing install:

```sh
# keep a copy first if you might want the current data back
docker compose exec gr8r node server.js --backup /data/pre-reset.db
docker cp gr8r-studio:/data/pre-reset.db ./pre-reset.db
# set SEED_DATA=false in .env, then:
docker compose down -v
docker compose up -d --build
```

`down -v` deletes the volume, including all accounts and the database. The admin account is
recreated from `.env` on the next start.

Generate a strong password if you like:

```sh
openssl rand -base64 24
```

The admin account is created **only when the database is empty**. Changing `ADMIN_*` after
the first start has no effect; use `--set-password` instead (section 8).

## 6. Start it

```sh
docker compose up -d --build
docker compose ps
docker compose logs -f gr8r
```

The first build takes a minute or two. Look for:

```
bootstrap account: you@example.com
gr8r studio listening on http://0.0.0.0:8080
```

If `ADMIN_PASSWORD` was empty, a generated password is printed **once** here. Save it.
`Ctrl+C` stops following the logs; the container keeps running.

Verify through Traefik:

```sh
curl -fsS https://gr8r.example.com/api/health
# {"ok":true,...}
```

Then open `https://gr8r.example.com` and sign in.

## 7. First-run checks

- The certificate is valid and the browser shows no warning.
- Login works and a page refresh keeps you signed in.
- In DevTools → Application → Cookies, `gr8r_session` is **HttpOnly**, **Secure** and
  **SameSite=Lax**.
- The process runs as your `PUID` and `/data` is owned by it:
  ```sh
  docker top gr8r-studio -o user | tail -1
  docker compose exec gr8r ls -ldn /data
  ```
- Make an edit, reload, and confirm it persisted.
- `docker compose logs gr8r` shows no errors.

If you used a generated admin password, change it now:

```sh
docker compose exec -e USER_PASSWORD='a new long password' \
  gr8r node server.js --set-password you@example.com
```

Existing sessions are revoked; sign in again.

## 8. Create accounts

Sign-ups stay disabled with `ALLOW_SIGNUP=false`.

```sh
# prints a generated password unless USER_PASSWORD is set
docker compose exec gr8r node server.js --add-user alice@example.com "Alice"

# or choose the password yourself
docker compose exec -e USER_PASSWORD='another long password' \
  gr8r node server.js --add-user bob@example.com "Bob"
```

Accounts created this way get the `member` role (read/write). The API also enforces a
read-only `viewer` role, but there is no role-management UI yet.

Password reset (also revokes that user's sessions):

```sh
docker compose exec -e USER_PASSWORD='the new password' \
  gr8r node server.js --set-password alice@example.com
```

## 9. Backups

A Docker volume is **not** a backup. `docker compose down -v`, a disk failure or a bad
release takes it with it.

Create `/opt/gr8r/backup.sh`:

```sh
#!/usr/bin/env bash
set -euo pipefail
cd /opt/gr8r

STAMP=$(date +%F-%H%M)
NAME="backup-$STAMP.db"

docker compose exec -T gr8r node server.js --backup "/data/$NAME"
install -d -m 700 /var/backups/gr8r
docker cp "gr8r-studio:/data/$NAME" "/var/backups/gr8r/$NAME"
docker compose exec -T gr8r rm -f "/data/$NAME"

# keep 14 days locally
find /var/backups/gr8r -name 'backup-*.db' -mtime +14 -delete
```

```sh
chmod +x /opt/gr8r/backup.sh
/opt/gr8r/backup.sh
ls -lh /var/backups/gr8r
```

Schedule it:

```sh
crontab -e
```

```cron
15 3 * * * /opt/gr8r/backup.sh >> /var/log/gr8r-backup.log 2>&1
```

Copy the snapshots **off the server** (another host, object storage, restic/rclone):

```sh
rsync -a /var/backups/gr8r/ backup@other-host:/srv/backups/gr8r/
```

The database contains password hashes and session tokens: encrypt backups or restrict
access to them. Test a restore on a staging copy at least once.

### Restore

```sh
cd /opt/gr8r
docker compose stop gr8r
docker cp /var/backups/gr8r/backup-2026-10-21-0315.db gr8r-studio:/data/gr8r.db

VOL=$(docker inspect gr8r-studio \
  --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')
docker run --rm --user root --entrypoint sh -v "$VOL":/data gr8r-studio:1.0.0 \
  -c 'rm -f /data/gr8r.db-wal /data/gr8r.db-shm'

docker compose start gr8r
docker compose logs --tail=20 gr8r
```

`docker cp` preserves the snapshot's owner. The entrypoint runs `chown` on `/data` before
dropping to `PUID:PGID`, so a backup written by root is usable without extra steps.

## 10. Updates and rollback

```sh
cd /opt/gr8r
./backup.sh
git pull
docker compose up -d --build
docker compose ps
curl -fsS https://gr8r.example.com/api/health
```

Rollback to a previous commit:

```sh
git log --oneline -5
git checkout <previous-sha>
docker compose up -d --build
```

That leaves a detached HEAD; return with `git switch main` once you are done. Database
migrations are additive, so the volume survives rebuilds — but take the backup first.

## 11. Troubleshooting

| Symptom                                   | Check                                                                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `set ADMIN_EMAIL in .env` on `compose up` | You are not in `/opt/gr8r`, or `.env` is missing.                                                                                       |
| Traefik returns 404                       | The container is not on the `traefik` network, or the `Host(...)` label does not match DNS. Try `docker network inspect traefik`.       |
| 502 Bad Gateway                           | The container is down or unhealthy: `docker compose ps`, `docker compose logs gr8r`.                                                    |
| No certificate                            | DNS not propagated, ports 80/443 blocked, or the resolver is not named `letsencrypt`. Check the Traefik logs.                           |
| Login bounces back to the form            | The cookie was rejected. Confirm HTTPS, that Traefik sends `X-Forwarded-Proto`, and try `SECURE_COOKIE=true`.                           |
| "Could not reach the server" in the UI    | `/api` is not routed. Test `https://host/api/health`.                                                                                   |
| Forgot the admin password                 | `docker compose exec -e USER_PASSWORD='...' gr8r node server.js --set-password you@example.com`                                         |
| Which accounts exist?                     | See the command below.                                                                                                                  |
| Data disappeared                          | Someone ran `docker compose down -v`, which deletes the volume. Restore from backup.                                                    |
| `unable to open database file` at startup | `/data` is not writable by the configured `PUID` (default 1000). Usually an old image, or a manual `user:` override. See the fix below. |
| `./data:/data` bind mount fails           | The entrypoint should chown it at startup. Rebuild; if you override `user:`, chown it yourself.                                         |

### Fix `unable to open database file`

This is a permissions error, not a missing path: `/data`, `gr8r.db`, or a WAL file is not
writable by the user the server runs as (`PUID`, default 1000).

First make sure the current image is running — the entrypoint chowns `/data` on every
start:

```sh
cd /opt/gr8r
docker compose up -d --build
docker compose logs --tail=30 gr8r
```

If it still fails, inspect the mount:

```sh
docker inspect gr8r-studio --format '{{json .Mounts}}'
```

If it is a **bind mount** (a host path is listed as `Source`), and you override the
container user yourself, give it ownership. Replace `1026:1026` with your `PUID:PGID`:

```sh
docker compose down
sudo chown -R 1026:1026 /path/to/data
docker compose up -d
```

If it is a **named volume**:

```sh
VOL=$(docker inspect gr8r-studio \
  --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')
docker compose down
docker run --rm --user root -v "$VOL":/data alpine:3.21 \
  sh -c 'chown -R 1026:1026 /data && ls -ldn /data'
docker compose up -d
```

Do not fix this by running the app as root, and do not store the database in the
repository: the named volume is the intended location.

List accounts:

```sh
docker compose exec gr8r node -e \
  "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/data/gr8r.db');console.log(db.prepare('select email, name from users').all())"
```

## 12. Local development

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

## 13. Operational limits

- **One workspace, one JSON document.** Saves carry an integer `revision`; a stale write
  gets `409` instead of overwriting someone else's work, and the client asks you to reload.
  This is not real-time collaboration — changes appear after a save or reload.
- **Single Node process, SQLite WAL.** Fine for a small team. Concurrent writers serialize;
  if you outgrow it, the storage layer is isolated in `server.js` and can move to Postgres.
- **Sessions** are opaque random tokens stored hashed, sent in an httpOnly `SameSite=Lax`
  cookie. Passwords are scrypt hashes.
- **The entrypoint** starts as root only long enough to make `/data` writable, then drops to
  `PUID:PGID` with `su-exec`. Because the image has no default `USER`, `docker compose exec`
  runs as root; use it for the documented CLI commands, nothing else.
- **`TRUST_PROXY=true`** trusts `X-Forwarded-*`. Keep the container behind Traefik; it
  publishes no port. Direct exposure would let clients spoof their IP for throttling.
- **Rate limiting** is in memory and resets when the container restarts.
- **Uploads are still simulated.** Attachment names and sizes live in the workspace
  document; file contents are not stored. Do not treat them as backed-up files.
- **No email.** There is no self-service password reset or verification; admins reset
  passwords with the CLI.
- **CSP allows Google Fonts.** For an air-gapped deployment, self-host the fonts and
  tighten `Content-Security-Policy` in `server.js`.
- **No multi-workspace UI or role management.** The schema has memberships, but the app
  exposes one workspace.

## Appendix: minimal Traefik

If you do not already run Traefik, use `/opt/traefik/docker-compose.yml`, replace the email,
and start it before Gr8r Studio:

```yaml
services:
  traefik:
    image: traefik:v3.6
    restart: unless-stopped
    command:
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.web.http.redirections.entrypoint.scheme=https
      - --certificatesresolvers.letsencrypt.acme.email=you@example.com
      - --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json
      - --certificatesresolvers.letsencrypt.acme.tlschallenge=true
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik-letsencrypt:/letsencrypt
    networks:
      - traefik

volumes:
  traefik-letsencrypt:

networks:
  traefik:
    name: traefik
```

```sh
cd /opt/traefik
docker compose up -d
docker compose logs -f traefik
```

Pin **v3.6** or newer; Traefik 3.3 fails against recent Docker releases with a client API
1.24 error.

Notes:

- The Docker socket is powerful even read-only; only trusted containers should reach it.
- If another service already binds 80/443, stop it or integrate with that proxy instead.
- `tlschallenge` needs port 443 reachable. Use `httpchallenge` if that is not possible.
