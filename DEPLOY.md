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
APP_URL=
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=<long unique password>
ADMIN_NAME=Your Name
WORKSPACE_NAME=Gr8r Studio
WORKSPACE_SLUG=gr8r-studio
PUID=1000
PGID=1000
ALLOW_SIGNUP=false
SEED_DATA=true
SESSION_DAYS=30
SECURE_COOKIE=auto
TRUST_PROXY=false
MAX_BODY_BYTES=8388608
```

`PUID`/`PGID` are the user and group the app runs as. Find yours with `id -u` and `id -g`.
The entrypoint fixes ownership of `/data` at startup, so a bind-mounted directory or a
restored database does not need manual `chown`. `PGID` defaults to `PUID` when empty.

The code default is `TRUST_PROXY=false`: by default the app reads NO `X-Forwarded-*` header,
so a directly exposed client cannot spoof its address and escape the per-IP throttles. Set
`TRUST_PROXY=true` only when a proxy that overwrites these headers (e.g. Traefik) sits in
front of the app. Behind a proxy without the opt-in, the login throttle keys on the proxy's
address (a shared budget) and the `Secure` cookie flag is no longer detected from the
request headers. The bundled docker-compose passes `TRUST_PROXY=true` explicitly for the
Traefik deployment.

`MAX_BODY_BYTES=8388608` (8 MiB, the default) caps the size of a JSON request body — one whole
workspace document is saved at a time. Raise it only if a workspace legitimately grows past
that; a lower value is a cheap guard against oversized writes.

`APP_URL` is the absolute URL the app prints in share and invite links and shows in the
workspace URL fields, e.g. `https://gr8r.example.com`. Leave it empty when the browser
requests the same hostname users should see: the app then uses the request host (honouring
`X-Forwarded-Host`/`X-Forwarded-Proto`). Set it explicitly when a proxy, tunnel or alternate
domain makes the request host differ from the public address.

`APP_URL` becomes **mandatory** as soon as `SMTP_HOST` is configured: invitation emails
contain absolute `/join/<token>` links, and without `APP_URL` those links would be built
from the request's Host header — a hostile Host header would email invites pointing at the
attacker's domain. The server refuses to start in that configuration (exit 1, a message
naming both variables); set `APP_URL` or unset `SMTP_HOST`.

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

## 8. Create accounts and workspaces

Sign-ups stay disabled with `ALLOW_SIGNUP=false`.

```sh
# prints a generated password unless USER_PASSWORD is set
docker compose exec gr8r node server.js --add-user alice@example.com "Alice"

# or choose the password yourself
docker compose exec -e USER_PASSWORD='another long password' \
  gr8r node server.js --add-user bob@example.com "Bob"

# add someone straight into a second workspace
docker compose exec gr8r node server.js --add-user carol@example.com "Carol" acme
```

Accounts created this way get the `member` role in the workspace you name (the first one by
default). Without a slug, the CLI adds the account to the oldest workspace.

### Workspaces

Every workspace has a URL of its own: `https://<GR8R_HOST>/w/<slug>`. The slug comes from
`WORKSPACE_SLUG` or the workspace name when the database is first created — an existing
workspace keeps the slug it was migrated with, so changing `WORKSPACE_SLUG` later has no
effect.

There is one workspace after a fresh install. With `ALLOW_SIGNUP=true`, any signed-in user can
create more from the workspace menu; with `ALLOW_SIGNUP=false`, only an owner or admin of an
existing workspace can. The creator becomes its owner.

Data is isolated per workspace: members only ever receive the document of a workspace they
belong to, and a request for any other slug answers `404`. Inside a workspace, a **private
project** is redacted server-side for anyone who is not on its access list — its project, tasks,
comments, files, activity, notifications and saved views are absent from the served document.
Writes are merged with the stored document, so a redacted copy cannot delete or rewrite a
project it cannot see. The project lead, an admin or the owner can change who has access.
Roles are enforced by the server:

| Role     | Read | Write projects/tasks | Edit members | Edit workspace (name, slug, colour) | Invite people | Change the plan |
| -------- | ---- | -------------------- | ------------ | ----------------------------------- | ------------- | --------------- |
| `owner`  | yes  | yes                  | yes          | yes                                 | yes           | yes             |
| `admin`  | yes  | yes                  | yes          | yes                                 | yes           | no              |
| `member` | yes  | yes                  | no           | no                                  | no            | no              |
| `viewer` | yes  | no                   | no           | no                                  | no            | no              |

Switching workspaces is part of the workspace menu in the sidebar, or with the command palette
(`Ctrl/Cmd+K`, then **Workspaces**).

Signing in with no workspace yet — a fresh account, or an invite to a workspace you have not
accepted — shows either the create-workspace wizard or a page telling you to ask for an
invitation, depending on the policy above.

### Members, roles and leaving

**Members** lists everyone in the workspace with the role kept in the membership table, not in
the workspace document. Owners can promote anyone to owner or admin; admins can change members,
viewers and guests but cannot touch another admin or an owner. Nobody can change their own role
or remove themselves from the member list — use **Settings → Workspace → Leave workspace**
instead. The last owner cannot be demoted, removed or leave until another owner exists.

Removing a member or leaving takes effect immediately: their membership is deleted, their tasks
and subtasks are unassigned, they are removed from project membership and teams, and their
profile disappears from the workspace. The next request from that account answers `404`.

Owners can change the workspace name, URL and colour, change the plan, and delete the whole
workspace from **Settings → Workspace**. Deleting asks for the workspace URL as confirmation,
removes every membership and returns the browser to its next workspace or the setup screen.
Admins see **Leave workspace** but not **Delete workspace**.

Pending address invites appear under **Members → Pending invites** for admins and owners, where
they can be resent (a fresh link and expiry) or revoked. Revoked and expired links answer `404`
and `410` respectively.

### Upgrading to 1.1.1

1.1.1 is a patch release. It changes no schema and writes no backup: pull, rebuild and restart
as usual. It fixes the browser losing the workspace revision after a role, member-removal or
plan change, after an invite is accepted in another session, and across a restart — each of
which made the next write fail with `409` and drop the edit.

```sh
cd /opt/gr8r
git pull
docker compose up -d --build
docker compose logs --tail=20 gr8r
```

### Upgrading an existing install to 1.1.0

The first start after this update migrates the single-workspace database in place:

- it writes a consistent backup to `DATA_DIR/gr8r-premultitenant-<timestamp>.db` before touching
  anything;
- the existing workspace gets a slug derived from its URL field, or from its name if that is
  empty;
- member profiles are linked to the accounts that own them; the `data.me` field previously
  shared by every account is retired (each browser now derives it from its own session);
- legacy pending invites are scoped to the migrated workspace;
- the demo-only workspace switcher list is dropped, and the real one takes over.

The migration is idempotent: restarting does not create another backup or change the workspace
again, and a second boot is byte-identical.

To upgrade:

```sh
cd /opt/gr8r
git pull
# record the exact image the container runs, before the rebuild replaces its tag
docker inspect --format '{{.Image}}' gr8r-studio > /tmp/gr8r-previous-image-id
docker compose up -d --build
docker compose logs --tail=40 gr8r  # expect: pre-migration backup written to /data/gr8r-premultitenant-<stamp>.db
```

To roll back to the previous image:

```sh
cd /opt/gr8r
docker compose stop gr8r
docker cp gr8r-studio:/data/gr8r-premultitenant-<stamp>.db ./pre-1.1.0.db
docker cp ./pre-1.1.0.db gr8r-studio:/data/gr8r.db
VOL=$(docker inspect gr8r-studio \
  --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')
docker run --rm --user root -v "$VOL":/data alpine:3.21 \
  sh -c 'rm -f /data/gr8r.db-wal /data/gr8r.db-shm'
# re-tag the captured image id; Compose cannot address an untagged image
docker tag "$(cat /tmp/gr8r-previous-image-id)" gr8r-studio:rollback
```

Set `image: gr8r-studio:rollback` in `docker-compose.yml` for the rollback, then run
`docker compose up -d`. Revert that line with `git checkout docker-compose.yml` once the
previous release is running, so the next upgrade starts from the pinned tag again.

The added tenancy columns are ignored by the old code, so a restored pre-migration database
starts cleanly on the previous image. Delete the backup only once the new release is verified.

### Known limits

- Plans (`Free`/`Team`/`Business`) are labels only; nothing is billed or limited yet.
- Recent searches are workspace-wide rather than per user. A term that names a private project
  is redacted for members who cannot see it, and a non-member cannot erase or rewrite the stored
  history, but every workspace member shares one list. Per-user storage is planned for the next
  release.

### Invite links and email

Admins and owners can invite people from **Members → Invite**. Set `SMTP_HOST` to have the
server email each address-bound invite automatically; without it, the server still creates
the links and you copy them yourself.

- Links expire after `INVITE_DAYS` (default 7).
- An invite created for a specific address is single-use, and only that address can accept it.
- **Copy invite link** creates a reusable workspace link with the role selected in the dialog;
  anyone holding it can join until it expires. It is never emailed automatically.
- Sign-ups stay disabled. Invite links are the only way to create accounts besides the CLI.
- If an email cannot be delivered, the invite still exists. The dialog shows **Not sent** and
  the copyable link, so you can retry with **Resend invite** or send it yourself.
- Pending address invites are listed under **Members → Pending invites**; resending replaces the
  old link, and revoking it invalidates the link immediately. Removing a member ends their
  access immediately but leaves their pending invites to be revoked separately.

#### Configure SMTP

Add these values to `/opt/gr8r/.env` (the file is already git-ignored; keep it at mode
`600`):

```dotenv
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=notifications@example.com
SMTP_PASS=your-app-password
MAIL_FROM=notifications@example.com
MAIL_FROM_NAME=Gr8r Studio
```

- Use port **587** with `SMTP_SECURE=false` for STARTTLS (the usual choice), or port **465**
  with `SMTP_SECURE=true` for implicit TLS. Leave `SMTP_SECURE` empty to infer it from the port.
- `SMTP_USER`/`SMTP_PASS` are optional for a trusted relay. When set, the app authenticates
  with AUTH PLAIN or LOGIN. Use an app password, not your main account password.
- `MAIL_FROM` must be an address the SMTP server allows you to send from. Some providers
  require it to match `SMTP_USER`.
- `SMTP_REJECT_UNAUTHORIZED=true` (default) verifies the server certificate. Only set it to
  `false` for a self-signed test server.
- `SMTP_REQUIRE_TLS=true` (default) refuses to send if the server offers neither STARTTLS nor
  implicit TLS, so invite links are not exposed in transit. Set it to `false` only for a
  trusted relay on a private network.
- `SMTP_ALLOW_INSECURE_AUTH` is only for a local SMTP sink without TLS. Never enable it with
  real credentials.

Recreate the container so Compose picks up the new environment, then check the startup log:

```sh
docker compose up -d
docker compose logs --tail=30 gr8r
# expect: invite email: enabled via smtp.example.com:587 as notifications@example.com
```

Invite a test address once to test. If the log says `invite email: disabled`, `SMTP_HOST` is
missing or `MAIL_FROM` is invalid. Delivery errors are logged without credentials or message
contents. For reliable inbox delivery, configure SPF and DKIM for the sending domain with
your mail provider; otherwise messages may land in spam.

To revoke one pending invite, use the **Revoke** button next to it under **Members → Pending
invites**; the link stops working immediately. To invalidate _every_ pending link at once — for
example after a leak — delete them from the database:

```sh
docker compose exec gr8r node -e \
  "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/data/gr8r.db');db.exec('delete from invites');console.log('pending invites cleared')"
```

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
docker run --rm --user root --entrypoint sh -v "$VOL":/data gr8r-studio:1.1.1 \
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

### Tests

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

CI runs `npm test` in the build job and `npm run e2e` in a separate job that uploads Playwright
traces when it fails (`.github/workflows/ci.yml`). A third job, `docker-build`, builds the
image, boots a throwaway container from it, and asserts the French catalogue chunk is served
with French content — so the shipped image is verified to carry the French catalogue.

## 13. Operational limits

- **One JSON document per workspace.** Saves carry an integer `revision`; a stale write
  gets `409` instead of overwriting someone else's work, and the client asks you to reload.
  This is not real-time collaboration — changes appear after a save or reload.
- **Single Node process, SQLite WAL.** Fine for a small team. Concurrent writers serialize;
  if you outgrow it, the storage layer is isolated in `server.js` and can move to Postgres.
- **Sessions** are opaque random tokens stored hashed, sent in an httpOnly `SameSite=Lax`
  cookie. Passwords are scrypt hashes.
- **The entrypoint** starts as root only long enough to make `/data` writable, then drops to
  `PUID:PGID` with `su-exec`. Because the image has no default `USER`, `docker compose exec`
  runs as root; use it for the documented CLI commands, nothing else.
- **`TRUST_PROXY`** defaults to `false` in the code and must be opted into explicitly:
  `true` makes the app trust `X-Forwarded-*`. Keep the container behind Traefik with
  `TRUST_PROXY=true` (the bundled compose file sets it); direct exposure would let clients
  spoof their IP for throttling — with the default off, header rotation cannot.
- **Rate limiting** is in memory and resets when the container restarts.
- **Uploads are still simulated.** Attachment names and sizes live in the workspace
  document; file contents are not stored. Do not treat them as backed-up files.
- **Plans are display-only.** `Free`/`Team`/`Business` are labels; nothing is billed, limited
  or enforced.
- **Email is optional.** Without `SMTP_HOST` the server still creates invite links for you to
  copy; there is no self-service password reset or email verification either way.
- **No self-service account recovery.** Admins reset passwords with the CLI.
- **CSP allows Google Fonts.** For an air-gapped deployment, self-host the fonts and
  tighten `Content-Security-Policy` in `server.js`.

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
