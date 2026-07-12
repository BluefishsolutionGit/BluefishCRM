# Security Audit — Bluefish CRM

_Last reviewed: 2026-07-12 (Phase 8 hardening)_

Maps the OWASP Top 10 (2021) to what is implemented in this codebase and to gaps that must be closed before go-live.

Legend: ✅ mitigated · ⚠️ partial / known gap · ❌ not addressed

## A01 Broken Access Control ✅

- JWT auth enforced by `JwtAuthGuard` on every non-public controller.
- Role → permission mapping in `apps/api/src/auth/permissions.ts`; `PermissionsGuard` + `@RequirePermissions(...)` at method level.
- Audit log written on every write action (`AuditService.log`).
- Row-level ownership checks: e.g. `LeadsService.findMine` filters by `ownerId`; contract approval steps validate current step permission.

**Gap:** cross-tenant isolation is not required (single-tenant CRM) but per-user data scoping should be re-reviewed once field-level ACL requirements land.

## A02 Cryptographic Failures ✅

- Passwords hashed with `bcryptjs` (10 rounds).
- Refresh tokens stored hashed (SHA256) in DB; the raw token lives only in an `httpOnly`, `sameSite=lax`, `secure` (prod) cookie under path `/api/auth`.
- API keys stored as SHA256 hash with a display prefix (`bf_…`).
- e-Sign callback tokens are 24-byte random and validated on callback.
- MFA secrets stored per-user; TOTP verified against a 30-second window.

**Gap:** at-rest encryption for the DB is the deployment layer's responsibility (LUKS on the VPS or managed disk encryption). Not enforced by application code.

## A03 Injection ✅

- Prisma is used for all DB access — no string-concatenated SQL. Two `queryRaw` calls exist in dashboards and health check; both use tagged templates / parameter binding.
- All request bodies validated with `class-validator` (`ValidationPipe({ whitelist: true, transform: true })`). Unknown fields are stripped.
- Prompt injection into the AI layer is bounded: system prompts are not attacker-controlled, and the `AiRunsService` records the model output as opaque text — no eval/spawn on the result.

## A04 Insecure Design ⚠️

- Rate limits on `/auth/login` and `/auth/login/mfa` (10/min per IP).
- Global rate limit 300/min per IP via `@nestjs/throttler`.

**Gap:** no per-user 2FA enrolment enforcement policy yet (opt-in). Admin roles should be forced to enrol before go-live — add a middleware or an onboarding gate.

## A05 Security Misconfiguration ✅

- `helmet()` applied globally in `main.ts` (CSP off in dev, on in prod).
- CORS origins come from `CORS_ORIGINS` env — configured, not wildcarded.
- Cookies default `secure` in production.
- Prisma migrations checked into `apps/api/prisma/migrations/` — no ad-hoc DDL.
- `.env` files are gitignored; secrets loaded via `@nestjs/config`.

**Gap:** ensure `NODE_ENV=production` is set in the systemd unit / docker env, otherwise CSP and `secure` cookies are silently disabled.

## A06 Vulnerable and Outdated Components ⚠️

- Dependency file: `apps/api/package.json` + `apps/web/package.json`. Both use Nest 10 / React 18 / Prisma 5 as of Phase 8.

**Action item pre-go-live:** run `npm audit --production` and address every High/Critical. Add Dependabot / Renovate to CI.

## A07 Identification and Authentication Failures ✅

- Password minimum 6 chars enforced by DTO; recommend raising to 12 in prod.
- Rate limits on login (see A04).
- MFA available (TOTP) — enrolment flow at `/api/auth/mfa/*`.
- Refresh tokens rotate on each `/auth/refresh` (previous token invalidated).
- Password reset flow uses one-time tokens with expiry.

**Gap:** account lockout after N failed attempts is not implemented; the throttler mitigates but does not permanently lock. Add before go-live if compliance requires.

## A08 Software and Data Integrity Failures ✅

- Refresh tokens and API keys hashed at rest — a DB dump does not compromise usable credentials.
- Webhook subscriptions sign outbound bodies with an HMAC-SHA256 (`x-bluefish-signature`) so recipients can verify authenticity.
- Inbound channel webhooks (LINE, Meta) verify `x-line-signature` / `x-hub-signature-256` when a secret is configured.
- Audit log is append-only from the application layer (no `update`/`delete` code paths).

**Gap:** DB-level immutability on the audit table is not enforced. Consider a PostgreSQL trigger that raises on `UPDATE`/`DELETE` for `AuditLog`.

## A09 Security Logging and Monitoring Failures ✅

- `AuditLog` records action, entity, entityId, before/after JSON, actor, IP, and user agent for every write.
- `/api/metrics` (Prometheus text) exposes request count, error count, latency histogram — scrape-ready.
- `/api/health/detailed` reports DB liveness + version.
- Every response carries `x-request-id` for cross-log correlation.

**Gap:** the audit log is queryable via Prisma; no dedicated UI yet. Read-only role `auditor` has access — Phase 8 should add an audit-log viewer page.

## A10 Server-Side Request Forgery ⚠️

- Outbound webhooks and the e-Sign / M365 integrations do fetch attacker-influenced URLs when an admin registers them.

**Mitigation in place:** URLs must be HTTPS and pass `class-validator @IsUrl` (`require_protocol: true`).

**Gap:** no denylist for RFC1918 / metadata IPs (169.254.169.254). Add a resolver check before dispatching to a webhook URL, or restrict subscription creation to admin role only (currently `USER_MANAGE` permission — already admin-only). Document that admins vet webhook URLs.

---

## Pre-go-live checklist

- [ ] `npm audit --production` clean in both apps.
- [ ] `NODE_ENV=production` set in the deployment environment.
- [ ] `CORS_ORIGINS` set to the production web origin only.
- [ ] JWT `AUTH_JWT_SECRET`, `AUTH_REFRESH_SECRET` rotated from dev defaults.
- [ ] `LINE_CHANNEL_SECRET`, `META_APP_SECRET` set in channel webhook envs.
- [ ] `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` generated for Web Push.
- [ ] MFA enrolment required for all admin + legal + finance roles.
- [ ] DB backup drill green (`scripts/backup-restore-drill.sh`).
- [ ] Load test green (`scripts/load-test.mjs`).
- [ ] Pen test report reviewed and criticals addressed.
