# Customer Voice (การรับฟังเสียงลูกค้า)

Customer Voice คือส่วนหนึ่งของ CRM ที่ใช้ **จัดเก็บ ค้นหา และวิเคราะห์ข้อคิดเห็น** ของลูกค้าอย่างเป็นระบบ ทั้งคำชม ข้อร้องเรียน ข้อเสนอแนะ และคะแนนความพึงพอใจ (NPS/CSAT) เพื่อให้ทีม Sales / Manager / Executive เห็นภาพรวมของ *"ลูกค้ารู้สึกอย่างไรกับเรา"* และนำไปปรับปรุงบริการได้ทันเวลา

ระบบเดิมของ Bluefish CRM มี **Inbox** สำหรับข้อความขาเข้า (LINE/Messenger/Website/Email) และ **Activities** สำหรับบันทึกการติดต่อ แต่ยังไม่มี store แยกสำหรับ *feedback* ที่คั่นด้วยประเภทและคะแนน ซึ่งเป็นข้อมูลตั้งต้นในการทำ CX (Customer Experience) analytics


## เป้าหมายของโมดูล

1. **จดบันทึกได้เร็ว** — Sales ที่กลับจากการเจอลูกค้าสามารถ log feedback ที่ได้ยินภายใน 10 วิ (ไม่ต้องเข้าฟอร์มยาว)
2. **มองเห็นภาพรวม** — Manager/Exec เห็น trend praise vs complaint รายเดือน และหัวข้อที่ลูกค้าพูดถึงบ่อยที่สุด
3. **ผูกกับ context** — feedback ทุกชิ้นเชื่อมกับ customer เสมอ และ optional เชื่อมกับ activity หรือ opportunity ที่เกี่ยวข้อง
4. **ไม่ทับ Inbox** — Inbox = message threads (สนทนา); Voice = สรุป insight ที่ user จับใจความออกมา


## ฟังก์ชันหลัก

### 1. Voice Log (บันทึกความเห็น)

แต่ละ record มี field ดังนี้:

| Field | คำอธิบาย | ตัวอย่าง |
|---|---|---|
| `customer` | ลูกค้าที่ให้ feedback (required) | บริษัท TAK |
| `kind` | ประเภท | `praise` \| `complaint` \| `suggestion` \| `nps` \| `csat` |
| `rating` | คะแนน (ถ้ามี) | NPS: 0-10, CSAT: 1-5 |
| `text` | เนื้อความ (required) | "อยากได้ integration กับ SAP" |
| `source` | ช่องทางที่ได้รับ | `phone` \| `email` \| `meeting` \| `line` \| `survey` \| `other` |
| `topic` | หัวข้อ/tag (optional) | pricing / support / onboarding / feature |
| `activityId` | activity ที่ได้ feedback (optional) | meeting id |
| `opportunityId` | deal ที่เกี่ยวข้อง (optional) | opp id |
| `author` | ผู้ที่บันทึก (auto = user ปัจจุบัน) | Alice Wong |
| `createdAt` | เวลาบันทึก (auto) | 2026-09-07 14:00 |

**Permission**: 
- อ่าน: ทุก role ที่มี `customer:read`
- เขียน/แก้/ลบ: ทุก role ที่มี `customer:write` (ทั้ง sales_rep และ manager สามารถบันทึกได้)


### 2. Voice tab บน Customer detail

**Desktop** (`/customers/:id`) — เพิ่ม tab **"Voice"** ต่อจาก Overview / Contacts / Documents:
- List feedback ทั้งหมดของลูกค้ารายนี้ เรียงจากใหม่ → เก่า
- ปุ่ม **"+ Log feedback"** เปิด modal ให้กรอก
- Filter: ประเภท / ช่วงเวลา
- แต่ละ item แสดง: kind chip + rating (ถ้ามี) + text + source + author + วันที่ + link ไป activity/opp ถ้ามี

**Mobile** (`/m/customers/:id`) — เพิ่ม section **"Recent voice"** แสดง 5 อันล่าสุด + ปุ่ม "Log feedback" แบบ sheet


### 3. Dashboard widget "Customer voice"

หน้า `/dashboard` เพิ่ม widget ใหม่แสดงภาพรวมทั้ง org:

- **Header**: จำนวน feedback ทั้งหมด (30 วันล่าสุด) + NPS score (ถ้ามี) + CSAT avg
- **By kind**: bar/pie ของ praise / complaint / suggestion / nps / csat
- **Monthly trend**: line chart 12 เดือน (จำนวน feedback + avg rating)
- **Top topics**: 5 อันดับ topic ที่ถูก tag บ่อยสุด
- **Recent**: 5 feedback ล่าสุด (คลิกไป customer detail)


## Backend

### Prisma model

```prisma
model CustomerVoice {
  id            String   @id @default(cuid())
  customerId    String
  authorId      String
  kind          String    // 'praise' | 'complaint' | 'suggestion' | 'nps' | 'csat'
  rating        Int?      // 0-10 (NPS) หรือ 1-5 (CSAT); null สำหรับ kind อื่น
  text          String
  source        String?   // 'phone' | 'email' | 'meeting' | 'line' | 'survey' | 'other'
  topic         String?   // free-text tag
  activityId    String?
  opportunityId String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  customer     Customer     @relation(fields: [customerId], references: [id])
  author       User         @relation(fields: [authorId], references: [id])
  activity     Activity?    @relation(fields: [activityId], references: [id])
  opportunity  Opportunity? @relation(fields: [opportunityId], references: [id])

  @@index([customerId])
  @@index([kind])
  @@index([createdAt])
}
```

### REST endpoints

| Method | Path | Permission | หน้าที่ |
|---|---|---|---|
| GET | `/customer-voice` | `customer:read` | list (query: customerId, kind, from, to, limit) |
| GET | `/customer-voice/:id` | `customer:read` | detail |
| POST | `/customer-voice` | `customer:write` | สร้าง (author auto = req.user.sub) |
| PATCH | `/customer-voice/:id` | `customer:write` | แก้ไข |
| DELETE | `/customer-voice/:id` | `customer:write` | ลบ |
| GET | `/customer-voice/dashboard` | `customer:read` | aggregate stats (30d default) |

### Dashboard aggregate response

```ts
{
  totalCount: number,           // 30d
  byKind: Record<VoiceKind, number>,
  bySource: Record<string, number>,
  monthly: [{
    month: string,              // "YYYY-MM"
    count: number,
    avgNps: number | null,
  }],
  npsScore: number,             // -100..+100 (promoter% - detractor%)
  csatAvg: number,              // 1-5
  topTopics: [{ topic, count }],
  recent: CustomerVoiceDto[],   // last 5
}
```

**NPS calculation**:
- Promoter: rating >= 9
- Passive: rating 7-8
- Detractor: rating 0-6
- NPS = %Promoter - %Detractor (คิดจาก kind='nps' ในช่วง 30 วัน)


## Non-goals (MVP)

- ❌ ไม่มี auto NPS survey link ที่ส่งอีเมลลูกค้า (ต้องใช้ email service integration — ทำ phase ถัดไป)
- ❌ ไม่มี AI sentiment analysis อัตโนมัติ (ปล่อยให้ user เลือก kind เอง — phase ถัดไปค่อยเสริม)
- ❌ ไม่มี public form ให้ลูกค้ากรอกเอง — feedback ต้องเป็น internal-logged เท่านั้น
- ❌ ไม่มีแจ้งเตือน (notification) เมื่อมี complaint ใหม่ — phase ถัดไป


## Roadmap ถัดไป

1. **Phase 2**: Auto NPS survey — สร้าง public token + form + email trigger เมื่อ deal Won หรือ contract signed
2. **Phase 3**: AI classification — auto-detect praise/complaint จาก text ของ Inbox message
3. **Phase 4**: Complaint SLA — โทรกลับภายใน 24 ชม. + notification + status tracking
4. **Phase 5**: Executive scorecard — คำนวน NPS/CSAT ราย service line + benchmark เดือนก่อน


## Reference tables

**VOICE_KINDS**:
| id | icon | color | ใช้เมื่อ |
|---|---|---|---|
| `praise` | 👍 | `#0E9C7E` | ลูกค้าชม / ขอบคุณ |
| `complaint` | ⚠️ | `#C0392B` | ลูกค้าติเรื่องบริการ / product |
| `suggestion` | 💡 | `#B4650A` | ข้อเสนอฟีเจอร์ / ปรับปรุง |
| `nps` | 📊 | `#2A6FDB` | คะแนน Net Promoter Score (0-10) |
| `csat` | ⭐ | `#6C55E0` | คะแนนความพึงพอใจ (1-5) |

**VOICE_SOURCES**: `phone`, `email`, `meeting`, `line`, `survey`, `other`
