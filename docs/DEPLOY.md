# Bluefish CRM — Production Deploy Guide

Step-by-step for a **Hostinger VPS** (or any Docker-capable host) that already
has other Docker workloads running. Everything below is written so a fresh ops
engineer can follow it top-to-bottom without prior context.

> **Recommended stack:** Docker + Docker Compose + Caddy reverse proxy + a
> **dedicated Postgres container** for the CRM. Total footprint ≈ 400 MB RAM,
> 2 GB disk once seeded.

---

## 1. Postgres — dedicated vs shared with existing systems?

**Recommendation: dedicated container** (already wired in `docker-compose.prod.yml`).

| Angle              | Dedicated container ✅ | Shared instance                              |
|--------------------|-----------------------|----------------------------------------------|
| Version upgrades   | Independent           | Coupled to other tenants                     |
| Backup granularity | One DB, one snapshot  | Must dump per-DB or restore the whole cluster |
| Blast radius       | Contained             | A rogue query on tenant A can starve tenant B |
| RAM cost           | ~120 MB baseline      | 0 (shared)                                   |
| Ops effort         | One line in compose   | Add DB + role + grants manually              |

**When it's fine to share:** the existing Postgres is already backed up,
version-pinned, and has spare connections/CPU. In that case skip the
`postgres` service in `docker-compose.prod.yml` and just create a
dedicated database + login role on the existing instance:

```bash
# On the host running the shared Postgres container:
docker exec -it <existing-postgres> psql -U postgres <<'SQL'
CREATE ROLE bluefish LOGIN PASSWORD 'your-strong-pw';
CREATE DATABASE bluefish_crm OWNER bluefish ENCODING 'UTF8';
GRANT ALL PRIVILEGES ON DATABASE bluefish_crm TO bluefish;
SQL
```

Then in `.env` point at the shared instance instead:

```
# Comment out the compose Postgres service and set this directly:
DATABASE_URL=postgresql://bluefish:your-strong-pw@<shared-host>:5432/bluefish_crm
```

**For the rest of this guide we assume the dedicated container option.**

---

## 2. Prerequisites

### On your workstation
- Git access to `github.com/prompanc-debug/BluefishCRM`
- SSH key pair (Ed25519 preferred)

### On the Hostinger VPS
- Ubuntu 22.04 or 24.04 LTS (Debian works the same)
- Docker Engine 24+ with Compose v2 plugin
- Ports 80 + 443 open in the firewall (Hostinger control panel → Firewall)
- A dedicated non-root user with docker group access (do **not** run this as root)
- Optional swap file if RAM ≤ 4 GB — Vite build peaks around 2 GB

Verify:
```bash
docker version               # ≥ 24
docker compose version       # v2.x
sudo ufw status              # (or your equivalent) — 80/443 open
```

### DNS
Point the CRM subdomain at the VPS **A** record:
```
crm.bluefishsolution.com   A   <vps-public-ipv4>
```
TTL 5 min for the cutover; you can raise it after.

---

## 3. Clone + configure

```bash
# 1. Pick a stable directory — /opt is idiomatic for docker apps
sudo mkdir -p /opt/bluefish-crm
sudo chown $USER:$USER /opt/bluefish-crm
cd /opt/bluefish-crm

# 2. Clone the repo
git clone https://github.com/prompanc-debug/BluefishCRM.git .

# 3. Create the env file from the template
cp .env.production.example .env
```

Now edit `.env` — **at minimum** fill in the REQUIRED values:

```bash
nano .env
```

| Key                     | How to generate                                              |
|-------------------------|--------------------------------------------------------------|
| `POSTGRES_PASSWORD`     | `openssl rand -base64 24`                                    |
| `JWT_SECRET`            | `openssl rand -base64 48`                                    |
| `REFRESH_TOKEN_SECRET`  | `openssl rand -base64 48`                                    |
| `INTEGRATION_ENC_KEY`   | `openssl rand -base64 32` — **encrypts Inbox channel secrets** |
| `CORS_ORIGINS`          | Your public HTTPS URL, e.g. `https://crm.bluefishsolution.com` |
| `PUBLIC_API_URL`        | `https://crm.bluefishsolution.com/api` (same origin as SPA)  |

Update the Caddyfile with your real domain:

```bash
sed -i 's/crm\.bluefishsolution\.com/YOUR-DOMAIN.example.com/' Caddyfile
```

---

## 4. Reverse proxy: same-host or shared with existing Docker?

Two layouts depending on what's already on the VPS.

### Layout A — CRM owns 80/443 (recommended if the VPS is new-ish)
Use the `caddy` service in `docker-compose.prod.yml` as-is. Caddy will
auto-obtain a Let's Encrypt certificate on first request.

### Layout B — an existing reverse proxy already binds 80/443
Remove the `caddy` service from `docker-compose.prod.yml` and instead expose
`web` on a host port (say `127.0.0.1:8080`) and `api` on `127.0.0.1:4000`.
Then add a vhost to your existing Nginx/Caddy/Traefik that:

- routes `/api/*` → `http://127.0.0.1:4000`
- routes everything else → `http://127.0.0.1:8080`
- terminates TLS with your existing cert

The same-origin + same-domain layout is what `PUBLIC_API_URL` and
`VITE_API_BASE=/api` assume. If you split the API onto its own subdomain,
set `VITE_API_BASE=https://api.YOUR-DOMAIN` in `.env` **before building**,
and add the API subdomain to `CORS_ORIGINS` (still points to the SPA).

---

## 5. First deploy

```bash
# Build all three images (postgres pulls, api + web build locally).
docker compose -f docker-compose.prod.yml build

# Bring the stack up in the background. The api container's
# ENTRYPOINT runs `prisma migrate deploy` before serving — no
# separate migration step needed.
docker compose -f docker-compose.prod.yml up -d

# Watch it come up.
docker compose -f docker-compose.prod.yml logs -f api web
```

Expected log lines from `api` on a clean start:

```
Prisma schema loaded from prisma/schema.prisma
2 migrations found in prisma/migrations
No pending migrations to apply.
[Nest] Starting Nest application...
[Nest] Nest application successfully started
```

### Seed the demo data (first deploy only, optional)

For a fresh install you'll want the initial roles + admin user in place.
The full demo seed also drops in a sample dataset:

```bash
docker compose -f docker-compose.prod.yml exec api npx tsx apps/api/prisma/seed.ts
```

**Change the demo passwords immediately** — they all ship as `demo1234`
in the seed (see README for the full list). For a real deployment, edit
`apps/api/prisma/seed.ts` before running, or reset each user's password
through Settings → Users after login.

---

## 6. Post-deploy verification

Run each check from the VPS or a laptop with `curl`:

```bash
# 1. Liveness
curl -sf https://crm.bluefishsolution.com/api/health && echo OK

# 2. Detailed health — DB ping, memory, uptime
curl -s  https://crm.bluefishsolution.com/api/health/detailed | jq .

# 3. Login page loads
curl -sI https://crm.bluefishsolution.com/ | head -3
```

Then in the browser:
- Open `https://crm.bluefishsolution.com/`, sign in with the admin creds
- Go to **Settings → Integrations → Inbox channels** — the four channel
  cards should render as **Not configured** (or **Connected** if you set
  env fallbacks)
- Create a test opportunity in Pipeline
- Open `/m` on a phone → PWA install prompt should appear

---

## 7. Wire the Inbox channels

For each channel in **Settings → Integrations → Inbox channels**, click
**Copy** on the Webhook URL and paste it into the vendor console:

| Channel     | Vendor console                                       | Secret to paste back into Settings          |
|-------------|------------------------------------------------------|---------------------------------------------|
| LINE OA     | LINE Developers Console → Messaging API → Webhook   | Channel Secret + Channel Access Token       |
| Messenger   | Meta for Developers → Messenger → Webhooks          | App Secret + your chosen Verify Token       |
| Website     | Bluefish company site contact-form handler          | Any random 32+ char shared key              |
| Email       | (Postmark / SendGrid Inbound Parse — future)        | Inbound address + signing secret            |

Website form snippet for the marketing site:

```javascript
await fetch('https://crm.bluefishsolution.com/api/webhooks/inbox/website', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-bluefish-form-key': '<the key you saved in Settings>',
  },
  body: JSON.stringify({
    name: formData.name, email: formData.email,
    company: formData.company, subject: formData.subject,
    message: formData.message, phone: formData.phone,
  }),
})
```

---

## 8. Backups

**Nightly `pg_dump` cron on the host** (writes to the `./backups` volume
already mounted into the postgres container):

```bash
# /etc/cron.d/bluefish-backup
0 2 * * * root  docker exec bluefish-crm-postgres-1 \
  sh -c 'pg_dump -U bluefish bluefish_crm | gzip > /backups/crm-$(date +\%F).sql.gz'

# Keep 30 days
5 2 * * * root  find /opt/bluefish-crm/backups -name 'crm-*.sql.gz' -mtime +30 -delete
```

Test the restore path once before you rely on it:

```bash
gunzip -c backups/crm-2026-08-27.sql.gz | \
  docker exec -i bluefish-crm-postgres-1 psql -U bluefish -d bluefish_crm
```

Ship the backups off-box (S3, Backblaze, or `rclone` to Google Drive).

---

## 9. Updating to a new version

Zero-downtime for the SPA; the API blip is ~5 seconds.

```bash
cd /opt/bluefish-crm
git pull

# Rebuild changed images
docker compose -f docker-compose.prod.yml build api web

# Rolling restart. Postgres stays up; api migrates on its own.
docker compose -f docker-compose.prod.yml up -d api web
```

If a migration fails on the new api, the container restart-loops. Check
`docker compose logs api` and either fix the migration or roll back:

```bash
git checkout <previous-good-sha>
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d api
```

---

## 10. Monitoring quick-start

The API exposes Prometheus at `GET /api/metrics` on port 4000 (not
exposed to the internet by Caddy — only reachable inside the Docker
network). Point any Prometheus scraper at `api:4000/api/metrics`.

For a first pass without Prometheus, `/api/health/detailed` is enough:
add a UptimeRobot / Hetzner Cloud Monitoring check pointing at it and
alert on non-200 or `checks.db != ok`.

Application errors go to stderr — pipe container logs to your
aggregator of choice (Loki / Grafana Cloud / Datadog):

```bash
docker compose -f docker-compose.prod.yml logs -f --tail=100 api
```

---

## 11. Common pitfalls

| Symptom                                         | Fix                                                                                   |
|-------------------------------------------------|---------------------------------------------------------------------------------------|
| 502 on `/api/*` after deploy                    | `docker compose logs api` — usually a migration or missing env; fix and `up -d api`   |
| Caddy stuck on ACME challenge                   | Confirm DNS A record matches VPS IP + firewall allows 80 inbound                      |
| `Cannot POST /api/auth/login`                   | `CORS_ORIGINS` doesn't include the SPA origin, or trailing slash mismatch             |
| SPA loads but every call 401s                   | Cookie not being set — verify HTTPS everywhere (cookies are `secure` in prod)         |
| "voice-to-text not supported"                   | You're on Firefox or HTTP. Web Speech requires Chromium/Safari on HTTPS               |
| Web push failing                                | VAPID keys mismatch — regenerate ONE pair and set BOTH env + the frontend rebuild     |
| Inbox channels show "dev fallback" warning      | `INTEGRATION_ENC_KEY` not set — set it, `docker compose restart api`                  |

---

## 12. Rollback

The safe rollback is `git checkout <sha> && docker compose build && up -d`.
Data-level rollback needs a restore from the nightly `pg_dump`. Test the
restore procedure once before you rely on it (§ 8).

Referenced by `docs/GO-LIVE.md` (T-0 launch checklist item) and
`docs/RUNBOOK.md` (deploy procedure).
