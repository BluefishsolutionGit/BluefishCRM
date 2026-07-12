# Bluefish CRM — Operational Runbook

Purpose: give on-call engineers the fastest possible path from "something's wrong" to "it's fixed" or a documented escalation.

## Contact tree

| Role            | Business hours (SLA 30 min) | After hours (SLA 2 hr) |
|-----------------|-----------------------------|------------------------|
| Tier 1 support  | crm-support@bluefish        | on-call rotation       |
| Tier 2 engineer | dev-team channel            | primary on-call        |
| Escalation      | CTO                         | CTO                    |

## Where to look first

| Symptom                            | Start here                          |
|-----------------------------------|-------------------------------------|
| Users can't log in                 | `/api/health/detailed`, auth logs   |
| Slow responses                     | Grafana → HTTP p95 dashboard        |
| Missing data / stale reports       | `AuditLog` for the entity           |
| LINE / FB messages not arriving    | webhook subscription status, `x-*-signature` errors |
| e-Sign envelope stuck              | `EsignEnvelope` status, callback logs |
| Push notifications not delivering  | `PushSubscription` cleanup, VAPID keys |
| Scheduled report not emailed       | `ReportSchedule.lastRunAt`, mailer logs |

## Endpoints for ops

- `GET /api/health` — liveness (200 if the process is up)
- `GET /api/health/detailed` — DB ping, version, memory, uptime
- `GET /api/metrics` — Prometheus scrape target (port 4000)

## Environment knobs

- `THROTTLE_DEFAULT_LIMIT` (default 1000) — per-IP requests per minute cap
- `THROTTLE_AUTH_LIMIT`    (default 20)   — auth-scope requests per minute cap
- `THROTTLE_DISABLE=1` — turn the throttler off entirely (use for load tests only)
- `CORS_ORIGINS` — comma-separated list of allowed web origins
- `NODE_ENV=production` — enables CSP headers and `secure` cookies

## Playbooks

### The API is returning 5xx

1. Check `/api/health/detailed`. If `checks.db = error`, jump to "DB is down".
2. `journalctl -u bluefish-api -n 500` (or `docker logs bluefish-api`).
3. Grep the request-id from the user report against logs (`x-request-id` header).
4. If a spike is visible in `/api/metrics` (`bluefish_http_errors_total`), roll back the last deploy.

### DB is down / slow

1. `docker ps | grep postgres` — is the container running?
2. `docker exec -it bluefish-postgres psql -U bluefish -d bluefish -c '\l'` — does it respond?
3. Check disk (`df -h`); Postgres refuses writes at ~90% full.
4. If unresponsive: `docker restart bluefish-postgres`. Wait 30s, retest.
5. If still down: restore from the latest dump (see DR-Plan.md).

### A user reports "I can't sign in" but the API is up

1. Check rate limit: `bluefish_http_errors_total{route="/api/auth/login"}` — if 429s, IP is throttled (10/min). Wait 60s.
2. Check `LoginAttempt` audit log for the user's email.
3. If MFA is enrolled and they've lost their device, an admin can call `POST /api/auth/mfa/reset/:userId` (permission `USER_MANAGE`). Log the reason.

### LINE messages aren't arriving in Inbox

1. Check LINE Developers console → Webhook URL is `https://<prod>/api/webhooks/inbox/line` and Verify returns 200.
2. `LINE_CHANNEL_SECRET` must match the console value.
3. Tail API logs for `signature mismatch` — if present, the secret is wrong.
4. Fire a manual test event: `POST /api/webhooks/inbox/line` with a synthetic body and check that a thread appears.

### Push notifications not delivering

1. `PushSubscription` table — is the user's endpoint present?
2. `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` set in the API env?
3. Delete subscriptions with 410 responses (`InvalidRegistration`) — the service already prunes on push failure.

### Scheduled report didn't send

1. `ReportSchedule` — check `isActive`, `lastRunAt`, `lastError`.
2. `ReportSchedulesService` runs via `@nestjs/schedule` cron — check the API process is running (a crashed process misses fires).
3. Manually trigger with `POST /api/report-schedules/:id/run`.

### AI generation is failing

1. `ANTHROPIC_API_KEY` set? If not, the service falls back to deterministic stubs — that's expected in dev.
2. `AiRun` table — inspect the failing run's `error` column.
3. Anthropic API status page: https://status.anthropic.com
4. Rate limit responses show as `429` in `AiRun.error`. Back off and retry.

## Deploy procedure

1. `git pull` on the API host.
2. `npm ci --workspaces` at the repo root.
3. `npm --workspace @bluefish/api run build`.
4. `npm --workspace @bluefish/api run prisma:migrate:deploy` (never `db push` in prod).
5. `systemctl restart bluefish-api` (or `docker compose up -d --build bluefish-api`).
6. Watch `/api/health/detailed` for 60s, then `bluefish_http_errors_total` for 5 min.
7. On the web side: `npm --workspace @bluefish/web run build` → deploy `dist/` to the web host (nginx or Hostinger static).

Rollback: `git checkout <previous-tag>` and repeat steps 2-5. If a migration was applied, run the manual `down.sql` snippet stored in `apps/api/prisma/migrations/<timestamp>_*/rollback.sql` (create this file per migration going forward).

## Log locations

- API: journald (`journalctl -u bluefish-api`) or `docker logs`.
- DB: `docker logs bluefish-postgres`.
- Web static: nginx `access.log` / `error.log`.
- Audit trail: `AuditLog` table (never truncate; archive to cold storage after 2 years if size becomes an issue).
