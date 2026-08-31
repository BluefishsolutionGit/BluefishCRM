# Bluefish CRM — Production Deploy Guide

Step-by-step for a **Hostinger VPS** (or any Docker-capable host) that already
has other Docker workloads running. Everything below is written so a fresh ops
engineer can follow it top-to-bottom without prior context.

> **Target domain:** `crm.bluefishsolution.tech`
> Other subdomains on this VPS: `xxx1.bluefishsolution.tech`, `xxx2.bluefishsolution.tech`, …
> — port 80/443 is already claimed by whichever reverse proxy fronts those, so the
> CRM must sit **behind** that existing proxy (see § 4). Use
> `docker-compose.behind-proxy.yml` for this layout.
>
> **Recommended stack:** Docker + Docker Compose + a **dedicated Postgres container**
> for the CRM, fronted by your existing reverse proxy. Total footprint ≈ 400 MB RAM,
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
crm.bluefishsolution.tech   A   <vps-public-ipv4>
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
| `CORS_ORIGINS`          | Your public HTTPS URL, e.g. `https://crm.bluefishsolution.tech` |
| `PUBLIC_API_URL`        | `https://crm.bluefishsolution.tech/api` (same origin as SPA)  |

The domain is already `crm.bluefishsolution.tech` in the shipped configs.
If you deploy behind an existing reverse proxy (see § 4 — the default for
this VPS since other subdomains already use it), you can ignore the
`Caddyfile` entirely; it's only used when the CRM stack owns 80/443.

---

## 4. Reverse proxy

Your VPS already hosts `xxx1.bluefishsolution.tech`, `xxx2.bluefishsolution.tech`,
etc. — port 80/443 is already claimed by an existing reverse proxy on the
host. **The CRM has to sit behind that existing proxy**; running a second
one (its own Caddy) would fight for the same ports.

### The layout

```
                 ┌────────────────────────────────────────┐
                 │  Existing reverse proxy on 80/443     │
                 │  (Caddy / Nginx / Traefik / NPM...)   │
                 └──┬───────────────┬─────────────────┬──┘
                    │ xxx1.blue…    │ xxx2.blue…      │ crm.bluefishsolution.tech
                    ▼               ▼                 ▼
        (existing app 1)   (existing app 2)   127.0.0.1:8080  ← web (Nginx SPA)
                                              127.0.0.1:4000  ← api (Nest)
                                                     │
                                                     ▼
                                              postgres (compose network only)
```

### Use the "behind-proxy" compose file

`docker-compose.behind-proxy.yml` omits the CRM's own Caddy and binds
`web` + `api` to `127.0.0.1` on the host — reachable only by the existing
proxy, never from the public internet.

```bash
docker compose -f docker-compose.behind-proxy.yml up -d --build
```

### Add a vhost to your existing proxy

Pick the snippet that matches whatever proxy you already run.

<details>
<summary><b>Caddy</b> — paste into the existing Caddyfile</summary>

```caddy
crm.bluefishsolution.tech {
	encode zstd gzip

	handle_path /api* {
		reverse_proxy 127.0.0.1:4000
	}
	reverse_proxy 127.0.0.1:8080

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options    "nosniff"
		Referrer-Policy           "strict-origin-when-cross-origin"
		Permissions-Policy        "geolocation=(self), microphone=(self), camera=(self)"
		-Server
	}
}
```
Then reload: `docker exec <caddy-container> caddy reload --config /etc/caddy/Caddyfile`
(or `systemctl reload caddy` on bare-metal Caddy).
</details>

<details>
<summary><b>Nginx</b> — new file under <code>/etc/nginx/sites-available/</code></summary>

```nginx
server {
    listen 80;
    server_name crm.bluefishsolution.tech;
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name crm.bluefishsolution.tech;

    # Certbot managed — see § 4.1
    ssl_certificate     /etc/letsencrypt/live/crm.bluefishsolution.tech/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crm.bluefishsolution.tech/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options    "nosniff" always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy        "geolocation=(self), microphone=(self), camera=(self)" always;

    client_max_body_size 25M;      # allow document uploads

    # API — strip the /api prefix before forwarding
    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SPA
    location / {
        proxy_pass http://127.0.0.1:8080/;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Enable and reload:
```bash
sudo ln -s /etc/nginx/sites-available/crm.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
</details>

<details>
<summary><b>Traefik</b> — add labels via a compose override</summary>

Create `docker-compose.traefik.yml` next to the main compose file:

```yaml
services:
  web:
    labels:
      - traefik.enable=true
      - traefik.http.routers.crm-web.rule=Host(`crm.bluefishsolution.tech`)
      - traefik.http.routers.crm-web.entrypoints=websecure
      - traefik.http.routers.crm-web.tls.certresolver=le
      - traefik.http.services.crm-web.loadbalancer.server.port=80
    networks: [ crm, traefik ]

  api:
    labels:
      - traefik.enable=true
      - traefik.http.routers.crm-api.rule=Host(`crm.bluefishsolution.tech`) && PathPrefix(`/api`)
      - traefik.http.routers.crm-api.entrypoints=websecure
      - traefik.http.routers.crm-api.tls.certresolver=le
      - traefik.http.services.crm-api.loadbalancer.server.port=4000
      - traefik.http.routers.crm-api.priority=100
    networks: [ crm, traefik ]

networks:
  traefik:
    external: true             # the network Traefik already uses
  crm:
```
Bring up: `docker compose -f docker-compose.behind-proxy.yml -f docker-compose.traefik.yml up -d`.
Remove the `ports:` from web + api in `docker-compose.behind-proxy.yml` when using Traefik — the traffic flows over the shared Docker network, not the host.
</details>

<details>
<summary><b>Nginx Proxy Manager</b> (GUI) — quick clicks</summary>

1. Hosts → Proxy Hosts → **Add Proxy Host**.
2. Domain: `crm.bluefishsolution.tech`. Forward Hostname/IP: `127.0.0.1`. Port: `8080`.
3. **Custom locations** tab → add `/api` → forward to `127.0.0.1:4000` (same scheme).
4. **SSL** tab → request a new Let's Encrypt cert, force SSL, HSTS on.
5. **Advanced** tab → `client_max_body_size 25M;` (uploads).
</details>

### 4.1 TLS for the CRM subdomain

- **Caddy / Traefik / NPM** — cert issued automatically on first request (they own ACME).
- **Nginx** — run `sudo certbot --nginx -d crm.bluefishsolution.tech` once; certbot writes the
  `ssl_certificate*` paths above and installs a renewal cron.

### 4.3 Concrete layout for the current Bluefish Hostinger VPS

Discovered on the target host (August 2026 snapshot):

- **Reverse proxy:** system Nginx (host service, not in Docker). Config at `/etc/nginx/sites-available/`, symlink into `sites-enabled/`. Reload with `sudo nginx -t && sudo systemctl reload nginx`.
- **Existing Docker containers already claim these host ports:**
  | Container            | Host bind              |
  |----------------------|------------------------|
  | `blue_apm_frontend`  | `127.0.0.1:8080` ← blocks default |
  | `lms_frontend`       | `127.0.0.1:8081`       |
  | shared `postgres`    | internal `5432` on `database-network` |
- **App convention:** apps live under `/opt/apps/<name>/`, user `dev` (in `docker` group). Follow the same pattern → `/opt/apps/bluefish_crm/`.
- **Ports for CRM:** `WEB_HOST_PORT=8082` (8080/8081 taken), `API_HOST_PORT=4000` (free). Set these in `.env` before `docker compose up`.
- **Postgres:** run our own dedicated container (default in the compose file). Shared postgres exists but is coupled to blue_apm; keeping CRM's DB isolated is worth the ~120 MB RAM cost on a 15 GB box.

**Nginx vhost specific to this VPS** — save as `/etc/nginx/sites-available/crm.bluefishsolution.tech.conf`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name crm.bluefishsolution.tech;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name crm.bluefishsolution.tech;

    # Certbot fills these in on first `certbot --nginx -d crm.bluefishsolution.tech`
    ssl_certificate     /etc/letsencrypt/live/crm.bluefishsolution.tech/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crm.bluefishsolution.tech/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options    "nosniff" always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy        "geolocation=(self), microphone=(self), camera=(self)" always;

    client_max_body_size 25M;      # PDFs / images upload

    # API — /api prefix must be kept (Nest mounts under it)
    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;
    }

    # SPA (Nginx-in-container serving the built React bundle)
    location / {
        proxy_pass http://127.0.0.1:8082/;   # WEB_HOST_PORT
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable + issue cert + reload:

```bash
sudo ln -s /etc/nginx/sites-available/crm.bluefishsolution.tech.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# First-time TLS cert (certbot patches the vhost with the real cert paths):
sudo certbot --nginx -d crm.bluefishsolution.tech
```

**Full sequence for this VPS:**

```bash
# 1. Clone into the /opt/apps convention
sudo mkdir -p /opt/apps/bluefish_crm
sudo chown $USER:$USER /opt/apps/bluefish_crm
cd /opt/apps/bluefish_crm
git clone https://github.com/BluefishsolutionGit/BluefishCRM.git .

# 2. Config — remember to set WEB_HOST_PORT=8082 to dodge blue_apm_frontend
cp .env.production.example .env
nano .env
#   Fill: POSTGRES_PASSWORD, JWT_SECRET, REFRESH_TOKEN_SECRET, INTEGRATION_ENC_KEY
#   Change: WEB_HOST_PORT=8082  (leave API_HOST_PORT=4000)
#   Confirm: CORS_ORIGINS=https://crm.bluefishsolution.tech
#            PUBLIC_API_URL=https://crm.bluefishsolution.tech/api

# 3. Build + up
docker compose -f docker-compose.behind-proxy.yml build
docker compose -f docker-compose.behind-proxy.yml up -d
docker compose -f docker-compose.behind-proxy.yml logs -f api web

# 4. Seed (once)
docker compose -f docker-compose.behind-proxy.yml exec api npx tsx apps/api/prisma/seed.ts

# 5. Nginx vhost (see snippet above) + certbot

# 6. Verify
curl -sf https://crm.bluefishsolution.tech/api/health && echo OK
```

### 4.2 Different-origin API (rare)

The default assumes `crm.bluefishsolution.tech` serves both the SPA and `/api/*`.
If you'd rather split the API onto `api-crm.bluefishsolution.tech`:

- Build the SPA with `VITE_API_BASE=https://api-crm.bluefishsolution.tech` (Vite inlines
  this at build time — must be set before `docker compose build`).
- Add `api-crm.bluefishsolution.tech` as a second vhost on your reverse proxy pointing at `127.0.0.1:4000`.
- Set `CORS_ORIGINS=https://crm.bluefishsolution.tech` in `.env` — it stays the SPA origin.

---

## 5. First deploy

Pick the compose file that matches your reverse-proxy layout:

| Situation                                                              | Compose file                            |
|------------------------------------------------------------------------|-----------------------------------------|
| VPS already has a proxy handling other subdomains (your case) ✅       | `docker-compose.behind-proxy.yml`       |
| Fresh VPS, CRM is the only public service                              | `docker-compose.prod.yml` (with Caddy)  |

Replace `<compose-file>` below with the one you picked:

```bash
# Build all three images (postgres pulls, api + web build locally).
docker compose -f <compose-file> build

# Bring the stack up in the background. The api container's
# ENTRYPOINT runs `prisma migrate deploy` before serving — no
# separate migration step needed.
docker compose -f <compose-file> up -d

# Watch it come up.
docker compose -f <compose-file> logs -f api web
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
docker compose -f <compose-file> exec api npx tsx apps/api/prisma/seed.ts
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
curl -sf https://crm.bluefishsolution.tech/api/health && echo OK

# 2. Detailed health — DB ping, memory, uptime
curl -s  https://crm.bluefishsolution.tech/api/health/detailed | jq .

# 3. Login page loads
curl -sI https://crm.bluefishsolution.tech/ | head -3
```

Then in the browser:
- Open `https://crm.bluefishsolution.tech/`, sign in with the admin creds
- Go to **Settings → Integrations → Inbox channels** — the four channel
  cards should render as **Not configured** (or **Connected** if you set
  env fallbacks)
- Create a test opportunity in Pipeline
- Open `/m` on a phone → PWA install prompt should appear

**Also verify from the VPS the internal ports are only reachable locally**
(sanity check — the CRM containers must NOT be exposed publicly):

```bash
# Should succeed on the VPS itself
curl -sf http://127.0.0.1:4000/api/health && echo INTERNAL-OK

# Should FAIL from outside the VPS — otherwise your firewall is too open
curl -sf --max-time 3 http://<vps-public-ip>:4000/api/health && echo BAD || echo GOOD
```

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
await fetch('https://crm.bluefishsolution.tech/api/webhooks/inbox/website', {
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

The container name Docker gives to your Postgres depends on the compose
file you're using; find it with `docker compose -f <compose-file> ps`.
Replace `<pg-container>` below with whatever shows up (typically
`bluefish-crm-postgres-1`).

```bash
# /etc/cron.d/bluefish-backup
0 2 * * * root  docker exec <pg-container> \
  sh -c 'pg_dump -U bluefish bluefish_crm | gzip > /backups/crm-$(date +\%F).sql.gz'

# Keep 30 days
5 2 * * * root  find /opt/bluefish-crm/backups -name 'crm-*.sql.gz' -mtime +30 -delete
```

Test the restore path once before you rely on it:

```bash
gunzip -c backups/crm-2026-08-27.sql.gz | \
  docker exec -i <pg-container> psql -U bluefish -d bluefish_crm
```

Ship the backups off-box (S3, Backblaze, or `rclone` to Google Drive).

---

## 9. Updating to a new version

Zero-downtime for the SPA; the API blip is ~5 seconds.

```bash
cd /opt/bluefish-crm
git pull

# Rebuild changed images (replace <compose-file> with the one you use)
docker compose -f <compose-file> build api web

# Rolling restart. Postgres stays up; api migrates on its own.
docker compose -f <compose-file> up -d api web
```

If a migration fails on the new api, the container restart-loops. Check
`docker compose logs api` and either fix the migration or roll back:

```bash
git checkout <previous-good-sha>
docker compose -f <compose-file> build api
docker compose -f <compose-file> up -d api
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
| `docker compose up` fails with "port 80 in use"  | You picked `docker-compose.prod.yml` but VPS already runs a proxy — switch to `docker-compose.behind-proxy.yml` (see § 4) |
| 502 from the existing proxy toward CRM           | `docker compose ps` — is `api` / `web` up? Then `curl 127.0.0.1:8080` on the VPS. If OK, the vhost paths in the proxy are wrong. |
| `crm.bluefishsolution.tech` doesn't resolve      | DNS A record missing or TTL hasn't propagated — `dig +short crm.bluefishsolution.tech` should return the VPS IP |

---

## 12. Rollback

The safe rollback is `git checkout <sha> && docker compose build && up -d`.
Data-level rollback needs a restore from the nightly `pg_dump`. Test the
restore procedure once before you rely on it (§ 8).

Referenced by `docs/GO-LIVE.md` (T-0 launch checklist item) and
`docs/RUNBOOK.md` (deploy procedure).
