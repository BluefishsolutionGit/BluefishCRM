# คู่มือทดสอบการใช้งาน Bluefish CRM (End-to-End)

คู่มือนี้ใช้ทดสอบระบบตั้งแต่ **ยังไม่มีอะไร** จนถึง **ใช้งานได้ทุก feature**
ตั้งแต่ login, CRUD, PWA มือถือ, webhook, e-Sign, monitoring

ใช้เวลาโดยรวม **~30 นาที** สำหรับรอบแรก

---

## Part 0 — Prerequisites (ครั้งแรกครั้งเดียว)

ต้องมีทั้งหมดนี้บนเครื่อง:

- **Node.js 20+** — `node --version` ต้องขึ้น `v20.x` หรือใหม่กว่า
- **Docker + Docker Compose** — `docker ps` ต้องรันได้
- **git** — `git --version`
- **Browser ที่ support PWA** — Chrome / Edge / Safari (สำหรับทดสอบ mobile)
- **จุด: 4000 (API), 5173 (Web), 5439 (Postgres)** ว่างอยู่

ถ้าจะทดสอบ webhook จาก LINE/Facebook จริงต้องมี:
- **ngrok** หรือ **cloudflared** สำหรับ expose localhost ออกอินเทอร์เน็ต

---

## Part 1 — Setup ครั้งแรก (~5 นาที)

### 1.1 Clone / เข้าโฟลเดอร์โปรเจกต์

```bash
cd /home/prompan/BluefishCRM
# ถ้าเพิ่ง clone จาก GitHub:
# git clone https://github.com/prompanc-debug/BluefishCRM.git && cd BluefishCRM
```

### 1.2 ติดตั้ง dependencies

```bash
npm ci
```

รอ ~1–2 นาที (จะติดตั้งของทั้ง `apps/api`, `apps/web`, `packages/shared`)

### 1.3 สร้างไฟล์ `.env` สำหรับ API

```bash
cp apps/api/.env.example apps/api/.env
```

ค่า default ใน `.env.example` ใช้ได้เลยสำหรับการทดสอบบน localhost

ถ้าจะทดสอบ AI จริงให้ใส่ `ANTHROPIC_API_KEY="sk-ant-…"` (ถ้าไม่ใส่ ระบบใช้ deterministic stub)

### 1.4 Start PostgreSQL ผ่าน Docker

```bash
docker compose up -d postgres
```

รอ ~10 วินาที ให้ container healthy — check ด้วย:

```bash
docker ps --filter name=bluefish-postgres --format "{{.Status}}"
# ต้องขึ้น: Up X seconds (healthy)
```

### 1.5 รัน database migration + seed

```bash
cd apps/api
npx prisma migrate deploy
npx prisma db seed
cd ../..
```

Seed จะสร้าง:
- 6 roles (admin, sales_manager, sales_rep, legal, finance, auditor)
- 8 users (ทุกคน password = `demo1234`)
- 12 customers ตัวอย่าง + contacts + activities
- 5 opportunities, quotations, contracts ตัวอย่าง
- Products, contract templates

### 1.6 Build packages/shared

```bash
npm --workspace @bluefish/shared run build
```

---

## Part 2 — เริ่ม Server (~1 นาที)

เปิด **2 terminal windows** พร้อมกัน

### Terminal 1 — API

```bash
cd /home/prompan/BluefishCRM
npm --workspace @bluefish/api run start:dev
```

รอจน log ขึ้น `API listening on http://localhost:4000/api`

### Terminal 2 — Web

```bash
cd /home/prompan/BluefishCRM
npm --workspace @bluefish/web run dev
```

รอจน log ขึ้น `Local: http://localhost:5173/`

### เช็ค health

```bash
curl http://localhost:4000/api/health
# {"status":"ok","uptime":...}

curl http://localhost:4000/api/health/detailed | python3 -m json.tool
# ต้องเห็น checks.db = "ok"
```

---

## Part 3 — Login + Core Walkthrough (~10 นาที)

### 3.1 เปิดเว็บ

เปิด browser ไปที่ `http://localhost:5173`

หน้า Login ควรจะขึ้น

### 3.2 Login ในฐานะ Admin

- Email: `admin@bluefishsolution.com`
- Password: `demo1234`

จะเข้าหน้า Dashboard เห็น KPI cards (Pipeline / MTD / Tasks / etc.)

### 3.3 ทดสอบ CRUD แต่ละ module

ทำตามลำดับนี้ — feature ต่อมาต่อยอดจาก feature ก่อนหน้า:

| # | หน้า        | สิ่งที่ต้องลอง                                                                                        |
|---|-------------|---------------------------------------------------------------------------------------------------------|
| 1 | **Customers**    | คลิก + New customer, กรอกฟอร์ม, save. เปิด customer ที่สร้าง → เพิ่ม contact                          |
| 2 | **Leads**        | + New lead, ใส่ email ซ้ำกับ lead เก่า → ระบบจะเตือน duplicate. Convert lead → opportunity          |
| 3 | **Pipeline**     | ลากการ์ด opportunity ระหว่าง stages. ดู forecast summary ด้านบน                                        |
| 4 | **Activities**   | + New activity type = "meeting", linked to customer + opportunity, scheduledAt = พรุ่งนี้              |
| 5 | **Quotations**   | + New จาก opportunity, เพิ่ม line items 3 รายการ. Submit for approval. ดู status = Pending           |
| 6 | **Products**     | ดู catalog. สร้าง product ใหม่                                                                          |
| 7 | **Contracts**    | + New จาก template. Submit → Approve หลายครั้งจน Signed → Send for e-Signature                        |
| 8 | **Documents**    | Upload PDF ใด ๆ. ดู OCR (พยายาม extract text)                                                          |
| 9 | **AI Workspace** | ลอง generate email draft / meeting summary — ถ้าไม่มี ANTHROPIC key จะเห็น deterministic stub output |
| 10| **Reports**      | เปิด Sales Report. Export → Excel (ต้องเปิดใน Excel ได้). Schedule รายสัปดาห์                          |
| 11| **Dashboard**    | เช็คว่ากิจกรรมที่สร้างเมื่อกี้ appear ในหน้า dashboard                                                 |
| 12| **Settings**     | ลอง users management, permissions, audit log                                                            |

### 3.4 ทดสอบ Approval Workflow

- Login เป็น `krit@bluefishsolution.com` (sales rep, password `demo1234`) → สร้าง quotation discount 25% → submit
- Logout, login เป็น `nattaya@bluefishsolution.com` (sales manager) → เข้า Approval queue → approve
- Logout, login เป็น `finance@bluefishsolution.com` (finance) → approve เพราะ discount > 20% ต้อง finance
- ดู audit log ใน Settings → มี trail ครบทุกขั้น

### 3.5 ทดสอบ MFA (Optional)

Login เป็น admin → Settings → Enable MFA → scan QR ด้วย Google Authenticator → Logout → login ใหม่ ต้องใส่ 6-digit code

---

## Part 4 — Mobile PWA (~5 นาที)

### 4.1 เปิด mobile view บน desktop

Browser → `http://localhost:5173/m`

จะเห็น mobile shell (max-width 480px) พร้อม bottom nav 5 tabs

### 4.2 ทดสอบ features หลัก

- **Home tab**: KPI cards + Today activities + 3 quick actions (Scan card / GPS / Voice)
- **Customers/Leads/Deals/Tasks**: browse ได้
- **Tasks → + New**: สร้าง task ใหม่

### 4.3 ทดสอบ GPS check-in

คลิก **GPS check-in** button — browser จะขอ permission location → allow → ระบบสร้าง activity type "visit" อัตโนมัติ

### 4.4 ทดสอบ Offline draft

1. เปิด DevTools (F12) → Network tab → set to **Offline**
2. คลิก **GPS check-in** อีกครั้ง — ระบบจะ enqueue เป็น draft
3. สังเกต banner ด้านบน "Offline — 1 draft will sync when connected"
4. Set network กลับเป็น **Online**
5. Banner จะ auto-sync draft ที่ค้างไว้

### 4.5 ทดสอบ Install as PWA

Chrome: address bar ด้านขวาจะมีไอคอน install → คลิก → เปิดเป็น app แยก (standalone window)

Safari (iOS): Share → Add to Home Screen

---

## Part 5 — Integrations (~10 นาที)

### 5.1 API Keys + Outbound Webhook

Login เป็น admin → Settings → Integrations → API keys → New key
- Name: `test`, scopes: `customers:read`
- คัดลอก key ที่ขึ้น (`bf_...`) — จะเห็นครั้งเดียว

ทดสอบ:
```bash
curl -H "Authorization: Bearer <API_KEY>" http://localhost:4000/api/customers | python3 -m json.tool | head -20
```

### 5.2 LINE Webhook (แบบทดสอบ)

ไม่ต้องมี LINE OA จริง — fire event สังเคราะห์:

```bash
curl -X POST http://localhost:4000/api/webhooks/inbox/line \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "type": "message",
      "message": {"type": "text", "text": "สนใจโซลูชัน CRM ค่ะ"},
      "source": {"userId": "U_test_'"$(date +%s)"'", "type": "user"},
      "timestamp": '"$(date +%s%3N)"'
    }]
  }'
# {"ok":true,"ingested":1}
```

เปิดหน้า **Inbox** ในเว็บ → thread ใหม่จะขึ้นภายใน 15 วินาที (poll cycle) → คลิกเปิด → พิมพ์ reply → send

### 5.3 e-Signature Flow (Stub)

1. หา contract ที่ status = `Signed` หรือ `Approved` (มีใน seed)
2. หน้า Contracts → เปิด contract → คลิก **Send for signature**
3. กรอก signer email + name → save
4. Copy URL ของ signer link ที่ขึ้น (มี `token=…`)
5. ทดสอบ callback:

```bash
CID=<contract_id>
# ดู envelope ที่สร้าง
JWT=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@bluefishsolution.com","password":"demo1234"}' | \
  python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")

ENV=$(curl -s http://localhost:4000/api/esign/contracts/$CID \
  -H "Authorization: Bearer $JWT" | python3 -c "import json,sys; e=json.load(sys.stdin)[0]; print(e['externalId'], e['signUrl'])")
EXT=$(echo $ENV | awk '{print $1}')
TOKEN_CB=$(echo $ENV | grep -oP 'token=\K[^&]+')

# Simulate signer completing
curl -X POST "http://localhost:4000/api/esign/envelopes/$EXT/callback?token=$TOKEN_CB"
```

Refresh หน้า contract → status = **Active** อัตโนมัติ

### 5.4 M365 Calendar (Dev Stub)

Login → Settings → Integrations → Calendar → Link Microsoft
- Provider: microsoft
- Email: `admin@bluefishsolution.com`
- Access token: `dev_stub_admin`

คลิก **Sync** → ระบบจะสร้าง 2 stub events (ไม่ต้อง OAuth จริง)

---

## Part 6 — Monitoring + Ops (~3 นาที)

### 6.1 เช็ค /metrics

```bash
curl http://localhost:4000/api/metrics | head -30
```

ต้องเห็น counter + histogram Prometheus format

### 6.2 เช็ค x-request-id ทุก response

```bash
curl -I http://localhost:4000/api/health
# มี header: x-request-id: <uuid>
```

### 6.3 ทดสอบ Rate Limit

```bash
for i in $(seq 1 15); do
  curl -s -o /dev/null -w "%{http_code} " \
    -X POST http://localhost:4000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"nope@test.com","password":"nope"}'
done
# 10 ครั้งแรก 400, ที่เหลือ 429 (Too Many Requests)
```

### 6.4 Load Test

หยุด API เดิม แล้ว start ใหม่ด้วย throttler off:

```bash
cd apps/api
THROTTLE_DISABLE=1 npm run start:dev
```

อีก terminal:

```bash
USERS=50 DURATION_SEC=20 node apps/api/scripts/load-test.mjs
```

ต้องขึ้น: `✅ PASS — p95 <300ms, errors 0.00%`

### 6.5 Backup Drill

```bash
DATABASE_URL="postgresql://bluefish:bluefish@localhost:5439/bluefish_crm" \
  ./apps/api/scripts/backup-restore-drill.sh
# ✅ backup + restore drill PASSED
```

---

## Part 7 — Reset / Teardown

### 7.1 Reset ข้อมูล (คงเหลือ schema)

```bash
cd apps/api
npx prisma migrate reset --force
```

`--force` = skip confirmation. Seed จะรันอัตโนมัติหลัง reset

### 7.2 หยุด servers

- Ctrl+C ใน terminal API และ terminal Web
- `docker compose down` เพื่อหยุด Postgres (ข้อมูลยังอยู่ใน volume)
- `docker compose down -v` เพื่อลบ volume ด้วย (ล้างข้อมูลทั้งหมด)

---

## Troubleshooting

### API port 4000 บอก "address in use"

```bash
lsof -ti:4000 | xargs kill -9
```

หรือเปลี่ยน `PORT=4001` ใน `.env` + อัปเดต `CORS_ORIGINS` + Vite proxy

### Postgres connect refused

```bash
docker compose logs postgres | tail -20
docker restart bluefish-postgres
```

### "Prisma Client is out of sync"

```bash
cd apps/api && npx prisma generate
```

### Web ไม่โหลด → เปิด DevTools Console

- ถ้าเห็น CORS error: เช็ค `CORS_ORIGINS` ใน `.env` มี `http://localhost:5173`
- ถ้าเห็น 401: token หมดอายุ → logout แล้ว login ใหม่
- ถ้าเห็น network error: API ยังไม่ up หรือ port ผิด

### PWA ไม่ install บน Safari iOS

- ต้องเปิดผ่าน HTTPS (localhost ก็ใช้ได้บน desktop แต่ iOS Safari ต้อง HTTPS จริง)
- ใช้ ngrok expose: `ngrok http 5173`

---

## Users ที่ Seed ไว้ให้

Password ทุกคน = `demo1234`

| Email                         | Role           | ใช้ทดสอบอะไร                                          |
|------------------------------|----------------|-------------------------------------------------------|
| admin@bluefishsolution.com    | admin          | Full access, users management, integrations, API keys |
| nattaya@bluefishsolution.com  | sales_manager  | Approve quotes, forecast, team activities             |
| krit@bluefishsolution.com     | sales_rep      | Everyday sales work, mobile flows                     |
| ploy@bluefishsolution.com     | sales_rep      | อีก rep                                              |
| somchai@bluefishsolution.com  | sales_rep      | อีก rep                                              |
| legal@bluefishsolution.com    | legal          | Contract approval, obligations                        |
| finance@bluefishsolution.com  | finance        | Finance approval (discount > 20%)                     |
| auditor@bluefishsolution.com  | auditor        | Read-only cross-cutting view                         |

---

## Smoke Test Script (ทดสอบ backend ทั้งระบบใน 30 วินาที)

ถ้าอยาก verify ว่า backend ครบทุก endpoint ทำงาน — ใช้ curl commands ใน `docs/SMOKE.md` (ยังไม่มี, TODO) หรือรัน load test เบา ๆ:

```bash
USERS=5 DURATION_SEC=10 node apps/api/scripts/load-test.mjs
```

ต้อง PASS ทันที ถ้า database + API ตั้งขึ้นถูก
