# Go-Live Checklist — Bluefish CRM

Every item below is a hard gate. Anything unchecked blocks launch. Owner in parentheses.

## T-14 days: freeze + verification

- [ ] Feature freeze on `main` (Eng lead)
- [ ] Production DB provisioned; access limited to ops + break-glass (Ops)
- [ ] Object storage bucket + CDN wired (Ops)
- [ ] Domain DNS pre-staged; TTL lowered to 60s (Ops)
- [ ] TLS certificate issued and installed (Ops)
- [ ] `NODE_ENV=production` set in the deployment unit (Ops)
- [ ] `CORS_ORIGINS`, JWT secrets, refresh secrets rotated from dev (Ops)
- [ ] Anthropic, LINE, Meta, VAPID secrets set (Ops + Integrations)
- [ ] `npm audit --production` clean in `apps/api` and `apps/web` (Eng)
- [ ] `SECURITY.md` — every pre-go-live checkbox ticked (Security)

## T-7 days: rehearsal

- [ ] Full backup + restore drill run against staging clone; passes (Ops)
- [ ] Load test at 50 users, p95 < 3s, error rate < 1% (Eng)
- [ ] Pen test report received; criticals closed, highs planned (Security)
- [ ] Data migration dry-run on a copy of legacy data; error rate < 0.1% (Eng)
- [ ] UAT sign-off by 5 role-representative users (Product)
- [ ] Runbook walk-through with on-call rotation (Ops)
- [ ] Post-launch monitoring dashboard live in Grafana (Ops)
- [ ] Sentry (or equivalent) integrated; test error reaches the inbox (Eng)

## T-1 day: cutover prep

- [ ] Final production data migration completed (Eng + Data)
- [ ] Migration audit report shared: rows in, rows out, error CSV reviewed (Data)
- [ ] Legacy system frozen to read-only (Ops)
- [ ] All new users onboarded and MFA-enrolled (admin, legal, finance) (People)
- [ ] User quick-start guide + admin guide published to intranet (Product)
- [ ] Support email + phone line staffed with rotation posted (Support)
- [ ] Roll-back plan reviewed and dry-run once (Eng)

## T-0: launch

- [ ] DNS cutover
- [ ] Smoke test suite green (login, create lead, create quote, create contract, e-Sign flow, LINE inbound)
- [ ] Warm the caches by hitting `/dashboards/executive` for each role
- [ ] Announce internally
- [ ] Monitor `/api/metrics` and error dashboard for 2 hours minimum before signing off

## T+1 day

- [ ] Overnight error report reviewed
- [ ] Backup drill re-run (fresh cycle)
- [ ] Support tickets triaged and categorised

## T+7 days

- [ ] Post-launch review with all stakeholders
- [ ] Update runbook with anything learned
- [ ] Retro on the migration itself; write it up

## Rollback triggers

Any one of these is enough to invoke rollback:

- Login broken for > 10 minutes affecting > 20% of users
- Data loss detected (unexpected `DELETE` in `AuditLog`, or missing rows post-migration)
- p95 > 10s for > 15 minutes
- LINE / FB inbound completely broken for > 30 minutes (customer-facing)

Rollback procedure lives in `RUNBOOK.md` → "Deploy procedure".
