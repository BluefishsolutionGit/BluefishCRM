export type OwnerKey = 'NP' | 'KS' | 'PW' | 'ST' | 'AI'

export const owners: Record<OwnerKey, { n: string; c: string }> = {
  NP: { n: 'Nattaya P.', c: '#2A6FDB' },
  KS: { n: 'Krit S.', c: '#1F5AC2' },
  PW: { n: 'Ploy W.', c: '#B4650A' },
  ST: { n: 'Somchai T.', c: '#6C55E0' },
  AI: { n: 'Unassigned', c: '#5C5C74' },
}

export interface Customer {
  id: string
  code: string
  name: string
  th: string
  industry: string
  status: 'Active' | 'Prospect' | 'Inactive'
  ownerI: OwnerKey
  last: string
  open: number
  won: number
  city: string
  address: string
  taxId: string
  phone: string
  terms: string
}

export const customers: Customer[] = [
  { id: 'c1', code: 'C-1024', name: 'Siam Precision Engineering Co., Ltd.', th: 'บจก. สยามพรีซิชั่น เอ็นจิเนียริ่ง', industry: 'Manufacturing', status: 'Active', ownerI: 'NP', last: 'Today · Site visit', open: 4200000, won: 2100000, city: 'Samut Prakan', address: '88/12 Bangpoo Industrial Estate, Samut Prakan 10280', taxId: '0105549001234', phone: '+66 2 709 4400', terms: 'Net 30' },
  { id: 'c2', code: 'C-1031', name: 'Thonburi Medical Group PCL', th: 'บมจ. กลุ่มการแพทย์ธนบุรี', industry: 'Healthcare', status: 'Active', ownerI: 'KS', last: 'Yesterday · Quotation', open: 8420000, won: 620000, city: 'Bangkok', address: '34 Itsaraphap Rd, Thonburi, Bangkok 10600', taxId: '0107536000892', phone: '+66 2 487 2000', terms: 'Net 45' },
  { id: 'c3', code: 'C-1007', name: 'Chao Phraya Logistics Co., Ltd.', th: 'บจก. เจ้าพระยา โลจิสติกส์', industry: 'Logistics', status: 'Active', ownerI: 'PW', last: '2 days ago · Call', open: 2100000, won: 0, city: 'Laem Chabang', address: '1723 Laem Chabang Port Zone B, Chonburi 20230', taxId: '0205551002871', phone: '+66 38 401 220', terms: 'Net 30' },
  { id: 'c4', code: 'C-1042', name: 'Krungthep Foods PCL', th: 'บมจ. กรุงเทพฟู้ดส์', industry: 'Food & Beverage', status: 'Prospect', ownerI: 'NP', last: '3 days ago · LINE chat', open: 1500000, won: 0, city: 'Bangkok', address: '999 Rama III Rd, Yannawa, Bangkok 10120', taxId: '0107542000156', phone: '+66 2 294 8800', terms: '—' },
  { id: 'c5', code: 'C-1055', name: 'Lanna Solar Solutions Co., Ltd.', th: 'บจก. ลานนา โซลาร์ โซลูชั่นส์', industry: 'Energy', status: 'Active', ownerI: 'ST', last: 'Last week · Demo', open: 5600000, won: 890000, city: 'Chiang Mai', address: '215 Super Highway Rd, Chiang Mai 50000', taxId: '0505558003412', phone: '+66 53 244 190', terms: 'Net 30' },
  { id: 'c6', code: 'C-1060', name: 'EastWater Utility PCL', th: 'บมจ. อีสท์วอเตอร์ ยูทิลิตี้', industry: 'Utilities', status: 'Prospect', ownerI: 'KS', last: 'Last week · Email', open: 3000000, won: 0, city: 'Rayong', address: '477 IRPC Rd, Mueang Rayong 21000', taxId: '0107539000221', phone: '+66 38 941 331', terms: '—' },
  { id: 'c7', code: 'C-1012', name: 'Sukhumvit Property Development', th: 'บจก. สุขุมวิท พร็อพเพอร์ตี้', industry: 'Real Estate', status: 'Inactive', ownerI: 'PW', last: '3 weeks ago · Follow-up', open: 0, won: 940000, city: 'Bangkok', address: '250 Sukhumvit 21, Wattana, Bangkok 10110', taxId: '0105538009923', phone: '+66 2 261 0550', terms: 'Net 30' },
  { id: 'c8', code: 'C-1048', name: 'TechVista (Thailand) Co., Ltd.', th: 'บจก. เทควิสต้า (ประเทศไทย)', industry: 'IT Services', status: 'Active', ownerI: 'ST', last: 'Today · Meeting', open: 6000000, won: 1500000, city: 'Bangkok', address: '9 G Tower, Rama IX Rd, Bangkok 10310', taxId: '0105560012345', phone: '+66 2 026 3400', terms: 'Net 30' },
]

export interface Contact { name: string; role: string; phone: string; email: string; primary?: boolean }
export const contactsMap: Record<string, Contact[]> = {
  c1: [{ name: 'คุณณัฐพงษ์ ศรีวัฒนา', role: 'Procurement Director', phone: '081-234-5678', email: 'nattapong.s@siamprecision.co.th', primary: true }, { name: 'คุณพรทิพย์ จิตอารี', role: 'Plant Engineer', phone: '089-556-1023', email: 'porntip.j@siamprecision.co.th' }],
  c2: [{ name: 'คุณพิมพ์ชนก อารีย์', role: 'IT Director', phone: '086-990-4521', email: 'pimchanok.a@thonburimed.com', primary: true }, { name: 'นพ.วรวิทย์ ตั้งตรงจิตร', role: 'Deputy CEO', phone: '081-808-7745', email: 'worawit.t@thonburimed.com' }],
  c3: [{ name: 'คุณสมชาย เรืองเดช', role: 'Fleet Manager', phone: '084-112-9087', email: 'somchai.r@cplogistics.co.th', primary: true }],
  c4: [{ name: 'คุณอรทัย บุญมี', role: 'Supply Chain Manager', phone: '088-345-6612', email: 'orathai.b@ktfoods.co.th', primary: true }],
  c5: [{ name: 'คุณเมธา ปันแก้ว', role: 'Managing Director', phone: '081-671-2234', email: 'metha.p@lannasolar.co.th', primary: true }],
  c6: [{ name: 'คุณจารุวรรณ สุขใจ', role: 'Engineering Manager', phone: '086-224-8890', email: 'jaruwan.s@eastwater.co.th', primary: true }],
  c7: [{ name: 'คุณกรกฎ เกียรติกุล', role: 'Project Director', phone: '089-101-5567', email: 'korakot.k@skvproperty.co.th', primary: true }],
  c8: [{ name: 'คุณเมธาวี ลิ้มสกุล', role: 'CTO', phone: '081-450-2278', email: 'methawee.l@techvista.co.th', primary: true }],
}

export type Stage = 'Qualification' | 'Proposal' | 'Negotiation' | 'Won'
export interface Deal {
  id: string; title: string; customer: string; custId: string; value: number; prob: number
  close: string; ownerI: OwnerKey; stage: Stage; ai?: string
}
export const deals: Deal[] = [
  { id: 'd1', title: 'Factory Automation Phase 2', customer: 'Siam Precision', custId: 'c1', value: 4200000, prob: 70, close: 'Aug 15', ownerI: 'NP', stage: 'Negotiation', ai: 'Send updated ROI sheet — decision meeting Friday' },
  { id: 'd2', title: 'Hospital ERP Integration', customer: 'Thonburi Medical', custId: 'c2', value: 7800000, prob: 55, close: 'Sep 2', ownerI: 'KS', stage: 'Proposal', ai: 'Quotation viewed 3× today — follow up before 16:00' },
  { id: 'd3', title: 'Cold-chain Fleet Tracking', customer: 'Chao Phraya Logistics', custId: 'c3', value: 2100000, prob: 40, close: 'Sep 20', ownerI: 'PW', stage: 'Qualification', ai: 'Idle 9 days — auto follow-up scheduled tomorrow 09:00' },
  { id: 'd4', title: 'Solar PPA — Rooftop 2MW', customer: 'Lanna Solar', custId: 'c5', value: 5600000, prob: 80, close: 'Aug 8', ownerI: 'ST', stage: 'Negotiation' },
  { id: 'd5', title: 'Central Kitchen MES', customer: 'Krungthep Foods', custId: 'c4', value: 1500000, prob: 30, close: 'Oct 1', ownerI: 'NP', stage: 'Qualification' },
  { id: 'd6', title: 'Water Treatment SCADA', customer: 'EastWater Utility', custId: 'c6', value: 3000000, prob: 60, close: 'Sep 12', ownerI: 'KS', stage: 'Proposal' },
  { id: 'd7', title: 'Data Center Fit-out', customer: 'TechVista (Thailand)', custId: 'c8', value: 6000000, prob: 45, close: 'Oct 10', ownerI: 'ST', stage: 'Proposal' },
  { id: 'd8', title: 'Clinic Queue System', customer: 'Thonburi Medical', custId: 'c2', value: 620000, prob: 100, close: 'Won Jun 24', ownerI: 'KS', stage: 'Won' },
  { id: 'd9', title: 'Smart Metering Pilot', customer: 'Siam Precision', custId: 'c1', value: 1080000, prob: 100, close: 'Won Jul 1', ownerI: 'NP', stage: 'Won' },
]

export const stages: { name: Stage; c: string }[] = [
  { name: 'Qualification', c: '#8888A0' },
  { name: 'Proposal', c: '#1F5AC2' },
  { name: 'Negotiation', c: '#B4650A' },
  { name: 'Won', c: '#2A6FDB' },
]

export interface Lead {
  id: string; name: string; company: string; source: string; score: number
  ownerI: OwnerKey; status: string; value: string
}
export const leadsData: Lead[] = [
  { id: 'l1', name: 'คุณอรทัย บุญมี', company: 'Bangna Cold Chain Co., Ltd.', source: 'LINE OA', score: 86, ownerI: 'NP', status: 'New', value: '฿1.2M' },
  { id: 'l2', name: 'คุณวีรพล จันทร์แก้ว', company: 'Metro Rail Facilities (MRF)', source: 'e-GP Tender', score: 92, ownerI: 'AI', status: 'AI Sourced', value: '฿8.5M' },
  { id: 'l3', name: 'คุณสุภาวดี ทองดี', company: 'Phuket Marina Resort', source: 'Facebook Ads', score: 74, ownerI: 'PW', status: 'Contacted', value: '฿950K' },
  { id: 'l4', name: 'คุณกิตติศักดิ์ พรหมมา', company: 'Udon Agro Industry', source: 'Website', score: 61, ownerI: 'KS', status: 'Qualified', value: '฿2.4M' },
  { id: 'l5', name: 'คุณเมธาวี ลิ้มสกุล', company: 'Siam Data Center Co., Ltd.', source: 'Referral', score: 88, ownerI: 'ST', status: 'Qualified', value: '฿6.0M' },
  { id: 'l6', name: 'คุณประเสริฐ วงศ์สว่าง', company: 'Hatyai Municipality (RFP)', source: 'e-GP Tender', score: 79, ownerI: 'AI', status: 'AI Sourced', value: '฿3.8M' },
  { id: 'l7', name: 'คุณชลธิชา แสงทอง', company: 'Rimping Retail Group', source: 'Website', score: 55, ownerI: 'PW', status: 'New', value: '฿480K' },
]

export interface Thread {
  id: string; channel: string; name: string; company: string; time: string; unread: number
  member: boolean; owner: string; tag: string; deal: string; dealMeta: string; preview: string
  msgs: { side: 'in' | 'out'; text: string; time: string }[]
}
export const threadsData: Thread[] = [
  { id: 't1', channel: 'LINE', name: 'คุณพิมพ์ชนก อารีย์', company: 'Thonburi Medical Group', time: '09:41', unread: 2, member: true, owner: 'Krit S.', tag: 'Hot deal', deal: 'Hospital ERP Integration', dealMeta: '฿7.8M · Proposal · close Sep 2', preview: 'ขอใบเสนอราคาเวอร์ชันล่าสุดค่ะ', msgs: [
    { side: 'in', text: 'สวัสดีค่ะ ทีมผู้บริหารดู proposal แล้วสนใจมากค่ะ', time: '09:32' },
    { side: 'in', text: 'ขอใบเสนอราคาเวอร์ชันล่าสุด พร้อม breakdown ค่า implementation ได้ไหมคะ', time: '09:33' },
    { side: 'out', text: 'ยินดีครับ เดี๋ยวส่ง QT-2026-0142 v3 พร้อมรายละเอียด man-day ให้ภายในบ่ายนี้ครับ', time: '09:38' },
    { side: 'in', text: 'ขอบคุณค่ะ ถ้าเป็นไปได้ขอก่อน 16:00 นะคะ มีประชุมบอร์ดพรุ่งนี้เช้า', time: '09:41' },
  ]},
  { id: 't2', channel: 'LINE OA', name: 'คุณอรทัย บุญมี', company: 'Bangna Cold Chain', time: '08:55', unread: 1, member: true, owner: 'Nattaya P.', tag: 'New lead', deal: '— no open deal —', dealMeta: 'Lead score 86 · from LINE OA', preview: 'สมาชิกได้ส่วนลดไหมคะ', msgs: [
    { side: 'in', text: 'สนใจระบบ tracking รถห้องเย็นค่ะ เห็นโพสต์ใน LINE OA', time: '08:52' },
    { side: 'in', text: 'เป็นสมาชิกอยู่แล้ว ได้ส่วนลดหรือแต้มเพิ่มไหมคะ', time: '08:55' },
  ]},
  { id: 't3', channel: 'Messenger', name: 'Kittisak Prommas', company: 'Udon Agro Industry', time: 'Yesterday', unread: 0, member: false, owner: 'Krit S.', tag: 'Qualified', deal: '— no open deal —', dealMeta: 'Lead score 61 · from Website', preview: 'Can we schedule a demo next week?', msgs: [
    { side: 'in', text: 'Hi, we reviewed the brochure. Can we schedule a demo next week?', time: 'Tue 16:20' },
    { side: 'out', text: 'Of course! Would Tuesday 14 Jul, 10:00 work? We can demo the traceability module.', time: 'Tue 16:41' },
    { side: 'in', text: 'Tuesday works. Please send a calendar invite.', time: 'Tue 17:02' },
  ]},
  { id: 't4', channel: 'Website', name: 'rimping.retail', company: 'Rimping Retail Group', time: 'Yesterday', unread: 0, member: false, owner: 'Ploy W.', tag: 'New lead', deal: '— no open deal —', dealMeta: 'Lead score 55 · from Website', preview: 'ราคาแพ็กเกจเริ่มต้นเท่าไหร่ครับ', msgs: [
    { side: 'in', text: 'สอบถามราคาแพ็กเกจ WMS เริ่มต้นสำหรับ 2 คลังครับ', time: 'Mon 19:44' },
    { side: 'out', text: 'เริ่มต้นที่ ฿480K ครับ เดี๋ยวทีมงานส่งรายละเอียดทาง email ได้ไหมครับ', time: 'Mon 20:10' },
  ]},
]

export type EventKind = 'meeting' | 'call' | 'visit' | 'demo'
export interface CalEvent {
  id: string; day: number; time: string; title: string; who: string; type: EventKind
  badge?: string; summary?: string; actions?: string[]
}
export const eventsData: CalEvent[] = [
  { id: 'e1', day: 0, time: '10:00', title: 'Call — Krungthep Foods', who: 'Nattaya P.', type: 'call' },
  { id: 'e2', day: 0, time: '15:00', title: 'Pipeline review (internal)', who: 'Sales team', type: 'meeting' },
  { id: 'e3', day: 1, time: '09:30', title: 'Site visit — Siam Precision', who: 'Nattaya P.', type: 'visit', badge: 'TRANSCRIBED', summary: 'Walked Line 3 with คุณณัฐพงษ์. Confirmed budget ฿4.2M approved by board; decision meeting Friday. Main concern is integration downtime during Songkran shutdown — they want a phased cutover plan.', actions: ['Send phased cutover plan (max 4h downtime) by Thursday', 'Update deal probability to 70%', 'Invite plant engineer คุณพรทิพย์ to Friday decision meeting'] },
  { id: 'e4', day: 1, time: '14:00', title: 'Demo — Siam Data Center', who: 'Somchai T.', type: 'demo' },
  { id: 'e5', day: 2, time: '11:00', title: 'Quotation walkthrough — Thonburi', who: 'Krit S.', type: 'meeting', badge: 'SCHEDULED', summary: 'Upcoming: walk through QT-2026-0142 v3 with IT Director and Deputy CEO before their board meeting. AI suggests preparing the implementation man-day breakdown and HL7 interface references.', actions: ['Prepare man-day breakdown slide', 'Bring 2 hospital reference cases', 'Confirm approval status with Country Director before meeting'] },
  { id: 'e6', day: 2, time: '16:00', title: 'Call — EastWater SCADA', who: 'Krit S.', type: 'call' },
  { id: 'e7', day: 3, time: '10:00', title: 'Tender briefing — Hatyai RFP', who: 'Ploy W.', type: 'meeting' },
  { id: 'e8', day: 3, time: '14:30', title: 'Follow-up — Phuket Marina', who: 'Ploy W.', type: 'call' },
  { id: 'e9', day: 4, time: '13:00', title: 'Negotiation — Lanna Solar PPA', who: 'Somchai T.', type: 'meeting' },
  { id: 'e10', day: 5, time: '09:00', title: 'CSR — customer golf day', who: 'All team', type: 'visit' },
]

export type CtStatus = 'Draft' | 'Under Review' | 'Pending Approval' | 'Approved' | 'Signed' | 'Active' | 'Expiring' | 'Expired' | 'Renewed' | 'Terminated'
export interface Contract {
  id: string; no: string; custId: string; type: string; value: number; start: string; end: string
  status: CtStatus; ownerI: OwnerKey; daysLeft: number | null; risk: 'Low' | 'Med' | 'High'; step?: number
}
export const contractsData: Contract[] = [
  { id: 'ct1', no: 'CT-2025-0231', custId: 'c1', type: 'Master Service Agreement', value: 8500000, start: '01 Feb 2025', end: '31 Jan 2028', status: 'Active', ownerI: 'NP', daysLeft: 570, risk: 'Low' },
  { id: 'ct2', no: 'CT-2026-0087', custId: 'c2', type: 'Maintenance & Support', value: 1200000, start: '01 Aug 2025', end: '31 Jul 2026', status: 'Expiring', ownerI: 'KS', daysLeft: 21, risk: 'Med' },
  { id: 'ct3', no: 'CT-2026-0102', custId: 'c3', type: 'SaaS Subscription', value: 2400000, start: '15 Jul 2026', end: '14 Jul 2028', status: 'Pending Approval', ownerI: 'ST', daysLeft: 730, risk: 'Low', step: 3 },
  { id: 'ct4', no: 'CT-2025-0198', custId: 'c4', type: 'Software License', value: 3200000, start: '01 Sep 2025', end: '31 Aug 2026', status: 'Expiring', ownerI: 'NP', daysLeft: 52, risk: 'Med' },
  { id: 'ct5', no: 'CT-2026-0075', custId: 'c5', type: 'Service Level Agreement', value: 950000, start: '01 Jun 2026', end: '31 May 2027', status: 'Signed', ownerI: 'PW', daysLeft: 320, risk: 'Low' },
  { id: 'ct6', no: 'CT-2026-0119', custId: 'c8', type: 'Purchase Agreement', value: 5600000, start: '—', end: '—', status: 'Under Review', ownerI: 'KS', daysLeft: null, risk: 'High', step: 2 },
  { id: 'ct7', no: 'CT-2024-0301', custId: 'c7', type: 'Maintenance & Support', value: 1800000, start: '01 Mar 2024', end: '28 Feb 2026', status: 'Expired', ownerI: 'ST', daysLeft: -131, risk: 'High' },
  { id: 'ct8', no: 'CT-2026-0060', custId: 'c6', type: 'Non-Disclosure Agreement', value: 0, start: '10 Jan 2026', end: '09 Jan 2029', status: 'Active', ownerI: 'KS', daysLeft: 913, risk: 'Low' },
  { id: 'ct9', no: 'CT-2025-0155', custId: 'c1', type: 'Software License', value: 2750000, start: '01 Apr 2025', end: '31 Mar 2026', status: 'Renewed', ownerI: 'NP', daysLeft: null, risk: 'Low' },
  { id: 'ct10', no: 'CT-2026-0131', custId: 'c3', type: 'Master Service Agreement', value: 4100000, start: '—', end: '—', status: 'Draft', ownerI: 'ST', daysLeft: null, risk: 'Med' },
]

export type ObligKind = 'Payment' | 'Delivery' | 'SLA' | 'Renewal' | 'Warranty'
export interface Obligation { d: number; kind: ObligKind; title: string; custId: string; no: string; due: string; amount?: number; done: boolean }
export const obligationsData: Obligation[] = [
  { d: 2, kind: 'SLA', title: 'SLA quarterly review', custId: 'c5', no: 'CT-2026-0075', due: '2 Jul 2026', done: false },
  { d: 3, kind: 'Payment', title: 'Payment milestone 40%', custId: 'c1', no: 'CT-2025-0231', due: '3 Jul 2026', amount: 3400000, done: false },
  { d: 7, kind: 'Payment', title: 'Annual support fee due', custId: 'c2', no: 'CT-2026-0087', due: '7 Jul 2026', amount: 1200000, done: false },
  { d: 10, kind: 'Delivery', title: 'Phase 1 delivery milestone', custId: 'c4', no: 'CT-2025-0198', due: '10 Jul 2026', done: false },
  { d: 15, kind: 'Delivery', title: 'HIS integration go-live', custId: 'c1', no: 'CT-2025-0231', due: '15 Jul 2026', done: false },
  { d: 18, kind: 'SLA', title: 'Monthly uptime report', custId: 'c5', no: 'CT-2026-0075', due: '18 Jul 2026', done: false },
  { d: 22, kind: 'Renewal', title: 'Renewal reminder — 90 days notice', custId: 'c2', no: 'CT-2026-0087', due: '22 Jul 2026', done: false },
  { d: 28, kind: 'Warranty', title: 'Warranty expiry check', custId: 'c4', no: 'CT-2025-0198', due: '28 Jul 2026', done: false },
  { d: 31, kind: 'Renewal', title: 'Contract expiry — decide renew/terminate', custId: 'c2', no: 'CT-2026-0087', due: '31 Jul 2026', done: false },
]

export const competitorData = [
  { name: 'AlphaSoft ERP', logo: 'A', customers: 54, expiring90: 12, renewed: 18, negotiating: 9, c: '#2A6FDB' },
  { name: 'CloudNine Systems', logo: 'C', customers: 37, expiring90: 8, renewed: 11, negotiating: 6, c: '#7C3AED' },
  { name: 'MetricStream Co.', logo: 'M', customers: 29, expiring90: 5, renewed: 7, negotiating: 4, c: '#0E9C7E' },
  { name: 'Legacy IT (local)', logo: 'L', customers: 21, expiring90: 6, renewed: 3, negotiating: 5, c: '#D2601A' },
]

export interface CompetitorContract {
  customer: string; competitor: string; service: string; end: string; days: number
  status: string; prob: number; value: number; ownerI: OwnerKey; conf: string
}
export const competitorContracts: CompetitorContract[] = [
  { customer: 'Bangkok General Hospital', competitor: 'AlphaSoft ERP', service: 'Hospital ERP', end: '12 Sep 2026', days: 67, status: 'Renewal Window', prob: 65, value: 8200000, ownerI: 'KS', conf: 'High' },
  { customer: 'Metro Rail Facilities', competitor: 'CloudNine Systems', service: 'Asset Mgmt SaaS', end: '28 Aug 2026', days: 52, status: 'Proposal Submitted', prob: 55, value: 5400000, ownerI: 'NP', conf: 'Med' },
  { customer: 'Phuket Marina Resort', competitor: 'Legacy IT (local)', service: 'PMS + POS', end: '02 Aug 2026', days: 26, status: 'Negotiation', prob: 72, value: 3100000, ownerI: 'PW', conf: 'High' },
  { customer: 'Rimping Retail Group', competitor: 'CloudNine Systems', service: 'Retail ERP', end: '30 Jul 2026', days: 23, status: 'Negotiation', prob: 60, value: 4200000, ownerI: 'PW', conf: 'High' },
  { customer: 'Chiang Mai Logistics', competitor: 'MetricStream Co.', service: 'Transport Mgmt (TMS)', end: '05 Sep 2026', days: 60, status: 'Renewal Window', prob: 52, value: 3700000, ownerI: 'NP', conf: 'Med' },
  { customer: 'Hatyai Municipality', competitor: 'Legacy IT (local)', service: 'e-Gov portal', end: '10 Oct 2026', days: 95, status: 'Proposal Submitted', prob: 48, value: 6800000, ownerI: 'KS', conf: 'Med' },
  { customer: 'Udon Agro Industry', competitor: 'MetricStream Co.', service: 'Compliance suite', end: '15 Nov 2026', days: 131, status: 'Monitoring', prob: 35, value: 2600000, ownerI: 'ST', conf: 'Med' },
  { customer: 'Siam Data Center', competitor: 'AlphaSoft ERP', service: 'DCIM platform', end: '20 Jan 2027', days: 197, status: 'Contract Identified', prob: 25, value: 9500000, ownerI: 'ST', conf: 'Low' },
  { customer: 'Eastern Seaboard Port', competitor: 'CloudNine Systems', service: 'Port ops platform', end: '22 Mar 2027', days: 255, status: 'Monitoring', prob: 30, value: 7300000, ownerI: 'KS', conf: 'Med' },
  { customer: 'Nakhon Grand Plaza', competitor: 'AlphaSoft ERP', service: 'Retail suite', end: '18 Sep 2027', days: 434, status: 'Prospect', prob: 15, value: 5200000, ownerI: 'PW', conf: 'Low' },
  { customer: 'Korat Sugar Mill', competitor: 'Legacy IT (local)', service: 'Plant MES', end: '20 Jun 2026', days: -20, status: 'Auto Renewed', prob: 0, value: 2900000, ownerI: 'ST', conf: 'High' },
]

export const lossReasons = [
  { name: 'Price', pct: 40, c: '#C0392B' },
  { name: 'Feature gap', pct: 25, c: '#D2601A' },
  { name: 'Relationship', pct: 20, c: '#6C55E0' },
  { name: 'Service/SLA', pct: 15, c: '#8888A0' },
]

export interface Quote {
  id: string; no: string; customer: string; custId: string; owner: string; version: number
  status: 'Draft' | 'Sent' | 'Pending Approval' | 'Approved'; date: string; amount: string
}
export const quotesData: Quote[] = [
  { id: 'q1', no: 'QT-2026-0142', customer: 'Thonburi Medical Group PCL', custId: 'c2', owner: 'Krit S.', version: 3, status: 'Pending Approval', date: '5 Jul 2026', amount: '฿7,511,935' },
  { id: 'q2', no: 'QT-2026-0139', customer: 'Siam Precision Engineering', custId: 'c1', owner: 'Nattaya P.', version: 2, status: 'Approved', date: '2 Jul 2026', amount: '฿4,180,000' },
  { id: 'q3', no: 'QT-2026-0135', customer: 'Lanna Solar Solutions', custId: 'c5', owner: 'Somchai T.', version: 1, status: 'Sent', date: '28 Jun 2026', amount: '฿5,560,000' },
  { id: 'q4', no: 'QT-2026-0128', customer: 'Krungthep Foods PCL', custId: 'c4', owner: 'Nattaya P.', version: 1, status: 'Draft', date: '25 Jun 2026', amount: '฿1,490,000' },
]

export const hunterData = [
  { id: 'r1', title: 'MEA — Smart Substation Monitoring', meta: 'e-GP tender · closing 24 Jul · Bangkok · matches: SCADA, IoT sensors', budget: '฿12.5M', match: 'ICP 94' },
  { id: 'r2', title: 'Airports of Thailand — CCTV Analytics RFP', meta: 'e-GP tender · closing 5 Aug · Suvarnabhumi · matches: video analytics, AI', budget: '฿18.2M', match: 'ICP 88' },
  { id: 'r3', title: 'CP Retailink — cold storage expansion', meta: 'Business news (Prachachat, 4 Jul) · 3 new DCs in EEC · matches: cold-chain tracking', budget: '~฿6–9M', match: 'ICP 76' },
  { id: 'r4', title: 'Betagro — new plant, Lopburi', meta: 'Company announcement · construction starts Q4 · matches: MES, automation', budget: '~฿4M', match: 'ICP 71' },
]

export const agentsData = [
  { id: 'hunter', name: 'Lead Hunter', chip: '4 results', desc: 'Finds projects & prospects from e-GP, procurement portals and business news.', icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z' },
  { id: 'tender', name: 'Tender Search', chip: '3 new', desc: 'Monitors RFP / RFQ / TOR announcements matching your keywords.', icon: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5' },
  { id: 'doc', name: 'Document AI', chip: 'idle', desc: 'OCR + extract budget, timeline, requirements from TOR / BOQ / PDF.', icon: 'M6.5 3h8l4 4v14h-12z M14 3v5h4.5 M9.5 12.5h5.5 M9.5 16h5.5' },
  { id: 'meeting', name: 'Meeting AI', chip: '2 today', desc: 'Transcribes calls & meetings, drafts MOM and updates CRM records.', icon: 'M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 15z M6 11.5a6 6 0 0 0 12 0 M12 17.5V21' },
]

export const tasksData = [
  { id: 't1', label: 'Send QT-2026-0142 v3 to Thonburi Medical', due: 'Today 16:00', urgent: true },
  { id: 't2', label: 'Log MOM from Siam Precision site visit', due: 'Today', urgent: false },
  { id: 't3', label: 'Prepare Hatyai RFP compliance checklist', due: 'Thu', urgent: false },
  { id: 't4', label: 'Call back คุณอรทัย (Bangna Cold Chain)', due: 'Tomorrow', urgent: false },
  { id: 't5', label: 'Review AI-sourced leads from e-GP', due: 'Fri', urgent: false },
]

export function fmt(v: number): string {
  return v >= 1e6 ? '฿' + (v / 1e6).toFixed(1) + 'M' : '฿' + Math.round(v / 1e3) + 'K'
}

export function customerName(id: string): string {
  return customers.find((c) => c.id === id)?.name || '—'
}

export function initialsOf(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
}
