# Bluefish CRM

CRM system with AI, contract management, mobile companion.

**Monorepo layout:**

```
apps/
  web/           React + Vite + TypeScript frontend
  api/           NestJS + Prisma + PostgreSQL backend
packages/
  shared/        DTOs/enums shared between web and api
requirements/    BRS, UI spec, contract management spec (source of truth)
plan.md          Development plan (8 phases, 28 sprints)
docker-compose.yml   Local Postgres
```

## Quick start

```bash
# 1. Install dependencies (workspace root)
npm install

# 2. Start Postgres
npm run db:up

# 3. Migrate + seed (first time only)
npm run db:migrate
npm run db:seed

# 4. Run both apps
npm run dev
```

- Frontend: http://localhost:5173
- API:      http://localhost:4000/api
- Health:   http://localhost:4000/api/health

**Seed credentials** (all users share the same password):

| Email                            | Role          | Password  |
| -------------------------------- | ------------- | --------- |
| nattaya@bluefishsolution.com     | sales_manager | demo1234  |
| krit@bluefishsolution.com        | sales_rep     | demo1234  |
| ploy@bluefishsolution.com        | sales_rep     | demo1234  |
| somchai@bluefishsolution.com     | sales_rep     | demo1234  |

## Individual commands

```bash
# Frontend only
npm run dev:web

# API only
npm run dev:api

# Build everything
npm run build

# Stop Postgres
npm run db:down
```

## Environments

- `apps/api/.env` — DATABASE_URL, JWT_SECRET, PORT (default 4000)
- Frontend uses `VITE_API_BASE` (defaults to http://localhost:4000/api)

**Optional (Microsoft 365 calendar sync):**

```
MICROSOFT_CLIENT_ID=<Entra app registration client id>
MICROSOFT_CLIENT_SECRET=<...>
MICROSOFT_TENANT_ID=<...>
MICROSOFT_CALENDAR_REDIRECT_URI=http://localhost:4000/api/integrations/calendar/microsoft/callback
MICROSOFT_WEBHOOK_URL=https://<public tunnel or host>/api/integrations/calendar/microsoft/notifications  # optional
```

Without these, the "Connect (dev stub)" button in **Settings → Integrations** still exercises
the full sync flow end-to-end (simulated events + attendees + RSVP + recurrence).

## Feature status

See `plan.md` for the full 28-sprint plan.

- ✅ Phase 0 — Monorepo scaffold, PostgreSQL, NestJS + Prisma, docker-compose
- ✅ Phases 1–8 — Auth/SSO, Sales core, Quotations, Contracts, AI suite, Reports, Mobile, CI/CD
- ✅ Microsoft 365 calendar integration — two-way sync, delta queries, webhooks, recurrence, attendees + RSVP tracking, notifications
- See `docs/USER-GUIDE.md` and `docs/ADMIN-GUIDE.md` for feature-by-feature docs

## Microsoft 365 sync — feature summary

- **Inbound** — Graph delta on `/me/calendarView` runs every 5 minutes (cron) or via webhook when configured
- **Outbound** — activity create / update / delete pushes to the linked Outlook calendar in the owner's timezone
- **Recurrence** — daily / weekly / monthly patterns with end date, weekday picker for weekly; occurrences of your own master are skipped inbound to prevent double-booking
- **Attendees** — captured with name + RSVP response; auto-linked to CRM Contacts by email, or manually linked via the `+ LINK` chip in the activity modal
- **Notifications** — attendee declines (bad tone) and tentative downgrades (warn tone) surface in the bell panel; per-row dismiss + "Mark all read"; read state persists across sessions
- **Force resync** — one-click Resync button per activity if Outlook state drifts
