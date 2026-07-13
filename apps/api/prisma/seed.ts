import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const ROLES = [
  { name: 'admin', description: 'Full access to everything' },
  { name: 'sales_manager', description: 'Manage sales team, customers, opportunities' },
  { name: 'sales_rep', description: 'Own leads, opportunities, activities' },
  { name: 'legal', description: 'Review + approve contracts (legal step)' },
  { name: 'finance', description: 'Review + approve contracts (finance step)' },
  { name: 'auditor', description: 'Read-only access + audit log' },
]

interface CustomerSeed {
  code: string
  name: string
  nameTh: string
  industry: string
  status: string
  ownerKey: 'NP' | 'KS' | 'PW' | 'ST'
  lastActivity: string
  openValue: number
  wonValue: number
  city: string
  address: string
  taxId: string
  phone: string
  terms: string
}

async function main() {
  // 1. Roles
  const roleMap = new Map<string, string>()
  for (const r of ROLES) {
    const row = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: r,
    })
    roleMap.set(r.name, row.id)
  }

  // 2. Users
  const passwordHash = await bcrypt.hash('demo1234', 10)
  const salesManagerId = roleMap.get('sales_manager')!
  const salesRepId = roleMap.get('sales_rep')!

  const nattaya = await prisma.user.upsert({
    where: { email: 'nattaya@bluefishsolution.com' },
    update: { roleId: salesManagerId },
    create: { email: 'nattaya@bluefishsolution.com', passwordHash, name: 'Nattaya P.', roleId: salesManagerId },
  })
  const krit = await prisma.user.upsert({
    where: { email: 'krit@bluefishsolution.com' },
    update: { roleId: salesRepId },
    create: { email: 'krit@bluefishsolution.com', passwordHash, name: 'Krit S.', roleId: salesRepId },
  })
  const ploy = await prisma.user.upsert({
    where: { email: 'ploy@bluefishsolution.com' },
    update: { roleId: salesRepId },
    create: { email: 'ploy@bluefishsolution.com', passwordHash, name: 'Ploy W.', roleId: salesRepId },
  })
  const somchai = await prisma.user.upsert({
    where: { email: 'somchai@bluefishsolution.com' },
    update: { roleId: salesRepId },
    create: { email: 'somchai@bluefishsolution.com', passwordHash, name: 'Somchai T.', roleId: salesRepId },
  })

  // A couple of role-specific users to exercise permissions
  await prisma.user.upsert({
    where: { email: 'admin@bluefishsolution.com' },
    update: { roleId: roleMap.get('admin')! },
    create: { email: 'admin@bluefishsolution.com', passwordHash, name: 'Admin', roleId: roleMap.get('admin')! },
  })
  await prisma.user.upsert({
    where: { email: 'legal@bluefishsolution.com' },
    update: { roleId: roleMap.get('legal')! },
    create: { email: 'legal@bluefishsolution.com', passwordHash, name: 'Legal Officer', roleId: roleMap.get('legal')! },
  })
  await prisma.user.upsert({
    where: { email: 'auditor@bluefishsolution.com' },
    update: { roleId: roleMap.get('auditor')! },
    create: { email: 'auditor@bluefishsolution.com', passwordHash, name: 'Auditor', roleId: roleMap.get('auditor')! },
  })
  await prisma.user.upsert({
    where: { email: 'finance@bluefishsolution.com' },
    update: { roleId: roleMap.get('finance')! },
    create: { email: 'finance@bluefishsolution.com', passwordHash, name: 'Finance Officer', roleId: roleMap.get('finance')! },
  })

  const owners: Record<CustomerSeed['ownerKey'], string> = {
    NP: nattaya.id, KS: krit.id, PW: ploy.id, ST: somchai.id,
  }

  // 3. Customers
  const customers: CustomerSeed[] = [
    { code: 'C-1024', name: 'Siam Precision Engineering Co., Ltd.', nameTh: 'บจก. สยามพรีซิชั่น เอ็นจิเนียริ่ง', industry: 'Manufacturing', status: 'Active', ownerKey: 'NP', lastActivity: 'Today · Site visit', openValue: 4200000, wonValue: 2100000, city: 'Samut Prakan', address: '88/12 Bangpoo Industrial Estate, Samut Prakan 10280', taxId: '0105549001234', phone: '+66 2 709 4400', terms: 'Net 30' },
    { code: 'C-1031', name: 'Thonburi Medical Group PCL', nameTh: 'บมจ. กลุ่มการแพทย์ธนบุรี', industry: 'Healthcare', status: 'Active', ownerKey: 'KS', lastActivity: 'Yesterday · Quotation', openValue: 8420000, wonValue: 620000, city: 'Bangkok', address: '34 Itsaraphap Rd, Thonburi, Bangkok 10600', taxId: '0107536000892', phone: '+66 2 487 2000', terms: 'Net 45' },
    { code: 'C-1007', name: 'Chao Phraya Logistics Co., Ltd.', nameTh: 'บจก. เจ้าพระยา โลจิสติกส์', industry: 'Logistics', status: 'Active', ownerKey: 'PW', lastActivity: '2 days ago · Call', openValue: 2100000, wonValue: 0, city: 'Laem Chabang', address: '1723 Laem Chabang Port Zone B, Chonburi 20230', taxId: '0205551002871', phone: '+66 38 401 220', terms: 'Net 30' },
    { code: 'C-1042', name: 'Krungthep Foods PCL', nameTh: 'บมจ. กรุงเทพฟู้ดส์', industry: 'Food & Beverage', status: 'Prospect', ownerKey: 'NP', lastActivity: '3 days ago · LINE chat', openValue: 1500000, wonValue: 0, city: 'Bangkok', address: '999 Rama III Rd, Yannawa, Bangkok 10120', taxId: '0107542000156', phone: '+66 2 294 8800', terms: '—' },
    { code: 'C-1055', name: 'Lanna Solar Solutions Co., Ltd.', nameTh: 'บจก. ลานนา โซลาร์ โซลูชั่นส์', industry: 'Energy', status: 'Active', ownerKey: 'ST', lastActivity: 'Last week · Demo', openValue: 5600000, wonValue: 890000, city: 'Chiang Mai', address: '215 Super Highway Rd, Chiang Mai 50000', taxId: '0505558003412', phone: '+66 53 244 190', terms: 'Net 30' },
    { code: 'C-1060', name: 'EastWater Utility PCL', nameTh: 'บมจ. อีสท์วอเตอร์ ยูทิลิตี้', industry: 'Utilities', status: 'Prospect', ownerKey: 'KS', lastActivity: 'Last week · Email', openValue: 3000000, wonValue: 0, city: 'Rayong', address: '477 IRPC Rd, Mueang Rayong 21000', taxId: '0107539000221', phone: '+66 38 941 331', terms: '—' },
    { code: 'C-1012', name: 'Sukhumvit Property Development', nameTh: 'บจก. สุขุมวิท พร็อพเพอร์ตี้', industry: 'Real Estate', status: 'Inactive', ownerKey: 'PW', lastActivity: '3 weeks ago · Follow-up', openValue: 0, wonValue: 940000, city: 'Bangkok', address: '250 Sukhumvit 21, Wattana, Bangkok 10110', taxId: '0105538009923', phone: '+66 2 261 0550', terms: 'Net 30' },
    { code: 'C-1048', name: 'TechVista (Thailand) Co., Ltd.', nameTh: 'บจก. เทควิสต้า (ประเทศไทย)', industry: 'IT Services', status: 'Active', ownerKey: 'ST', lastActivity: 'Today · Meeting', openValue: 6000000, wonValue: 1500000, city: 'Bangkok', address: '9 G Tower, Rama IX Rd, Bangkok 10310', taxId: '0105560012345', phone: '+66 2 026 3400', terms: 'Net 30' },
  ]

  for (const c of customers) {
    await prisma.customer.upsert({
      where: { code: c.code },
      update: {},
      create: {
        code: c.code,
        name: c.name,
        nameTh: c.nameTh,
        industry: c.industry,
        status: c.status,
        ownerId: owners[c.ownerKey],
        city: c.city,
        address: c.address,
        taxId: c.taxId,
        phone: c.phone,
        terms: c.terms,
        openValue: c.openValue,
        wonValue: c.wonValue,
        lastActivity: c.lastActivity,
      },
    })
  }

  // 4. Contacts
  const contactsByCode: Record<string, { name: string; role: string; phone: string; email: string; isPrimary?: boolean }[]> = {
    'C-1024': [
      { name: 'คุณณัฐพงษ์ ศรีวัฒนา', role: 'Procurement Director', phone: '081-234-5678', email: 'nattapong.s@siamprecision.co.th', isPrimary: true },
      { name: 'คุณพรทิพย์ จิตอารี', role: 'Plant Engineer', phone: '089-556-1023', email: 'porntip.j@siamprecision.co.th' },
    ],
    'C-1031': [
      { name: 'คุณพิมพ์ชนก อารีย์', role: 'IT Director', phone: '086-990-4521', email: 'pimchanok.a@thonburimed.com', isPrimary: true },
      { name: 'นพ.วรวิทย์ ตั้งตรงจิตร', role: 'Deputy CEO', phone: '081-808-7745', email: 'worawit.t@thonburimed.com' },
    ],
    'C-1007': [{ name: 'คุณสมชาย เรืองเดช', role: 'Fleet Manager', phone: '084-112-9087', email: 'somchai.r@cplogistics.co.th', isPrimary: true }],
    'C-1042': [{ name: 'คุณอรทัย บุญมี', role: 'Supply Chain Manager', phone: '088-345-6612', email: 'orathai.b@ktfoods.co.th', isPrimary: true }],
    'C-1055': [{ name: 'คุณเมธา ปันแก้ว', role: 'Managing Director', phone: '081-671-2234', email: 'metha.p@lannasolar.co.th', isPrimary: true }],
    'C-1060': [{ name: 'คุณจารุวรรณ สุขใจ', role: 'Engineering Manager', phone: '086-224-8890', email: 'jaruwan.s@eastwater.co.th', isPrimary: true }],
    'C-1012': [{ name: 'คุณกรกฎ เกียรติกุล', role: 'Project Director', phone: '089-101-5567', email: 'korakot.k@skvproperty.co.th', isPrimary: true }],
    'C-1048': [{ name: 'คุณเมธาวี ลิ้มสกุล', role: 'CTO', phone: '081-450-2278', email: 'methawee.l@techvista.co.th', isPrimary: true }],
  }
  for (const [code, contacts] of Object.entries(contactsByCode)) {
    const customer = await prisma.customer.findUnique({ where: { code } })
    if (!customer) continue
    for (const c of contacts) {
      const existing = await prisma.contact.findFirst({ where: { customerId: customer.id, email: c.email } })
      if (!existing) {
        await prisma.contact.create({ data: { ...c, customerId: customer.id, isPrimary: c.isPrimary ?? false } })
      }
    }
  }

  // 5. Products
  const products = [
    { code: 'ERP-CORE', name: 'ERP Core License', description: '250 named users · perpetual', unitPrice: 3200000 },
    { code: 'HIS-INT', name: 'HIS Integration Module', description: 'HL7 / FHIR interfaces', unitPrice: 1850000 },
    { code: 'IMPL-MD', name: 'Implementation & Training (man-day)', description: 'On-site Bangkok', unitPrice: 9500 },
    { code: 'SUPP-Y1', name: 'Annual Support — Year 1', description: '8x5 + quarterly on-site', unitPrice: 1200000 },
    { code: 'MES-BASE', name: 'MES Baseline', description: 'Manufacturing execution baseline', unitPrice: 2100000 },
    { code: 'SCADA-CORE', name: 'SCADA Core', description: 'SCADA supervisory core', unitPrice: 1650000 },
  ]
  for (const p of products) {
    await prisma.product.upsert({ where: { code: p.code }, update: {}, create: p })
  }

  // 6. Leads
  const leadRows = [
    { name: 'คุณอรทัย บุญมี', companyName: 'Bangna Cold Chain Co., Ltd.', source: 'LINE OA', ownerKey: 'NP' as const, status: 'New', estValue: 1200000, email: 'orathai@bangnacc.co.th', phone: '088-345-6612' },
    { name: 'คุณวีรพล จันทร์แก้ว', companyName: 'Metro Rail Facilities (MRF)', source: 'e-GP Tender', ownerKey: null, status: 'AI Sourced', estValue: 8500000, email: 'weeraphol@mrf.co.th' },
    { name: 'คุณสุภาวดี ทองดี', companyName: 'Phuket Marina Resort', source: 'Facebook Ads', ownerKey: 'PW' as const, status: 'Contacted', estValue: 950000, phone: '086-231-9021' },
    { name: 'คุณกิตติศักดิ์ พรหมมา', companyName: 'Udon Agro Industry', source: 'Website', ownerKey: 'KS' as const, status: 'Qualified', estValue: 2400000, email: 'kittisak@udonagro.co.th' },
    { name: 'คุณเมธาวี ลิ้มสกุล', companyName: 'Siam Data Center Co., Ltd.', source: 'Referral', ownerKey: 'ST' as const, status: 'Qualified', estValue: 6000000, email: 'methawee@siamdc.co.th' },
    { name: 'คุณประเสริฐ วงศ์สว่าง', companyName: 'Hatyai Municipality (RFP)', source: 'e-GP Tender', ownerKey: null, status: 'AI Sourced', estValue: 3800000, email: 'prasert@hatyai.go.th' },
    { name: 'คุณชลธิชา แสงทอง', companyName: 'Rimping Retail Group', source: 'Instagram', ownerKey: 'PW' as const, status: 'New', estValue: 480000 },
  ]
  const { scoreLead } = await import('../src/leads/lead-scoring')
  for (const l of leadRows) {
    const ownerId = l.ownerKey ? owners[l.ownerKey] : null
    await prisma.lead.upsert({
      where: { id: 'seed-lead-' + l.companyName },
      update: {},
      create: {
        id: 'seed-lead-' + l.companyName,
        name: l.name, companyName: l.companyName,
        email: l.email ?? null, phone: l.phone ?? null,
        source: l.source, ownerId, status: l.status,
        estValue: l.estValue, score: scoreLead(l),
      },
    })
  }

  // 7. Opportunities (map to existing customers)
  const deals: Array<{ code: string; title: string; ownerKey: 'NP' | 'KS' | 'PW' | 'ST'; stage: string; value: number; prob: number; close: string; aiHint?: string }> = [
    { code: 'C-1024', title: 'Factory Automation Phase 2', ownerKey: 'NP', stage: 'Negotiation', value: 4200000, prob: 70, close: '2026-08-15', aiHint: 'Send updated ROI sheet — decision meeting Friday' },
    { code: 'C-1031', title: 'Hospital ERP Integration', ownerKey: 'KS', stage: 'Proposal', value: 7800000, prob: 55, close: '2026-09-02', aiHint: 'Quotation viewed 3× today — follow up before 16:00' },
    { code: 'C-1007', title: 'Cold-chain Fleet Tracking', ownerKey: 'PW', stage: 'Qualification', value: 2100000, prob: 40, close: '2026-09-20', aiHint: 'Idle 9 days — auto follow-up scheduled tomorrow' },
    { code: 'C-1055', title: 'Solar PPA — Rooftop 2MW', ownerKey: 'ST', stage: 'Negotiation', value: 5600000, prob: 80, close: '2026-08-08' },
    { code: 'C-1042', title: 'Central Kitchen MES', ownerKey: 'NP', stage: 'Qualification', value: 1500000, prob: 30, close: '2026-10-01' },
    { code: 'C-1060', title: 'Water Treatment SCADA', ownerKey: 'KS', stage: 'Proposal', value: 3000000, prob: 60, close: '2026-09-12' },
    { code: 'C-1048', title: 'Data Center Fit-out', ownerKey: 'ST', stage: 'Proposal', value: 6000000, prob: 45, close: '2026-10-10' },
    { code: 'C-1031', title: 'Clinic Queue System', ownerKey: 'KS', stage: 'Won', value: 620000, prob: 100, close: '2026-06-24' },
    { code: 'C-1024', title: 'Smart Metering Pilot', ownerKey: 'NP', stage: 'Won', value: 1080000, prob: 100, close: '2026-07-01' },
  ]
  for (const d of deals) {
    const cust = await prisma.customer.findUnique({ where: { code: d.code } })
    if (!cust) continue
    const ownerId = owners[d.ownerKey]
    const existing = await prisma.opportunity.findFirst({ where: { title: d.title, customerId: cust.id } })
    if (existing) continue
    await prisma.opportunity.create({
      data: {
        title: d.title, customerId: cust.id, ownerId,
        stage: d.stage, value: d.value, probability: d.prob,
        closeDate: new Date(d.close), aiHint: d.aiHint ?? null,
      },
    })
  }

  // 8. Activities (this week's calendar)
  const today = new Date('2026-07-07T09:30:00.000Z')
  const day = (offset: number, h: number, m: number) => {
    const d = new Date(today.getTime())
    d.setUTCDate(d.getUTCDate() + offset)
    d.setUTCHours(h, m, 0, 0)
    return d.toISOString()
  }
  const activityRows: Array<{ type: string; title: string; ownerKey: 'NP' | 'KS' | 'PW' | 'ST'; when: string; customerCode?: string; notes?: string }> = [
    { type: 'call', title: 'Call — Krungthep Foods', ownerKey: 'NP', when: day(-1, 3, 0), customerCode: 'C-1042' },
    { type: 'visit', title: 'Site visit — Siam Precision', ownerKey: 'NP', when: day(0, 2, 30), customerCode: 'C-1024', notes: 'Walked Line 3 with คุณณัฐพงษ์. Confirmed budget ฿4.2M approved.' },
    { type: 'demo', title: 'Demo — Siam Data Center', ownerKey: 'ST', when: day(0, 7, 0), customerCode: 'C-1048' },
    { type: 'meeting', title: 'Quotation walkthrough — Thonburi', ownerKey: 'KS', when: day(1, 4, 0), customerCode: 'C-1031' },
    { type: 'call', title: 'Call — EastWater SCADA', ownerKey: 'KS', when: day(1, 9, 0), customerCode: 'C-1060' },
    { type: 'meeting', title: 'Tender briefing — Hatyai RFP', ownerKey: 'PW', when: day(2, 3, 0) },
    { type: 'call', title: 'Follow-up — Phuket Marina', ownerKey: 'PW', when: day(2, 7, 30) },
    { type: 'meeting', title: 'Negotiation — Lanna Solar PPA', ownerKey: 'ST', when: day(3, 6, 0), customerCode: 'C-1055' },
  ]
  for (const a of activityRows) {
    const ownerId = owners[a.ownerKey]
    const customer = a.customerCode ? await prisma.customer.findUnique({ where: { code: a.customerCode } }) : null
    const existing = await prisma.activity.findFirst({ where: { title: a.title, ownerId } })
    if (existing) continue
    await prisma.activity.create({
      data: {
        type: a.type, title: a.title, ownerId,
        customerId: customer?.id ?? null,
        scheduledAt: new Date(a.when), notes: a.notes ?? null,
      },
    })
  }

  // 9. Demo quotation for Thonburi Medical Hospital ERP
  const thonburi = await prisma.customer.findUnique({ where: { code: 'C-1031' } })
  const kritUser = krit
  const erpOpp = thonburi ? await prisma.opportunity.findFirst({ where: { customerId: thonburi.id, title: 'Hospital ERP Integration' } }) : null
  const erpCore = await prisma.product.findUnique({ where: { code: 'ERP-CORE' } })
  const hisInt = await prisma.product.findUnique({ where: { code: 'HIS-INT' } })
  const implMd = await prisma.product.findUnique({ where: { code: 'IMPL-MD' } })
  const supp = await prisma.product.findUnique({ where: { code: 'SUPP-Y1' } })

  if (thonburi && erpCore && hisInt && implMd && supp) {
    const existing = await prisma.quotation.findFirst({ where: { customerId: thonburi.id } })
    if (!existing) {
      const q = await prisma.quotation.create({
        data: { no: 'QT-2026-0142', customerId: thonburi.id, opportunityId: erpOpp?.id ?? null, ownerId: kritUser.id, status: 'Draft' },
      })
      const linesData = [
        { productId: erpCore.id, itemName: erpCore.name, description: '250 named users · perpetual', quantity: 1, unitPrice: erpCore.unitPrice, discountPct: 0, amount: erpCore.unitPrice, ordering: 0 },
        { productId: hisInt.id, itemName: hisInt.name, description: 'HL7 / FHIR interfaces', quantity: 1, unitPrice: hisInt.unitPrice, discountPct: 0, amount: hisInt.unitPrice, ordering: 1 },
        { productId: implMd.id, itemName: 'Implementation & Training', description: 'man-days, on-site Bangkok', quantity: 120, unitPrice: implMd.unitPrice, discountPct: 0, amount: 120 * implMd.unitPrice, ordering: 2 },
        { productId: supp.id, itemName: 'Annual Support — Year 1', description: '8×5, remote + quarterly on-site', quantity: 1, unitPrice: supp.unitPrice, discountPct: 0, amount: supp.unitPrice, ordering: 3 },
      ]
      const subtotal = linesData.reduce((a, l) => a + l.amount, 0)
      const discountAmt = Math.round(subtotal * 0.05)
      const afterDiscount = subtotal - discountAmt
      const vatAmt = Math.round(afterDiscount * 0.07)
      const version = await prisma.quotationVersion.create({
        data: {
          quotationId: q.id, versionNo: 1,
          subtotal, discountPct: 5, discountAmt, vatPct: 7, vatAmt,
          grandTotal: afterDiscount + vatAmt,
          createdById: kritUser.id,
          lines: { create: linesData },
        },
      })
      await prisma.quotation.update({ where: { id: q.id }, data: { currentVersionId: version.id } })
    }
  }

  // 10. Contract templates
  const templates: Array<{ code: string; name: string; type: string; body: string }> = [
    {
      code: 'MSA-STD', name: 'Master Service Agreement — standard', type: 'Master Service Agreement',
      body: `MASTER SERVICE AGREEMENT

This Master Service Agreement ("Agreement") is entered into on {{start_date}} between:
- Bluefish Solution Co., Ltd. ("Provider")
- {{customer_name}}, Tax ID {{customer_tax_id}}, {{customer_address}} ("Client")

Effective from {{start_date}} to {{end_date}}, for a total contract value of THB {{contract_value}}.

1. Scope of Services. Provider shall deliver services as described in Statements of Work referencing this Agreement.
2. Payment Terms. Client shall pay invoices within {{payment_days}} days of receipt.
3. Term & Termination. This Agreement remains in force until {{end_date}} unless terminated for cause with 30 days' written notice.
4. Confidentiality. Both parties agree to hold in confidence any non-public information exchanged.
5. Limitation of Liability. Provider's total aggregate liability under this Agreement is capped at 12 months' fees.
6. Governing Law. This Agreement is governed by the laws of the Kingdom of Thailand.

Signed for Provider: ____________________     Signed for Client: ____________________`,
    },
    {
      code: 'NDA-BI', name: 'Bilateral Non-Disclosure Agreement', type: 'Non-Disclosure Agreement',
      body: `NON-DISCLOSURE AGREEMENT (BILATERAL)

Between Bluefish Solution Co., Ltd. and {{customer_name}}, effective {{start_date}}.

1. Confidential Information means any non-public technical, business, or financial information disclosed.
2. Obligations: each party will (a) use Confidential Information solely for the purposes of evaluating a possible business relationship and (b) protect it with reasonable care.
3. Term. This Agreement remains in force for two (2) years from {{start_date}}.
4. Return or Destruction. Upon request, each party shall return or destroy Confidential Information within 15 days.
5. No License. Nothing herein grants any license to intellectual property.
6. Governing Law. Thailand.`,
    },
    {
      code: 'MSA-SUPP', name: 'Maintenance & Support Agreement', type: 'Maintenance & Support',
      body: `MAINTENANCE & SUPPORT AGREEMENT

Provider: Bluefish Solution Co., Ltd.
Client: {{customer_name}}, {{customer_address}}
Term: {{start_date}} to {{end_date}}
Annual Fee: THB {{contract_value}}

1. Support Hours: 8×5, response 4h, resolution 24h for critical incidents.
2. Preventive Maintenance: quarterly on-site.
3. Escalation: Level 1 helpdesk → Level 2 engineer → Level 3 subject-matter expert.
4. SLA credits: 5% credit for each 1% under 99.5% monthly uptime.
5. Renewal: this Agreement auto-renews for successive 12-month terms unless {{payment_days}} days' notice is given.`,
    },
    {
      code: 'SAAS-SUB', name: 'SaaS Subscription Agreement', type: 'SaaS Subscription',
      body: `SAAS SUBSCRIPTION AGREEMENT

Between Bluefish Solution and {{customer_name}} ("Subscriber"), effective {{start_date}}.

1. Subscription: Subscriber receives access to the Service for the term ending {{end_date}}.
2. Fees: THB {{contract_value}} billed annually.
3. Uptime: 99.5% monthly excluding scheduled maintenance.
4. Data: Subscriber owns its data; Provider processes as instructed and returns on termination.
5. Renewal: manual renewal 30 days before end date, unless auto-renew is selected.
6. Termination: 60 days' notice; unused prepaid fees are non-refundable.`,
    },
    {
      code: 'SLA-STD', name: 'Service Level Agreement', type: 'Service Level Agreement',
      body: `SERVICE LEVEL AGREEMENT

Client: {{customer_name}}
Service: {{service_name}}
Term: {{start_date}} — {{end_date}}
Value: THB {{contract_value}}

Key metrics:
- Availability: 99.5% monthly
- Response time: P1 = 30 minutes, P2 = 2h, P3 = 8h
- Resolution time: P1 = 4h, P2 = 24h, P3 = 72h
- Reporting: monthly uptime report by day 5 of following month

Penalties apply per Section 5 for missed SLAs. Governing law: Thailand.`,
    },
  ]

  const extractVariables = (body: string): string[] => {
    const set = new Set<string>()
    for (const m of body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) set.add(m[1])
    return [...set]
  }
  const renderTemplate = (body: string, values: Record<string, string>): string =>
    body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => values[k] ?? `[[${k}]]`)

  for (const t of templates) {
    const vars = extractVariables(t.body)
    await prisma.contractTemplate.upsert({
      where: { code: t.code },
      update: { body: t.body, variables: vars },
      create: { ...t, variables: vars },
    })
  }

  // 11. Seed contracts for the demo customers (mirror the prototype's list)
  const contractsSeed: Array<{ no: string; code: string; type: string; value: number; start: string; end: string; status: string; ownerKey: 'NP' | 'KS' | 'PW' | 'ST'; risk: string; step?: number; autoRenew?: boolean }> = [
    { no: 'CT-2025-0231', code: 'C-1024', type: 'Master Service Agreement', value: 8500000, start: '2025-02-01', end: '2028-01-31', status: 'Active', ownerKey: 'NP', risk: 'Low' },
    { no: 'CT-2026-0087', code: 'C-1031', type: 'Maintenance & Support', value: 1200000, start: '2025-08-01', end: '2026-07-31', status: 'Expiring', ownerKey: 'KS', risk: 'Med' },
    { no: 'CT-2026-0102', code: 'C-1007', type: 'SaaS Subscription', value: 2400000, start: '2026-07-15', end: '2028-07-14', status: 'Pending Approval', ownerKey: 'ST', risk: 'Low', step: 3 },
    { no: 'CT-2025-0198', code: 'C-1042', type: 'Software License', value: 3200000, start: '2025-09-01', end: '2026-08-31', status: 'Expiring', ownerKey: 'NP', risk: 'Med' },
    { no: 'CT-2026-0075', code: 'C-1055', type: 'Service Level Agreement', value: 950000, start: '2026-06-01', end: '2027-05-31', status: 'Signed', ownerKey: 'PW', risk: 'Low' },
    { no: 'CT-2026-0060', code: 'C-1060', type: 'Non-Disclosure Agreement', value: 0, start: '2026-01-10', end: '2029-01-09', status: 'Active', ownerKey: 'KS', risk: 'Low' },
    { no: 'CT-2024-0301', code: 'C-1012', type: 'Maintenance & Support', value: 1800000, start: '2024-03-01', end: '2026-02-28', status: 'Expired', ownerKey: 'ST', risk: 'High' },
    { no: 'CT-2026-0131', code: 'C-1007', type: 'Master Service Agreement', value: 4100000, start: '2026-07-01', end: '2029-06-30', status: 'Draft', ownerKey: 'ST', risk: 'Med' },
  ]
  const templateByType: Record<string, string> = {
    'Master Service Agreement': 'MSA-STD',
    'Maintenance & Support': 'MSA-SUPP',
    'SaaS Subscription': 'SAAS-SUB',
    'Software License': 'SAAS-SUB',
    'Non-Disclosure Agreement': 'NDA-BI',
    'Service Level Agreement': 'SLA-STD',
  }
  for (const c of contractsSeed) {
    const customer = await prisma.customer.findUnique({ where: { code: c.code } })
    if (!customer) continue
    const existing = await prisma.contract.findUnique({ where: { no: c.no } })
    if (existing) continue
    const contract = await prisma.contract.create({
      data: {
        no: c.no, customerId: customer.id, ownerId: owners[c.ownerKey],
        type: c.type, status: c.status,
        approvalStep: c.step ?? 0,
        startDate: new Date(c.start), endDate: new Date(c.end),
        value: c.value, risk: c.risk,
        signedAt: ['Signed', 'Active', 'Expiring', 'Expired', 'Renewed'].includes(c.status) ? new Date(c.start) : null,
        autoRenew: c.autoRenew ?? false,
      },
    })
    const tplCode = templateByType[c.type]
    const template = tplCode ? await prisma.contractTemplate.findUnique({ where: { code: tplCode } }) : null
    const body = template
      ? renderTemplate(template.body, {
          customer_name: customer.name,
          customer_tax_id: customer.taxId,
          customer_address: customer.address,
          start_date: c.start,
          end_date: c.end,
          contract_value: c.value.toLocaleString('en-US'),
          payment_days: '30',
          service_name: c.type,
        })
      : `${c.type} for ${customer.name}`
    const version = await prisma.contractVersion.create({
      data: {
        contractId: contract.id, versionNo: 1,
        title: `${c.type} — ${customer.name}`, body,
        templateId: template?.id ?? null,
        createdById: owners[c.ownerKey],
      },
    })
    await prisma.contract.update({ where: { id: contract.id }, data: { currentVersionId: version.id } })

    // Add a few obligations for active contracts
    if (['Active', 'Signed', 'Expiring'].includes(c.status)) {
      const monthly = c.value > 0 ? Math.round(c.value / 12) : 0
      const upcoming = new Date()
      upcoming.setDate(upcoming.getDate() + 7)
      const later = new Date()
      later.setDate(later.getDate() + 30)
      const seedObligations: Array<{ kind: string; title: string; due: Date; amount?: number }> = []
      if (monthly > 0) seedObligations.push({ kind: 'Payment', title: 'Monthly service fee', due: upcoming, amount: monthly })
      seedObligations.push({ kind: 'SLA', title: 'Monthly uptime report', due: later })
      if (c.type === 'Software License' || c.type === 'Maintenance & Support') {
        const renewalDate = new Date(c.end)
        renewalDate.setDate(renewalDate.getDate() - 90)
        seedObligations.push({ kind: 'Renewal', title: 'Renewal decision (90-day notice)', due: renewalDate })
      }
      for (const o of seedObligations) {
        await prisma.obligation.create({
          data: { contractId: contract.id, kind: o.kind, title: o.title, dueDate: o.due, amount: o.amount ?? null },
        })
      }
    }
  }

  // 12. AI prompts — version 1 for each agent.
  const promptDefs: Array<{ agentKey: string; systemPrompt: string; userTemplate: string; model: string; temperature: number }> = [
    { agentKey: 'lead_hunter', systemPrompt: `You are Bluefish's Lead Hunter agent for a Thai B2B systems integrator. The ICP is enterprise or public-sector organisations in Thailand buying manufacturing automation, hospital ERP, cold-chain, SCADA/IoT, or software licence deals in the ฿1M–฿20M range. Return STRICT JSON: { "prospects": [ { "title", "source", "budgetTHB", "icp" (0-100), "notes" } ] }.`, userTemplate: `Sources scanned:\n{{sources}}\n\nReturn JSON as specified.`, model: 'claude-haiku-4-5-20251001', temperature: 0.2 },
    { agentKey: 'sales_assistant', systemPrompt: `You are Bluefish's Sales Assistant. Given customer JSON, return STRICT JSON: { "summary", "nextBestAction", "emailDraft" }. Concise, actionable, in the language the sales rep would use.`, userTemplate: `Customer context:\n{{context}}`, model: 'claude-haiku-4-5-20251001', temperature: 0.4 },
    { agentKey: 'meeting_assistant', systemPrompt: `You are Bluefish's Meeting Assistant. Given a raw meeting transcript, return STRICT JSON: { "summary", "actionItems":[{title,owner,due}], "crmUpdates":{updateStage?, updateProbability?} }.`, userTemplate: `Transcript:\n{{transcript}}\n\nContext:\n{{context}}`, model: 'claude-haiku-4-5-20251001', temperature: 0.3 },
    { agentKey: 'document_assistant', systemPrompt: `You are Bluefish's Document Assistant. Given TOR/BOQ/RFP text, return STRICT JSON: { "classification":"tor|boq|contract|invoice|quotation|other", "fields":{budget?, timeline?, requirements?, contactName?, contactEmail?, project?, competitor?} }.`, userTemplate: `Document text (first ~4000 chars):\n{{text}}`, model: 'claude-haiku-4-5-20251001', temperature: 0.1 },
    { agentKey: 'forecast_assistant', systemPrompt: `You are Bluefish's Forecast Assistant. Given pipeline JSON, return STRICT JSON: { "summary", "winRatePrediction":[{dealTitle, predictedProb, currentProb, rationale}], "revenuePrediction":{committed, weighted, bestCase}, "riskAlerts":string[] }.`, userTemplate: `Pipeline snapshot:\n{{pipeline}}`, model: 'claude-haiku-4-5-20251001', temperature: 0.3 },
  ]
  for (const p of promptDefs) {
    await prisma.aiPromptVersion.upsert({
      where: { agentKey_version: { agentKey: p.agentKey, version: 1 } },
      update: { systemPrompt: p.systemPrompt, userTemplate: p.userTemplate, model: p.model, temperature: p.temperature, isActive: true },
      create: { agentKey: p.agentKey, version: 1, ...p, isActive: true },
    })
  }

  // ── Service department tags ──────────────────────────────────────
  const tagDefs = [
    { name: 'Managed IT',      color: '#2A6FDB', description: 'Managed infrastructure + helpdesk' },
    { name: 'Cloud Migration', color: '#6C55E0', description: 'Cloud modernisation service line' },
    { name: 'Cybersecurity',   color: '#C0392B', description: 'MDR, pen test, SOC services' },
    { name: 'ERP Consulting',  color: '#0E9C7E', description: 'SAP / Oracle / Netsuite delivery' },
    { name: 'Data & Analytics',color: '#B4650A', description: 'DW, BI, data science engagements' },
  ]
  for (const t of tagDefs) {
    await prisma.tag.upsert({
      where: { name: t.name },
      update: { color: t.color, description: t.description, kind: 'department' },
      create: { ...t, kind: 'department' },
    })
  }

  // Tag a few sample customers so the UI has content on first load
  const managedIt = await prisma.tag.findUnique({ where: { name: 'Managed IT' } })
  const cloud = await prisma.tag.findUnique({ where: { name: 'Cloud Migration' } })
  const cyber = await prisma.tag.findUnique({ where: { name: 'Cybersecurity' } })
  const erp = await prisma.tag.findUnique({ where: { name: 'ERP Consulting' } })
  const tagAssignments: Array<[string, string[]]> = [
    ['C-1024', [managedIt?.id, erp?.id].filter(Boolean) as string[]],  // Siam Precision — ERP + IT
    ['C-1031', [erp?.id, cloud?.id].filter(Boolean) as string[]],       // Thonburi Medical — ERP + Cloud
    ['C-1042', [cloud?.id].filter(Boolean) as string[]],                // Krungthep Foods — Cloud
    ['C-1048', [managedIt?.id, cyber?.id].filter(Boolean) as string[]], // TechVista — IT + Cyber
    ['C-1055', [cloud?.id].filter(Boolean) as string[]],                // Lanna Solar — Cloud
  ]
  for (const [code, tagIds] of tagAssignments) {
    const cust = await prisma.customer.findUnique({ where: { code } })
    if (cust && tagIds.length > 0) {
      await prisma.customer.update({
        where: { id: cust.id },
        data: { tags: { set: tagIds.map((id) => ({ id })) } },
      })
    }
  }

  // ── Competitor Tracker seed ──────────────────────────────────────
  const competitors = [
    { name: 'AlphaSoft ERP',      logo: 'A', color: '#2A6FDB' },
    { name: 'CloudNine Systems',  logo: 'C', color: '#7C3AED' },
    { name: 'MetricStream Co.',   logo: 'M', color: '#0E9C7E' },
    { name: 'Legacy IT (local)',  logo: 'L', color: '#D2601A' },
  ]
  const compMap = new Map<string, string>()
  for (const c of competitors) {
    const row = await prisma.competitor.upsert({
      where: { name: c.name },
      update: { logo: c.logo, color: c.color },
      create: c,
    })
    compMap.set(c.name, row.id)
  }

  const ownerMap: Record<string, string> = { KS: krit.id, NP: nattaya.id, PW: ploy.id, ST: somchai.id }
  const compContracts = [
    { customerName: 'Bangkok General Hospital',    competitor: 'AlphaSoft ERP',      service: 'Hospital ERP',        endDate: '2026-09-12', status: 'Renewal Window',     probability: 65, dealValue: 8200000, ownerI: 'KS', confidence: 'High' },
    { customerName: 'Metro Rail Facilities',       competitor: 'CloudNine Systems',  service: 'Asset Mgmt SaaS',     endDate: '2026-08-28', status: 'Proposal Submitted', probability: 55, dealValue: 5400000, ownerI: 'NP', confidence: 'Med'  },
    { customerName: 'Phuket Marina Resort',        competitor: 'Legacy IT (local)',  service: 'PMS + POS',           endDate: '2026-08-02', status: 'Negotiation',        probability: 72, dealValue: 3100000, ownerI: 'PW', confidence: 'High' },
    { customerName: 'Rimping Retail Group',        competitor: 'CloudNine Systems',  service: 'Retail ERP',          endDate: '2026-07-30', status: 'Negotiation',        probability: 60, dealValue: 4200000, ownerI: 'PW', confidence: 'High' },
    { customerName: 'Chiang Mai Logistics',        competitor: 'MetricStream Co.',   service: 'Transport Mgmt (TMS)',endDate: '2026-09-05', status: 'Renewal Window',     probability: 52, dealValue: 3700000, ownerI: 'NP', confidence: 'Med'  },
    { customerName: 'Hatyai Municipality',         competitor: 'Legacy IT (local)',  service: 'e-Gov portal',        endDate: '2026-10-10', status: 'Proposal Submitted', probability: 48, dealValue: 6800000, ownerI: 'KS', confidence: 'Med'  },
    { customerName: 'Udon Agro Industry',          competitor: 'MetricStream Co.',   service: 'Compliance suite',    endDate: '2026-11-15', status: 'Monitoring',         probability: 35, dealValue: 2600000, ownerI: 'ST', confidence: 'Med'  },
    { customerName: 'Siam Data Center',            competitor: 'AlphaSoft ERP',      service: 'DCIM platform',       endDate: '2027-01-20', status: 'Contract Identified',probability: 25, dealValue: 9500000, ownerI: 'ST', confidence: 'Low'  },
    { customerName: 'Eastern Seaboard Port',       competitor: 'CloudNine Systems',  service: 'Port ops platform',   endDate: '2027-03-22', status: 'Monitoring',         probability: 30, dealValue: 7300000, ownerI: 'KS', confidence: 'Med'  },
    { customerName: 'Nakhon Grand Plaza',          competitor: 'AlphaSoft ERP',      service: 'Retail suite',        endDate: '2027-09-18', status: 'Prospect',           probability: 15, dealValue: 5200000, ownerI: 'PW', confidence: 'Low'  },
    { customerName: 'Korat Sugar Mill',            competitor: 'Legacy IT (local)',  service: 'Plant MES',           endDate: '2026-06-20', status: 'Auto Renewed',       probability:  0, dealValue: 2900000, ownerI: 'ST', confidence: 'High' },
  ]

  // Wipe + re-seed to keep dev DB deterministic
  await prisma.competitorContract.deleteMany({ where: { customerName: { in: compContracts.map((c) => c.customerName) } } })
  for (const c of compContracts) {
    await prisma.competitorContract.create({
      data: {
        competitorId: compMap.get(c.competitor)!,
        customerName: c.customerName,
        service:      c.service,
        endDate:      new Date(c.endDate),
        status:       c.status,
        probability:  c.probability,
        dealValue:    c.dealValue,
        ownerId:      ownerMap[c.ownerI] ?? null,
        confidence:   c.confidence,
      },
    })
  }

  console.log('Seed complete.')
  console.log('Login credentials (all password: demo1234):')
  console.log('  nattaya@bluefishsolution.com  (sales_manager)')
  console.log('  krit@bluefishsolution.com     (sales_rep)')
  console.log('  admin@bluefishsolution.com    (admin)')
  console.log('  legal@bluefishsolution.com    (legal)')
  console.log('  auditor@bluefishsolution.com  (auditor)')
  console.log('  finance@bluefishsolution.com  (finance)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
