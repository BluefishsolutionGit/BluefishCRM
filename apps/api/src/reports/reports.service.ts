import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { ReportDefinitionDto, ReportKey, ReportResultDto } from '@bluefish/shared'

interface ReportDef extends ReportDefinitionDto {
  run(prisma: PrismaService, filters: Record<string, string>): Promise<ReportResultDto>
}

const REPORTS: ReportDef[] = [
  {
    key: 'lead_conversion',
    name: 'Lead Conversion',
    description: 'Leads created in the period, their score, owner, status, and whether they converted.',
    columns: [
      { key: 'createdAt', label: 'Created', type: 'date' },
      { key: 'companyName', label: 'Company', type: 'string' },
      { key: 'source', label: 'Source', type: 'string' },
      { key: 'score', label: 'Score', type: 'number' },
      { key: 'owner', label: 'Owner', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'estValue', label: 'Est. value', type: 'currency' },
      { key: 'convertedAt', label: 'Converted at', type: 'date' },
    ],
    filters: [
      { key: 'from', label: 'From', type: 'date' },
      { key: 'to', label: 'To', type: 'date' },
      { key: 'source', label: 'Source', type: 'string' },
    ],
    async run(prisma, filters) {
      const where: Record<string, unknown> = {}
      if (filters.from || filters.to) {
        where.createdAt = { gte: filters.from ? new Date(filters.from) : undefined, lte: filters.to ? new Date(filters.to) : undefined }
      }
      if (filters.source) where.source = filters.source

      const leads = await prisma.lead.findMany({
        where, include: { owner: true }, orderBy: { createdAt: 'desc' },
      })
      const rows = leads.map((l) => ({
        values: {
          createdAt: l.createdAt.toISOString().slice(0, 10),
          companyName: l.companyName,
          source: l.source,
          score: l.score,
          owner: l.owner?.name ?? '—',
          status: l.status,
          estValue: l.estValue ?? 0,
          convertedAt: l.convertedAt?.toISOString().slice(0, 10) ?? '',
        },
      }))
      const converted = leads.filter((l) => l.status === 'Converted').length
      return {
        key: 'lead_conversion', generatedAt: new Date().toISOString(), filters, rows,
        totals: { leads: leads.length, converted, conversionRatePct: leads.length ? Math.round((converted / leads.length) * 100) : 0 },
      }
    },
  },
  {
    key: 'activity_summary',
    name: 'Activity Summary',
    description: 'Activities logged over the period, grouped by rep and type.',
    columns: [
      { key: 'scheduledAt', label: 'Scheduled', type: 'date' },
      { key: 'type', label: 'Type', type: 'string' },
      { key: 'title', label: 'Title', type: 'string' },
      { key: 'owner', label: 'Owner', type: 'string' },
      { key: 'customer', label: 'Customer', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
    ],
    filters: [
      { key: 'from', label: 'From', type: 'date' },
      { key: 'to', label: 'To', type: 'date' },
      { key: 'type', label: 'Type', type: 'select', options: ['meeting', 'call', 'visit', 'demo', 'task', 'follow_up', 'email'] },
    ],
    async run(prisma, filters) {
      const where: Record<string, unknown> = {}
      if (filters.from || filters.to) {
        where.scheduledAt = { gte: filters.from ? new Date(filters.from) : undefined, lte: filters.to ? new Date(filters.to) : undefined }
      }
      if (filters.type) where.type = filters.type

      const items = await prisma.activity.findMany({
        where, include: { owner: true, customer: true }, orderBy: { scheduledAt: 'asc' },
      })
      const rows = items.map((a) => ({
        values: {
          scheduledAt: a.scheduledAt.toISOString().slice(0, 16).replace('T', ' '),
          type: a.type, title: a.title,
          owner: a.owner.name, customer: a.customer?.name ?? '—',
          status: a.status,
        },
      }))
      const byStatus = { scheduled: 0, completed: 0, cancelled: 0 }
      for (const a of items) byStatus[a.status as keyof typeof byStatus] = (byStatus[a.status as keyof typeof byStatus] ?? 0) + 1
      return {
        key: 'activity_summary', generatedAt: new Date().toISOString(), filters, rows,
        totals: { total: items.length, ...byStatus },
      }
    },
  },
  {
    key: 'opportunity_pipeline',
    name: 'Opportunity Pipeline',
    description: 'All opportunities with stage, value, probability, and close date.',
    columns: [
      { key: 'title', label: 'Opportunity', type: 'string' },
      { key: 'customer', label: 'Customer', type: 'string' },
      { key: 'owner', label: 'Owner', type: 'string' },
      { key: 'stage', label: 'Stage', type: 'string' },
      { key: 'value', label: 'Value', type: 'currency' },
      { key: 'probability', label: 'Prob %', type: 'number' },
      { key: 'weighted', label: 'Weighted', type: 'currency' },
      { key: 'closeDate', label: 'Close', type: 'date' },
    ],
    filters: [
      { key: 'stage', label: 'Stage', type: 'select', options: ['Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost'] },
    ],
    async run(prisma, filters) {
      const where: Record<string, unknown> = {}
      if (filters.stage) where.stage = filters.stage
      const opps = await prisma.opportunity.findMany({
        where, include: { owner: true, customer: true }, orderBy: { value: 'desc' },
      })
      const rows = opps.map((o) => ({
        values: {
          title: o.title, customer: o.customer.name, owner: o.owner.name,
          stage: o.stage, value: o.value,
          probability: o.probability,
          weighted: Math.round((o.value * o.probability) / 100),
          closeDate: o.closeDate?.toISOString().slice(0, 10) ?? '',
        },
      }))
      return {
        key: 'opportunity_pipeline', generatedAt: new Date().toISOString(), filters, rows,
        totals: { totalValue: opps.reduce((a, o) => a + o.value, 0), weighted: opps.reduce((a, o) => a + (o.value * o.probability) / 100, 0) },
      }
    },
  },
  {
    key: 'customer_overview',
    name: 'Customer Overview',
    description: 'Customers with open pipeline, won value, and owner.',
    columns: [
      { key: 'code', label: 'Code', type: 'string' },
      { key: 'name', label: 'Customer', type: 'string' },
      { key: 'industry', label: 'Industry', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'owner', label: 'Owner', type: 'string' },
      { key: 'openValue', label: 'Open', type: 'currency' },
      { key: 'wonValue', label: 'Won', type: 'currency' },
      { key: 'lastActivity', label: 'Last activity', type: 'string' },
    ],
    filters: [
      { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Prospect', 'Inactive'] },
      { key: 'industry', label: 'Industry', type: 'string' },
    ],
    async run(prisma, filters) {
      const where: Record<string, unknown> = { deletedAt: null }
      if (filters.status) where.status = filters.status
      if (filters.industry) where.industry = { contains: filters.industry, mode: 'insensitive' }
      const rows = (await prisma.customer.findMany({ where, include: { owner: true } })).map((c) => ({
        values: {
          code: c.code, name: c.name, industry: c.industry, status: c.status,
          owner: c.owner.name, openValue: c.openValue, wonValue: c.wonValue,
          lastActivity: c.lastActivity,
        },
      }))
      return {
        key: 'customer_overview', generatedAt: new Date().toISOString(), filters, rows,
        totals: {
          total: rows.length,
          openValue: rows.reduce((a, r) => a + (r.values.openValue as number), 0),
          wonValue: rows.reduce((a, r) => a + (r.values.wonValue as number), 0),
        },
      }
    },
  },
  {
    key: 'contract_status',
    name: 'Contract Status',
    description: 'All contracts with status, value, dates, and risk.',
    columns: [
      { key: 'no', label: 'Contract #', type: 'string' },
      { key: 'customer', label: 'Party', type: 'string' },
      { key: 'type', label: 'Type', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'risk', label: 'Risk', type: 'string' },
      { key: 'value', label: 'Value', type: 'currency' },
      { key: 'startDate', label: 'Start', type: 'date' },
      { key: 'endDate', label: 'End', type: 'date' },
    ],
    filters: [
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'risk', label: 'Risk', type: 'select', options: ['Low', 'Med', 'High'] },
    ],
    async run(prisma, filters) {
      const where: Record<string, unknown> = {}
      if (filters.status) where.status = filters.status
      if (filters.risk) where.risk = filters.risk
      const contracts = await prisma.contract.findMany({ where, include: { customer: true }, orderBy: { endDate: 'asc' } })
      const rows = contracts.map((c) => ({
        values: {
          no: c.no, customer: c.customer.name, type: c.type,
          status: c.status, risk: c.risk, value: c.value,
          startDate: c.startDate?.toISOString().slice(0, 10) ?? '',
          endDate: c.endDate?.toISOString().slice(0, 10) ?? '',
        },
      }))
      const byStatus: Record<string, number> = {}
      for (const c of contracts) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1
      return {
        key: 'contract_status', generatedAt: new Date().toISOString(), filters, rows,
        totals: { total: contracts.length, value: contracts.reduce((a, c) => a + c.value, 0), ...byStatus },
      }
    },
  },
]

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  list(): ReportDefinitionDto[] {
    return REPORTS.map(({ run: _run, ...def }) => def)
  }

  findDef(key: ReportKey): ReportDef {
    const def = REPORTS.find((r) => r.key === key)
    if (!def) throw new BadRequestException(`Unknown report "${key}"`)
    return def
  }

  async run(key: ReportKey, filters: Record<string, string>): Promise<ReportResultDto> {
    const def = this.findDef(key)
    return def.run(this.prisma, filters)
  }
}
