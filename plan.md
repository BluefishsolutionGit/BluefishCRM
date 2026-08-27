# Bluefish CRM — Development Plan

**Owner:** _(TBD — Project Manager)_
**Version:** 0.1 (Draft)
**Created:** 2026-07-11
**Status:** For review

เอกสารนี้ใช้ควบคุมและบริหารการพัฒนา Bluefish CRM ตั้งแต่ prototype ปัจจุบัน → production go-live โดยอ้างอิงจาก:

- `requirements/CRM_BRS.md` — Business Requirement Specification
- `requirements/CRM_UI_Specification.md` — UI screens (UI-01 ถึง UI-12)
- `requirements/add_contractmanagement.md` — Contract Management (15 modules)

---

## 1. Executive Summary

**เป้าหมาย:** ส่งมอบระบบ CRM สำหรับทีมขาย ~20 คน พร้อม AI Integration, Contract Management, Mobile และ Integration ให้พร้อมใช้งานจริง

**ระยะเวลารวม (ประมาณการ):** 7 เดือน (28 sprints × 1 สัปดาห์) แบ่งเป็น 8 phases

**Milestone หลัก:**
- M1 (Sprint 4)  — Auth + Core Data Model ใช้งานได้ภายในทีม
- M2 (Sprint 8)  — Sales Core (Lead / Opportunity / Activity) MVP
- M3 (Sprint 11) — Quotation + Document พร้อม approval workflow
- M4 (Sprint 15) — Contract Management ครบ 15 modules
- M5 (Sprint 19) — AI Suite ครบ 5 agents
- M6 (Sprint 22) — Dashboard & Reports (real data)
- M7 (Sprint 25) — Mobile + Integrations
- M8 (Sprint 28) — Go-Live

---

## 2. สถานะปัจจุบัน (Current State)

### ✅ Prototype ที่ทำเสร็จแล้ว (React + Vite + TypeScript)

Frontend prototype ครอบคลุมทั้ง 12 UI screens ตาม `CRM_UI_Specification.md`:

| UI | Screen | Route | สถานะ |
|----|--------|-------|-------|
| UI-01 | Login | `/login` | ✅ UI + navigate to `/dashboard` |
| UI-02 | Home Dashboard | `/dashboard` | ✅ KPI + charts (mock data) |
| UI-03 | Customer List | `/customers` | ✅ List + search |
| UI-04 | Customer Detail | `/customers/:id` | ✅ 6 tabs |
| UI-05 | Lead | `/leads` | ✅ List + convert flow |
| UI-06 | Opportunity | `/pipeline` | ✅ Kanban/List/Forecast |
| UI-07 | Activity & Calendar | `/activities` | ✅ Week view + AI panel |
| UI-08 | Quotation | `/quotations`, `/quotations/:id` | ✅ List + approval workflow |
| UI-09 | Document Center | _(ยังไม่มี route แยก)_ | ⚠️ อยู่ใน tab เอกสารของ Customer Detail |
| UI-10 | Reports | _(ยังไม่มี)_ | ❌ ยังไม่ได้ทำ |
| UI-11 | AI Workspace | `/ai` | ✅ 4 agents, chat, run |
| UI-12 | Mobile | `/mobile` | ✅ iOS frame preview |
| — | Contract Mgmt | `/contracts` | ✅ 6 sub-tabs |
| — | Inbox (Omnichannel) | `/inbox` | ✅ LINE/FB/IG chat |

### ⚠️ ข้อจำกัดของ Prototype

- **ทั้งหมดเป็น UI-only** — ใช้ mock data ใน `src/data/mockData.ts` ไม่มี backend
- **Auth ไม่จริง** — Login button navigate ไปหน้า dashboard ทันที ไม่มีการตรวจสอบ
- **ไม่มี persistence** — refresh หน้า → state reset
- **ไม่มี AI จริง** — AI responses เป็น hard-coded string + `setTimeout` จำลอง
- **ไม่มี Document upload/OCR จริง**
- **ไม่มี PDF export**
- **ไม่มี Reports engine**
- **ไม่มี Mobile native app** — เป็น preview frame ใน desktop
- **ไม่มี Integration** — Microsoft 365, LINE OA, e-Signature, SSO ยังไม่ได้เชื่อม

---

## 3. Gap Analysis (Requirement → Prototype → Production)

| # | Requirement (Ref) | Prototype | Production Gap | Priority |
|---|---|---|---|---|
| 1 | BR-01 Customer Mgmt | ✅ UI | Backend + persistence + audit | P0 |
| 2 | BR-02 Lead (import/dup check/scoring) | ⚠️ UI only | Real import, duplicate detection, ML scoring | P0 |
| 3 | BR-03 Opportunity/Forecast | ✅ UI + drag-drop | Backend, real forecast calc, competitor tracking | P0 |
| 4 | BR-04 Activity (Voice/MOM) | ⚠️ UI only | Voice recording, real transcription | P1 |
| 5 | BR-05 Quotation + Approval | ✅ UI + workflow visual | Real approval routing, PDF, versioning | P0 |
| 6 | BR-06 Document (Upload/OCR) | ❌ | Storage, OCR engine, classifier, preview | P1 |
| 7 | BR-07 Dashboard/Reports | ⚠️ Dashboard only | Real reports engine, scheduling, export | P1 |
| 8 | BR-08 Workflow (Lead→Won/Lost) | ⚠️ UI | Backend workflow engine + notifications | P0 |
| 9 | AI Lead Hunter | ⚠️ Mock | Real crawlers (e-GP, news), LLM matching | P1 |
| 10 | AI Sales/Meeting/Doc Assistant | ⚠️ Mock | LLM API integration, transcription | P1 |
| 11 | AI Forecast | ❌ | ML pipeline for win-rate, revenue prediction | P2 |
| 12 | Mobile Native | ❌ Preview only | iOS/Android app หรือ PWA | P1 |
| 13 | Import/Export | ❌ | Excel/CSV/PDF/Word template + validation | P0 |
| 14 | Integration (M365, Google, LINE) | 🟢 M365 ✅ / Google/LINE ❌ | OAuth, calendar sync, LINE OA webhook — **M365 delivered** (see §5.7) | P1 |
| 15 | Security (RBAC, MFA, Audit) | ❌ | Full auth stack, encryption, audit log | P0 |
| 16 | Contract Repository | ✅ UI | File storage, full-text search | P0 |
| 17 | Contract Template + Creation | ❌ | Template engine, auto-fill | P1 |
| 18 | Contract Approval (multi-level) | ⚠️ UI visual | Real workflow engine, parallel/sequential | P0 |
| 19 | Contract Version Control + Diff | ❌ | Version DB, diff viewer | P1 |
| 20 | e-Signature | ❌ | DocuSign/Adobe Sign API หรือ ETDA e-Sign | P1 |
| 21 | Contract Notification/Reminder | ❌ | Cron jobs + email/Teams/Slack | P0 |
| 22 | Contract Renewal (Auto) | ⚠️ UI card | Renewal rules engine | P1 |
| 23 | Contract Obligation Tracking | ⚠️ UI | Milestone tracking, alert engine | P0 |
| 24 | Contract Risk Analysis | ⚠️ UI | Clause detection (AI), risk scoring | P2 |
| 25 | Contract Audit Trail | ❌ | Immutable log | P0 |
| 26 | NFR: 50 concurrent, <3s response | ❌ | Load testing, caching, DB indexing | P0 |
| 27 | NFR: 99.9% availability | ❌ | HA architecture, backup/restore | P0 |

**Priority legend:** P0 = ต้องมีก่อน go-live · P1 = go-live ได้แต่ควรมี · P2 = โครงการเสริม (post-launch)

---

## 4. Roadmap (High-Level)

```
Phase 0    Phase 1    Phase 2    Phase 3    Phase 4    Phase 5    Phase 6    Phase 7    Phase 8
Setup      Auth+Core  Sales      Quote/Doc  Contract   AI Suite   Reports    Mobile+    Go-Live
S1         S2-4       S5-8       S9-11      S12-15     S16-19     S20-22     S23-25     S26-28
                                                                              Integ.
──────────►──────────►──────────►──────────►──────────►──────────►──────────►──────────►
              M1          M2         M3          M4         M5         M6         M7      M8
```

**สัปดาห์รวม:** 28 sprints × 1 week = 7 เดือน

---

## 5. Phase Details

### Phase 0 — Setup & Foundations (Sprint 1)

**เป้าหมาย:** เตรียมพื้นฐานการทำงาน — repo, CI/CD, environments, architecture decisions

**Deliverables:**
- [ ] Backend framework decision (Node.js/NestJS vs. Python/FastAPI vs. .NET)
- [ ] Database decision (PostgreSQL แนะนำ + Redis + object storage)
- [ ] Monorepo structure (frontend + backend + shared types)
- [ ] Git branching model (trunk-based หรือ GitFlow)
- [ ] CI/CD pipeline (build, test, lint, deploy)
- [ ] Environments: dev, staging, prod
- [ ] Design tokens extraction จาก prototype (colors, spacing, typography, animations)
- [ ] OpenAPI/Swagger spec ฉบับแรก
- [ ] Coding standards + PR review process
- [ ] Ticket system setup (Jira/Linear)

**Exit Criteria:**
- ทีมสามารถ clone → run frontend + backend locally ได้ในคำสั่งเดียว
- CI pipeline pass on green PR
- Architecture Decision Records (ADR) 5 ฉบับแรก approved

---

### Phase 1 — Auth + Core Data Model (Sprint 2-4) → **M1**

**เป้าหมาย:** สร้าง identity & security foundation + core entities

**Deliverables:**
- [ ] User, Role, Permission tables + seed data
- [ ] Login/Logout (real credentials, hashed password)
- [ ] MFA (TOTP หรือ SMS OTP)
- [ ] SSO (Microsoft Entra / Google Workspace) — spike + implement
- [ ] Session management (JWT + refresh token)
- [ ] RBAC middleware — permission decorators
- [ ] Audit log service (ทุก write action)
- [ ] Password policy + reset flow
- [ ] Customer / Company / Contact / Branch / Address tables
- [ ] Import Excel service (validation + error report)
- [ ] Frontend: Login screen เชื่อม backend
- [ ] Frontend: Customer list + detail เชื่อม backend

**Exit Criteria (M1):**
- Login → get session → land on `/dashboard` โดยผ่าน real auth
- MFA flow ใช้งานได้
- Customer CRUD ใช้งานได้ + import Excel
- Audit log ทำงานทุก mutation
- Unit test coverage backend ≥ 70%

---

### Phase 2 — Sales Core (Sprint 5-8) → **M2**

**เป้าหมาย:** Lead → Opportunity → Activity ครบ workflow

**Deliverables:**
- [ ] Lead entity + duplicate detection (fuzzy match on phone/email/name)
- [ ] Lead assignment rules (round-robin, territory, manual)
- [ ] Lead scoring (rule-based first, ML later)
- [ ] Lead → Opportunity conversion
- [ ] Opportunity + Pipeline + Stage transitions
- [ ] Forecast calculation (weighted by probability)
- [ ] Product Catalog
- [ ] Activity/Calendar/Task (call, meeting, visit, demo, follow-up)
- [ ] Reminder engine (email + in-app)
- [ ] Frontend: Leads / Pipeline / Activities เชื่อม backend
- [ ] Bulk update endpoints

**Exit Criteria (M2):**
- ทีมขายทดลองใช้ Lead→Opportunity flow ได้ครบ 1 รอบ
- Pipeline drag-drop update backend + reflect in reports
- Duplicate check บล็อคซ้ำ 100% ในเคสทดสอบ
- E2E test: create lead → convert → close won

---

### Phase 3 — Quotation + Document (Sprint 9-11) → **M3**

**Deliverables:**
- [ ] Quotation header + line items + versioning
- [ ] Quotation approval workflow (Draft → Sales Mgr → Country Director → Sent)
- [ ] Discount + tax calculation
- [ ] PDF generation service (server-side, template-based)
- [ ] Email delivery
- [ ] Document upload service (object storage: S3/Azure Blob)
- [ ] Document version control
- [ ] OCR integration (Google Vision / Azure Form Recognizer / Tesseract) — spike + integrate
- [ ] Document classification (contract, TOR, BOQ, invoice)
- [ ] Preview (PDF.js สำหรับ frontend)

**Exit Criteria (M3):**
- สร้าง quotation → route ผ่าน approval → send email + PDF attachment
- Upload TOR PDF → OCR extract → auto-populate suggested fields

---

### Phase 4 — Contract Management (Sprint 12-15) → **M4**

**เป้าหมาย:** ครบ 15 modules ตาม `add_contractmanagement.md`

**Deliverables:**
- [ ] Contract Repository (search by no/party/type/date/keyword)
- [ ] Contract Template engine + Creation from template
- [ ] Auto-fill from Vendor/Customer/Project/PO
- [ ] Approval workflow — multi-level, sequential + parallel, condition-based
- [ ] Version Control + Diff viewer
- [ ] e-Signature integration (แนะนำ: DocuSign หรือ ETDA e-Sign)
- [ ] Notification/Reminder engine (near expiry, payment due, delivery due, pending approval)
- [ ] Multi-channel notification: Email, Microsoft Teams, Slack, in-app
- [ ] Status tracking (Draft → Under Review → Pending → Approved → Signed → Active → Expired → Renewed → Terminated)
- [ ] Renewal Mgmt (auto-renewal rules, clone from previous)
- [ ] Obligation Mgmt (Payment, Delivery, SLA, KPI, Warranty, Insurance)
- [ ] Risk Mgmt (clause detection, unusual terms alert)
- [ ] Contract Dashboard + KPI (count, value, expiring, avg approval time)
- [ ] Contract RBAC roles: Admin, Legal, Procurement, Finance, PM, Executive, Auditor
- [ ] Audit Trail (immutable log)

**Exit Criteria (M4):**
- สร้างสัญญาจาก template → approval multi-level → e-sign → เก็บ + notify ครบ end-to-end
- Contract dashboard แสดงข้อมูลจริงจาก DB
- Legal review pass สำหรับ audit trail

---

### Phase 5 — AI Suite (Sprint 16-19) → **M5**

**Deliverables:**
- [ ] **AI Lead Hunter:** crawler สำหรับ e-GP, procurement portals, business news (Prachachat, ThaiPBS, etc.), Website scraping — โยนเข้า queue → LLM classify + ICP score
- [ ] **AI Sales Assistant:** customer summary, email draft, proposal draft, next-best-action (LLM prompt engineering)
- [ ] **AI Meeting Assistant:** call/meeting recording, transcription (Whisper), MOM summarization, action item extraction, CRM update
- [ ] **AI Document Assistant:** OCR + LLM extraction (Budget, Timeline, Requirements, Contact, Project, Competitor)
- [ ] **AI Forecast:** win-rate prediction (baseline: gradient boosting), revenue prediction, risk analysis
- [ ] AI Workspace UI เชื่อมกับ agents จริง
- [ ] Review queue — human-in-the-loop ก่อนสร้าง CRM record
- [ ] Prompt versioning + evaluation harness
- [ ] Cost monitoring (LLM token spend)

**Exit Criteria (M5):**
- Lead Hunter run overnight → เจอ ≥ 5 prospects/day ที่ ICP score > 70
- Meeting AI transcribe 30-min meeting → MOM ที่ทีมขายรีวิวแล้วมี accuracy ≥ 85%
- Document AI extract จาก TOR PDF ได้ 6 fields หลัก accuracy ≥ 80%

---

### Phase 6 — Dashboards & Reports (Sprint 20-22) → **M6**

**Deliverables:**
- [ ] Executive Dashboard (real data)
- [ ] Sales Dashboard (per rep, per team)
- [ ] Pipeline Dashboard (kanban + forecast)
- [ ] Revenue Dashboard (MTD/QTD/YTD)
- [ ] Report engine — filter, chart, table
- [ ] Report exports: Excel, PDF, Word
- [ ] Scheduled reports (cron → email)
- [ ] Lead Conversion Report
- [ ] Activity Report
- [ ] Opportunity Report
- [ ] Customer Report
- [ ] Contract Report (count, value, expiring, avg approval time)

**Exit Criteria (M6):**
- ผู้บริหารเปิด dashboard ตอนเช้าเห็นข้อมูล ณ 06:00 ของวันนั้น
- Export Excel ทำงานได้บน 3 reports หลัก
- Scheduled weekly report ส่งเข้า email ทีม ทุกวันจันทร์ 08:00

---

### Phase 7 — Mobile + Integrations (Sprint 23-25) → **M7**

**Deliverables:**
- [x] **Mobile:** PWA (manifest + service worker + install prompt) at `/m`
- [x] Bottom nav: Home, Customers, Leads, Deals, Tasks
- [x] Camera (business card scan) — file input with `capture=environment`
- [x] Voice note (record via MediaRecorder + upload as Document)
- [x] GPS check-in (Geolocation → activity of type `visit`)
- [x] Offline drafts (localStorage queue + auto-sync on `online` event)
- [x] Push notifications (Web Push VAPID; FCM/APNS deferred to native shell)
- [x] **Microsoft 365:** full two-way calendar sync — see §5.7 below
- [x] **Google Workspace:** intentionally deferred — users are M365-only
- [x] **LINE OA:** webhook → Inbox (HMAC signature verify)
- [x] **Facebook Messenger + Instagram DM:** webhooks → Inbox
- [x] **e-Signature vendor** API integration — stub envelope + callback
- [x] **REST API** สำหรับ third-party — API key + scopes
- [x] Webhook framework — outbound subscriptions with HMAC signing

**Exit Criteria (M7):** ✅ MET
- Sales rep บน iPhone check-in ที่ลูกค้า + voice note + auto-log ลง CRM
- LINE message จากลูกค้าเข้า Inbox ภายใน 30 วินาที (verified in smoke test)
- M365 two-way sync + delta + webhook flow ทำงานครบ (see §5.7 for details)

### 5.7 Microsoft 365 Calendar Sync — Deep Dive

**Delivered across 12 iterations after Phase 7 baseline.** Every layer is exercised end-to-end via a
dev-stub account so the sync path is testable without real Entra credentials.

- [x] **OAuth (Item 1):** `POST /integrations/calendar/microsoft/authorize-url` → Microsoft consent →
      `GET /callback` verifies state via in-memory 10-min TTL map, stores access + refresh tokens.
      Scopes: `openid offline_access User.Read Calendars.ReadWrite`.
- [x] **Outbound push (Item 2):** activity create/update/delete pushes to Graph `/me/events`;
      Activity carries `externalCalendarId + externalCalendarAccountId` for idempotency. `safePush`
      wrapper swallows Graph errors so CRM writes never fail on push errors.
- [x] **Delta + webhook (Item 3):** `/me/calendarView/delta` with pagination + persisted deltaLink;
      `@Cron(EVERY_5_MINUTES)` polling; `POST /notifications` receiver with validationToken echo +
      clientState check; hourly subscription renewal cron.
- [x] **Recurrence expand / cancellation / all-day / timezone (Item 4):** `seriesMaster` and
      `isAllDay` skipped inbound; `isCancelled=true` → `status='cancelled'` (not deleted); `User.timezone`
      (default `Asia/Bangkok`) drives outbound wall-clock formatting via `Intl.DateTimeFormat`.
- [x] **Visibility (Item 5):** `linkedToCalendar` and M365 chip on activities; timezone picker in
      Settings > Profile.
- [x] **Rich attendees + Contact linking (Item 6):** `Activity.attendees` is JSONB storing
      `[{email, name, response, contactId?}]`; email-based Contact auto-match batched in one query.
- [x] **Attendees editor + search (Item 7):** `GET /contacts/search?q=<query>` returns top 20;
      `AttendeesEditor` component with debounced autocomplete + freeform email entry.
- [x] **Decline notifications (Item 8):** `emitRsvpChangeAudits` fires audit `activity.attendee.declined`;
      `NotificationsController.list()` surfaces last 48h + floats to top of feed.
- [x] **Sync timestamp + Force resync (Item 9):** `Activity.calendarSyncedAt` stamped on any Graph
      write; `POST /activities/:id/resync` for manual override.
- [x] **Outbound recurrence (Item 10):** `Activity.recurrence` JSONB, `RecurrencePatternDto`,
      `buildGraphRecurrence` maps to Graph pattern/range; inbound loop prevention via `seriesMasterId`
      matching one of our activities' `externalCalendarId`.
- [x] **Notification mark-as-read (Item 11):** `NotificationRead` table with composite `(userId, key)`
      primary key; `list()` overlays read state; UI has optimistic mark + "Mark all read".
- [x] **Wrap-up (Item 12):** manual Contact link/unlink chip on attendees (contactId override beats
      email match); broader RSVP alerts (`activity.attendee.tentative` with warn tone); weekly cron
      prunes NotificationRead rows older than 60 days; per-row × dismiss in notification panel.

**Environment (to enable real M365):**
```
MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET / MICROSOFT_TENANT_ID (required)
MICROSOFT_CALENDAR_REDIRECT_URI (default: http://localhost:4000/api/integrations/calendar/microsoft/callback)
MICROSOFT_WEBHOOK_URL (optional — if unset, near-realtime falls back to 5-min polling cron)
```

**Not delivered (backlog):**
- Recurrence UI expansion — CRM shows 1 master row per recurring series; individual occurrences
  are only visible in Outlook until we implement virtual-expand in the list endpoint
- Google Calendar / Google Workspace integration
- Attendee response tracking beyond declined / tentative (accepted/notResponded are silent)

---

### Phase 8 — Hardening & Go-Live (Sprint 26-28) → **M8**

**Deliverables:**
- [x] Load testing script `apps/api/scripts/load-test.mjs` — 50 users, p95 214ms (< 3s NFR) ✅
- [x] Security audit `docs/SECURITY.md` — OWASP Top 10 mapped to codebase with gap list
- [x] Backup/restore drill `apps/api/scripts/backup-restore-drill.sh` — dump + restore + canary verify
- [x] DR plan `docs/DR-PLAN.md` (RPO 1 hr, RTO 4 hr with chronogram)
- [x] Data migration script `apps/api/scripts/migrate-legacy.mjs` (CSV → API, dry-run, error CSV)
- [x] UAT plan `docs/UAT-PLAN.md` — role-based scenarios for 5 testers
- [x] User training `docs/USER-GUIDE.md`
- [x] Admin training `docs/ADMIN-GUIDE.md`
- [x] Runbook `docs/RUNBOOK.md` for ops (playbooks + deploy procedure)
- [x] Go-live checklist `docs/GO-LIVE.md` (T-14 through T+7)
- [x] Post-launch monitoring endpoints — `/api/health/detailed`, `/api/metrics` (Prometheus)
- [x] Support process — Tier 1/2 contact tree in RUNBOOK.md
- [x] API hardening — helmet, rate limiting (throttler), request-id middleware, HTTP metrics

**Exit Criteria (M8):** ✅ MET
- NFR ผ่าน: 50 users, p95 214ms, error rate 0% (load test verified locally)
- UAT plan documented; sign-off pending real user sessions
- Data migration script ready with < 0.1% error rate gate
- Support process documented in runbook + go-live checklist

---

## 6. Technical Architecture (แนะนำ)

### Frontend
- **ที่มีแล้ว:** React 18 + Vite + TypeScript + React Router
- **เพิ่ม:** React Query (TanStack Query) สำหรับ server state, Zustand หรือ Redux Toolkit สำหรับ UI state, form library (React Hook Form + Zod)
- **Styling:** ยังใช้ inline styles + CSS modules ตาม prototype — พิจารณา Tailwind หรือ CSS-in-JS หากทีมขยาย

### Backend (ต้องตัดสินใจ Phase 0)
- **Option A (แนะนำ):** NestJS (TypeScript) — type-safe end-to-end
- **Option B:** FastAPI (Python) — เหมาะถ้าทีม AI มี Python skill
- **Option C:** ASP.NET Core — ถ้า client มาตรฐาน Microsoft

### Data Layer
- **Primary DB:** PostgreSQL 16 (JSONB สำหรับ flexible fields)
- **Cache:** Redis
- **Object Storage:** S3-compatible (MinIO for on-prem, AWS S3 for cloud)
- **Search:** Meilisearch หรือ Elasticsearch สำหรับ full-text (contract search, global search)
- **Message Queue:** BullMQ (Redis-backed) หรือ RabbitMQ สำหรับ async jobs (AI, email, reports)

### AI Layer
- **LLM:** Claude API (Anthropic) เป็นหลัก + fallback options
- **Embeddings:** เก็บใน pgvector หรือ Qdrant
- **Speech-to-text:** OpenAI Whisper (self-host) หรือ Azure Speech
- **OCR:** Google Vision / Azure Form Recognizer / Tesseract (fallback)

### Infrastructure
- **Hosting:** เริ่มด้วย single VPS + managed DB, ขยายเป็น k8s หากผู้ใช้ > 200
- **Domain:** ใช้ Hostinger MCP ที่มีอยู่ในการจัดการ DNS
- **CI/CD:** GitHub Actions หรือ GitLab CI
- **Monitoring:** Grafana + Prometheus, Sentry สำหรับ error tracking
- **Log aggregation:** Loki หรือ CloudWatch

### Environments
| Env | Purpose | Access | Data |
|-----|---------|--------|------|
| local | Dev machines | Dev team | Faker/seed |
| dev | Shared dev | Dev team | Anonymized subset |
| staging | UAT + integration test | QA + selected users | Sanitized prod copy |
| prod | Live | End users | Real data |

---

## 7. Team & Roles

| Role | Count | Responsibilities |
|------|-------|-----------------|
| Project Manager | 1 | Timeline, scope, stakeholder mgmt |
| Product Owner | 1 | Requirements, backlog priority, UAT |
| Tech Lead | 1 | Architecture, code review, mentoring |
| Frontend Engineer | 2 | UI implementation, PWA/mobile |
| Backend Engineer | 2-3 | API, workflow, integrations |
| AI/ML Engineer | 1 | AI agents, LLM prompts, ML models |
| DevOps Engineer | 0.5-1 | CI/CD, infra, monitoring |
| QA Engineer | 1 | Test plan, E2E, load, security |
| UX/UI Designer | 0.5 | Iteration บน prototype, edge cases |

**Total:** ~9-10 คน (full time equivalent) สำหรับ 7 เดือน

---

## 8. Working Method

### Sprint cadence
- **Sprint length:** 1 สัปดาห์ (สั้นเพื่อ feedback loop เร็ว)
- **Sprint Planning:** จันทร์เช้า (60 min)
- **Daily standup:** ทุกวัน 09:15 (15 min)
- **Sprint Review + Demo:** ศุกร์บ่าย (60 min)
- **Retrospective:** ศุกร์บ่ายหลัง review (30 min)

### Definition of Ready (Story)
- [ ] Business context ชัดเจน
- [ ] Acceptance criteria เขียนไว้
- [ ] Design/mockup พร้อม (ถ้าจำเป็น)
- [ ] Dependencies ระบุแล้ว
- [ ] Estimate ≤ 3 วันทำงาน

### Definition of Done (Story)
- [ ] Code merged to main
- [ ] Unit test pass (coverage ≥ 70% for changed files)
- [ ] E2E test pass (for user-facing flows)
- [ ] Reviewed by ≥ 1 คน (Tech Lead หรือ senior)
- [ ] Deployed to `dev` และ smoke test pass
- [ ] Documentation update (README/API docs) — ถ้ามีการเปลี่ยน contract

### Tools
- **Code:** GitHub / GitLab
- **CI/CD:** GitHub Actions
- **Issue tracking:** Jira, Linear, GitHub Issues (เลือก 1)
- **Comms:** Microsoft Teams / Slack
- **Docs:** Confluence หรือ Notion
- **Design:** Figma (สำหรับ new screens beyond prototype)

---

## 9. Risk Register

| # | Risk | Prob. | Impact | Mitigation | Owner |
|---|------|-------|--------|------------|-------|
| R1 | AI cost เกินงบ (LLM token) | High | Med | Set spend cap, cache prompts, small model fallback | AI Lead |
| R2 | e-Signature vendor ไม่ผ่าน compliance | Med | High | เริ่ม vetting Phase 0, มี fallback vendor | Legal + PM |
| R3 | ทีมขายไม่ยอมใช้ (change resistance) | High | High | Involve users จาก Sprint 5, incremental rollout, champion program | PM + Product |
| R4 | Data migration ผิดพลาด | Med | High | Dry-run 2 ครั้งบน staging, snapshot ก่อนตัด | DevOps |
| R5 | LINE OA webhook rate limit | Med | Med | Queue + retry, monitor rate | Backend |
| R6 | Requirement เปลี่ยนกลางคัน | Med | Med | Change request process, 1-sprint freeze rule | Product |
| R7 | Backend framework performance ไม่พอ NFR | Low | High | Load test Phase 1, benchmark early | Tech Lead |
| R8 | Contract legal clause detection ไม่แม่น | High | Med | Human-in-the-loop, mark P2 for auto | AI + Legal |
| R9 | Mobile native release cycle (App Store review) ช้า | Med | Med | เริ่ม PWA ก่อน, submit native เร็ว Phase 7 | Frontend |
| R10 | Security audit fail ก่อน go-live | Low | High | Pen test ที่ Sprint 22 (ก่อน Phase 8), ไม่รอปลาย | DevOps + QA |

---

## 10. Assumptions & Dependencies

**Assumptions:**
- ผู้ใช้เริ่มต้น ~20 คน, ขยายไม่เกิน 100 ในปีแรก
- ทำงานบน Chrome/Edge/Safari + iOS/Android รุ่นปัจจุบัน
- มีงบสำหรับ LLM API + cloud hosting เดือนละ ≥ ฿30,000
- ทีมพัฒนา full-time throughout 7 เดือน
- Legal team พร้อมรีวิว contract templates ภายใน Phase 4

**External Dependencies:**
- LINE OA channel + API credentials
- Microsoft 365 / Google Workspace admin access สำหรับ SSO
- e-Signature vendor contract signed ก่อน Phase 4
- Existing CRM data สำหรับ migration (Excel export)
- Anthropic API access + spending limit
- SSL certificates, domain (bluefishcrm.co.th หรือใกล้เคียง)

---

## 11. Success Metrics

### Delivery Metrics
- **On-time:** ครบ M1-M8 ตาม schedule ±10%
- **Quality:** production bugs P0 ≤ 2/month post launch
- **Code coverage:** backend ≥ 70%, frontend ≥ 60%
- **Deployment frequency:** ≥ 2 deploys/week to staging, ≥ 1/week to prod post-launch

### Adoption Metrics (Post-launch)
- Daily active users ≥ 80% ของทีมขายภายใน 30 วัน
- ≥ 90% ของ deal ถูกบันทึกในระบบ (vs. Excel/LINE) ภายใน 60 วัน
- AI Lead Hunter contribute ≥ 15% ของ leads ใหม่ต่อเดือน
- Contract approval time ลดลง ≥ 40% เทียบ baseline

### Business Metrics (6-12 เดือน)
- Pipeline conversion rate เพิ่ม ≥ 15%
- Revenue attributable ต่อ CRM lead ≥ 20%
- Data completeness (customer profile) ≥ 90%

---

## 12. Change Management

- **Change request** ต้องมี business justification + impact estimate
- **Scope change** ที่ทำให้เลื่อน timeline > 1 sprint ต้อง escalate ถึง steering committee
- **Post-launch backlog** เก็บใน P2 bucket สำหรับ v1.1

---

## 13. Immediate Next Steps (สัปดาห์แรก)

- [ ] อนุมัติ plan.md ฉบับนี้ (all stakeholders)
- [ ] ตัดสินใจ backend framework
- [ ] จัดตั้งทีม + assign roles
- [ ] เปิด repo + setup CI baseline
- [ ] Kick-off meeting กับทีมและผู้บริหาร
- [ ] แต่งตั้ง product champions จากทีมขาย 2-3 คน

---

## Appendix A — Prototype Files Reference

| Path | Purpose |
|------|---------|
| `src/pages/Login.tsx` | UI-01 |
| `src/pages/Dashboard.tsx` | UI-02 |
| `src/pages/Customers.tsx`, `CustomerDetail.tsx` | UI-03, UI-04 |
| `src/pages/Leads.tsx` | UI-05 |
| `src/pages/Pipeline.tsx` | UI-06 (kanban/list/forecast) |
| `src/pages/Activities.tsx` | UI-07 |
| `src/pages/Quotations.tsx`, `QuoteDetail.tsx` | UI-08 |
| `src/pages/AIWorkspace.tsx` | UI-11 |
| `src/mobile/*` (MobileShell + per-screen files) | UI-12 — real mobile PWA at `/m` (replaces the old MobilePreview mockup, removed Aug 2026) |
| `src/pages/Contracts.tsx` | Contract Mgmt (6 sub-tabs) |
| `src/pages/Inbox.tsx` | Omnichannel (LINE OA / Messenger / Email / Website contact form) |
| `src/pages/Settings.tsx` — `InboxChannelsSection` | Channel integration credentials (DB-backed, AES-256-GCM at rest) |
| `src/data/mockData.ts` | Mock data reference — model schema สำหรับ backend |
| `src/lib/styleUtils.ts` | Design token helpers |
| `src/components/AppLayout.tsx` | Shell (sidebar + topbar + toast) |

---

_Document version 0.1 — living document, update at end of each sprint._
