# Bluefish CRM — Admin Guide

For people with the `admin` role or anyone managing users, integrations, and system settings.

## Users and roles

Roles ship as: `admin`, `sales_manager`, `sales_rep`, `legal`, `finance`, `auditor`. Each has a fixed permission set — see `apps/api/src/auth/permissions.ts` for the source of truth.

### Add a user
Settings → Users → **New user**. Set email (must match the M365 account if SSO is on), name, and role. On save, the user receives a welcome email with a first-time login link.

### Change a role
Open the user, change the role, save. The audit log records who changed what.

### Reset MFA
When a user loses their phone: open the user, click **Reset MFA**, log the reason. They'll be prompted to re-enrol on next login.

### Deactivate a user
Set them to `inactive`. They can no longer log in but their history stays — do not delete users you have activity for.

## Channels and integrations

### LINE OA
1. LINE Developers Console → your channel → **Messaging API**.
2. Set the webhook URL to `https://<prod>/api/webhooks/inbox/line`.
3. Copy the **Channel secret** into the API env as `LINE_CHANNEL_SECRET`, restart the API.
4. Enable "Use webhook".
5. Send a test message — it should appear in Inbox within 30 seconds.

### Facebook Messenger + Instagram DM
1. Meta for Developers → your app → Messenger → **Webhooks**.
2. Callback URL: `https://<prod>/api/webhooks/inbox/facebook` (or `/instagram`).
3. Verify token: value of `FB_VERIFY_TOKEN` env (default `bluefish-fb-verify`).
4. Copy the app secret into `META_APP_SECRET`, restart.
5. Subscribe your page/account to `messages` and `messaging_postbacks`.

### Microsoft 365 calendar

**Server-side setup** (one-time, requires Entra app registration):

1. Entra admin center → App registrations → **New registration**. Redirect URI:
   `https://<prod>/api/integrations/calendar/microsoft/callback` (type: Web).
2. API permissions → Add `Microsoft Graph` delegated: `openid`, `offline_access`, `User.Read`,
   `Calendars.ReadWrite`. Grant admin consent.
3. Certificates & secrets → **New client secret**. Copy the value.
4. Set in `apps/api/.env`:
   ```
   MICROSOFT_CLIENT_ID=<app id>
   MICROSOFT_CLIENT_SECRET=<...>
   MICROSOFT_TENANT_ID=<tenant id or 'common'>
   MICROSOFT_CALENDAR_REDIRECT_URI=https://<prod>/api/integrations/calendar/microsoft/callback
   ```
5. Restart the API. `GET /api/integrations/calendar/microsoft/status` should return
   `{configured: true}`.

**Users self-link** at Settings → Integrations → **Connect Microsoft 365**. Consent screen
prompts for calendar read+write. On return, the account appears with a "Synced" timestamp.

**How the sync works:**
- **Inbound** — delta query on `/me/calendarView` (last 7 days → next 60). Runs every 5 minutes
  per account via `CalendarSyncCron.pollAll()`; also on-demand via the "Sync now" button.
- **Outbound** — activity create/update/delete pushes to Graph immediately (`safePush` swallows
  Graph errors so CRM writes are never blocked). Timezone from `User.timezone`.
- **Webhook (optional, near-realtime):** set `MICROSOFT_WEBHOOK_URL=https://<public>/api/integrations/calendar/microsoft/notifications`.
  Subscription is created automatically on OAuth callback and renewed hourly (Graph caps event
  subscriptions at ~3 days). Without a public URL, the 5-min polling cron is the fallback.
- **Loop prevention** — imported events store `externalCalendarId + externalCalendarAccountId`;
  outbound push checks `externalCalendarId` before firing. Series masters we own suppress their
  own expanded occurrences via `seriesMasterId` match.
- **Attendee → Contact linking** — inbound emails are auto-matched to CRM Contacts in a single
  query per list request. Users can manually override via the `+ LINK` chip in the attendee
  chip; the override stores `contactId` on the attendee JSON and always wins over email match.

**Dev / preview mode (no real M365):** click **Connect (dev stub)** in Settings → Integrations.
This inserts a fake account whose sync cycles simulate the full lifecycle — imports, updates,
removals, cancellation, recurring occurrences, RSVP transitions — so the UI can be exercised
without a live Entra app.

**Cron jobs (`@nestjs/schedule`):**
- `CalendarSyncCron.pollAll` — every 5 minutes; skips accounts synced in the last 4 minutes
- `CalendarSyncCron.renewSubscriptions` — hourly; renews any Graph subscription within 12h of expiry
- `NotificationsCron.pruneStaleReadReceipts` — weekly; deletes `NotificationRead` rows older than 60 days

### e-Signature
Ships with a **stub** provider that generates envelope URLs on-domain. Swap to a real vendor by implementing the interface in `apps/api/src/integrations/esign.service.ts` and setting `ESIGN_PROVIDER=<vendor>`.

## Outbound API and webhooks

### Issue an API key
Settings → API keys → **New key**. Pick scopes (e.g. `customers:read`, `leads:write`). The key is shown **once**; store it in your secrets manager. It's identifiable by the `bf_` prefix.

Revoke immediately if leaked — the row stays for audit but the hash is nulled.

### Outbound webhooks
Settings → Webhooks → **New subscription**. Provide an HTTPS URL and pick events (`lead.created`, `opportunity.stage_change`, etc.). Every payload is signed with HMAC-SHA256; the receiver verifies with the shared secret (shown once on creation).

## Reports

### Create a scheduled report
Reports → open any report → **Schedule**. Pick recipients, cadence (weekly / monthly), format (PDF / XLSX). Delivered by email at the schedule time.

### Manually re-run a schedule
Reports → Schedules → click a row → **Run now**. Useful if a delivery failed.

## Settings

### System settings
Company info, default currency, VAT rate, quotation number format, approval workflow thresholds — under Settings → System. Changes propagate immediately.

### Audit log
Auditors and admins can query the `AuditLog` table via Prisma or via the audit view under Settings → Audit trail. Every write in the system is here.

## Backups

Backups run automatically per the DR-Plan. Verify success in Grafana → **Backup status** dashboard. If a run fails, `#crm-incidents` gets notified.

Manually trigger a drill: `apps/api/scripts/backup-restore-drill.sh` on the API host. Exit 0 = pass.

## Health and monitoring

- `/api/health` — up/down
- `/api/health/detailed` — DB check, memory, version
- `/api/metrics` — Prometheus scrape target

Grafana dashboards to bookmark:
- **HTTP**: p50/p95/p99 latency, error rate, top-N slow endpoints
- **DB**: connection count, slow queries
- **Business**: pipeline value, deals closed today, LINE messages received

## Emergency contacts

- On-call rotation: PagerDuty schedule `crm-primary`.
- Escalation: CTO.
- Vendor escalations: LINE partner support, Meta developer support, e-Sign vendor account manager.

## Common tasks

| I need to…                         | Where                                        |
|-----------------------------------|----------------------------------------------|
| Add a user                         | Settings → Users → New user                  |
| Change a permission                | `apps/api/src/auth/permissions.ts` (dev), then deploy |
| See who deleted a record           | Settings → Audit trail, filter by entity id  |
| Roll back a deploy                 | RUNBOOK.md → Deploy procedure                |
| Trigger a re-index / cache warm    | `curl /api/dashboards/executive` as each role|
| Rotate JWT secret                  | Update env, restart API — all users re-login |
