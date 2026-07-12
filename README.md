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

## Phase status

See `plan.md` for the full 28-sprint plan.

- ✅ Phase 0 — Monorepo scaffold, PostgreSQL, NestJS + Prisma, docker-compose
- 🟡 Phase 1 — Auth + Core Data Model (in progress: login + customer list wired end-to-end; MFA/SSO/full CRUD next)
- ⏳ Phase 2-8 — see plan.md
