import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { SERVICE_LINES } from '@bluefish/shared'
import type {
  CompetitorContractDto,
  CompetitorContractStatus,
  CompetitorConfidence,
  CompetitorDto,
  CreateCompetitorContractDto,
  CreateCompetitorDto,
  ServiceLine,
  UpdateCompetitorContractDto,
  UpdateCompetitorDto,
} from '@bluefish/shared'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { AuditRequestContext } from '../common/request-context'

const sanitizeServiceLines = (values: readonly string[] | undefined | null): ServiceLine[] => {
  if (!values) return []
  const set = new Set<ServiceLine>()
  for (const v of values) {
    if ((SERVICE_LINES as readonly string[]).includes(v)) set.add(v as ServiceLine)
  }
  return [...set]
}

type CompetitorRow = {
  id: string; name: string; logo: string; color: string
  serviceLines: string[]; product: string | null
  notes: string | null
  createdAt: Date; updatedAt: Date
}

type ContractRow = {
  id: string
  competitorId: string
  customerId: string | null
  customerName: string
  service: string
  endDate: Date
  status: string
  probability: number
  dealValue: number
  ownerId: string | null
  confidence: string
  notes: string | null
  createdAt: Date
  updatedAt: Date
  competitor: { name: string; logo: string; color: string }
  owner: { name: string } | null
}

const ACTIVE_STATUSES = ['Prospect', 'Contract Identified', 'Monitoring', 'Renewal Window', 'Proposal Submitted', 'Negotiation']

@Injectable()
export class CompetitorsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // ─── Competitors ────────────────────────────────────────────────
  async listCompetitors(filter: { service?: string } = {}): Promise<CompetitorDto[]> {
    const where: Record<string, unknown> = {}
    const svc = filter.service && (SERVICE_LINES as readonly string[]).includes(filter.service) ? filter.service : undefined
    if (svc) where.serviceLines = { has: svc }
    const [competitors, contracts] = await Promise.all([
      this.prisma.competitor.findMany({ where, orderBy: { name: 'asc' } }),
      this.prisma.competitorContract.findMany(),
    ])
    const now = new Date()
    const in90d = new Date(now.getTime() + 90 * 24 * 3600 * 1000)
    return competitors.map((c) => {
      const mine = contracts.filter((k) => k.competitorId === c.id)
      const activeContracts = mine.filter((k) => ACTIVE_STATUSES.includes(k.status) || k.status === 'Auto Renewed').length
      const expiringIn90Days = mine.filter((k) => k.endDate > now && k.endDate <= in90d && ACTIVE_STATUSES.includes(k.status)).length
      const renewedByThem = mine.filter((k) => k.status === 'Auto Renewed').length
      const inNegotiationVsUs = mine.filter((k) => ['Negotiation', 'Proposal Submitted'].includes(k.status)).length
      const totalDealValue = mine.reduce((sum, k) => sum + (k.dealValue ?? 0), 0)
      return {
        id: c.id,
        name: c.name,
        logo: c.logo,
        color: c.color,
        serviceLines: sanitizeServiceLines(c.serviceLines),
        product: c.product,
        notes: c.notes,
        metrics: { activeContracts, expiringIn90Days, renewedByThem, inNegotiationVsUs, totalDealValue },
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }
    })
  }

  async createCompetitor(input: CreateCompetitorDto, ctx: AuditRequestContext): Promise<CompetitorDto> {
    const existing = await this.prisma.competitor.findUnique({ where: { name: input.name } })
    if (existing) throw new ConflictException(`Competitor "${input.name}" already exists`)
    const row = await this.prisma.competitor.create({
      data: {
        name: input.name,
        logo: input.logo ?? input.name.slice(0, 2).toUpperCase(),
        color: input.color ?? '#5C5C74',
        serviceLines: sanitizeServiceLines(input.serviceLines),
        product: input.product?.trim() || null,
        notes: input.notes ?? null,
      },
    })
    await this.audit.log({ ...ctx, action: 'competitor.create', entity: 'competitor', entityId: row.id, after: row })
    return this.toCompetitorDtoBasic(row)
  }

  async updateCompetitor(id: string, input: UpdateCompetitorDto, ctx: AuditRequestContext): Promise<CompetitorDto> {
    const before = await this.prisma.competitor.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`Competitor ${id} not found`)
    const data: Record<string, unknown> = {}
    if (input.name !== undefined) data.name = input.name
    if (input.logo !== undefined) data.logo = input.logo
    if (input.color !== undefined) data.color = input.color
    if (input.notes !== undefined) data.notes = input.notes
    if (input.serviceLines !== undefined) data.serviceLines = { set: sanitizeServiceLines(input.serviceLines) }
    if (input.product !== undefined) data.product = input.product?.trim() || null
    const row = await this.prisma.competitor.update({ where: { id }, data })
    await this.audit.log({ ...ctx, action: 'competitor.update', entity: 'competitor', entityId: id, before, after: row })
    return this.toCompetitorDtoBasic(row)
  }

  async deleteCompetitor(id: string, ctx: AuditRequestContext): Promise<void> {
    const before = await this.prisma.competitor.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`Competitor ${id} not found`)
    await this.prisma.competitor.delete({ where: { id } })
    await this.audit.log({ ...ctx, action: 'competitor.delete', entity: 'competitor', entityId: id, before })
  }

  // ─── Competitor contracts ───────────────────────────────────────
  async listContracts(filter: { competitorId?: string; status?: string } = {}): Promise<CompetitorContractDto[]> {
    const rows = await this.prisma.competitorContract.findMany({
      where: {
        competitorId: filter.competitorId,
        status: filter.status,
      },
      include: {
        competitor: { select: { name: true, logo: true, color: true } },
        owner: { select: { name: true } },
      },
      orderBy: { endDate: 'asc' },
    })
    return rows.map((r) => this.toContractDto(r as ContractRow))
  }

  async createContract(input: CreateCompetitorContractDto, ctx: AuditRequestContext): Promise<CompetitorContractDto> {
    const competitor = await this.prisma.competitor.findUnique({ where: { id: input.competitorId } })
    if (!competitor) throw new NotFoundException(`Competitor ${input.competitorId} not found`)
    const row = await this.prisma.competitorContract.create({
      data: {
        competitorId: input.competitorId,
        customerId: input.customerId ?? null,
        customerName: input.customerName,
        service: input.service,
        endDate: new Date(input.endDate),
        status: input.status ?? 'Monitoring',
        probability: input.probability ?? 0,
        dealValue: input.dealValue ?? 0,
        ownerId: input.ownerId ?? null,
        confidence: input.confidence ?? 'Med',
        notes: input.notes ?? null,
      },
      include: {
        competitor: { select: { name: true, logo: true, color: true } },
        owner: { select: { name: true } },
      },
    })
    await this.audit.log({ ...ctx, action: 'competitor.contract.create', entity: 'competitor_contract', entityId: row.id, after: row })
    return this.toContractDto(row as ContractRow)
  }

  async updateContract(id: string, input: UpdateCompetitorContractDto, ctx: AuditRequestContext): Promise<CompetitorContractDto> {
    const before = await this.prisma.competitorContract.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`Competitor contract ${id} not found`)
    const data: Record<string, unknown> = {}
    if (input.competitorId !== undefined) data.competitorId = input.competitorId
    if (input.customerId !== undefined) data.customerId = input.customerId
    if (input.customerName !== undefined) data.customerName = input.customerName
    if (input.service !== undefined) data.service = input.service
    if (input.endDate !== undefined) data.endDate = new Date(input.endDate)
    if (input.status !== undefined) data.status = input.status
    if (input.probability !== undefined) data.probability = input.probability
    if (input.dealValue !== undefined) data.dealValue = input.dealValue
    if (input.ownerId !== undefined) data.ownerId = input.ownerId
    if (input.confidence !== undefined) data.confidence = input.confidence
    if (input.notes !== undefined) data.notes = input.notes
    const row = await this.prisma.competitorContract.update({
      where: { id },
      data,
      include: {
        competitor: { select: { name: true, logo: true, color: true } },
        owner: { select: { name: true } },
      },
    })
    await this.audit.log({ ...ctx, action: 'competitor.contract.update', entity: 'competitor_contract', entityId: id, before, after: row })
    return this.toContractDto(row as ContractRow)
  }

  async deleteContract(id: string, ctx: AuditRequestContext): Promise<void> {
    const before = await this.prisma.competitorContract.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`Competitor contract ${id} not found`)
    await this.prisma.competitorContract.delete({ where: { id } })
    await this.audit.log({ ...ctx, action: 'competitor.contract.delete', entity: 'competitor_contract', entityId: id, before })
  }

  // ─── mappers ────────────────────────────────────────────────────
  private toCompetitorDtoBasic(row: CompetitorRow): CompetitorDto {
    return {
      id: row.id,
      name: row.name,
      logo: row.logo,
      color: row.color,
      serviceLines: sanitizeServiceLines(row.serviceLines),
      product: row.product,
      notes: row.notes,
      metrics: { activeContracts: 0, expiringIn90Days: 0, renewedByThem: 0, inNegotiationVsUs: 0, totalDealValue: 0 },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private toContractDto(r: ContractRow): CompetitorContractDto {
    const now = new Date()
    const days = Math.round((r.endDate.getTime() - now.getTime()) / (24 * 3600 * 1000))
    const initials = r.owner ? r.owner.name.split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase() : null
    return {
      id: r.id,
      competitorId: r.competitorId,
      competitorName: r.competitor.name,
      competitorLogo: r.competitor.logo,
      competitorColor: r.competitor.color,
      customerId: r.customerId,
      customerName: r.customerName,
      service: r.service,
      endDate: r.endDate.toISOString(),
      daysUntilEnd: days,
      status: r.status as CompetitorContractStatus,
      probability: r.probability,
      dealValue: r.dealValue,
      ownerId: r.ownerId,
      ownerName: r.owner?.name ?? null,
      ownerInitials: initials,
      confidence: r.confidence as CompetitorConfidence,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }
  }
}
