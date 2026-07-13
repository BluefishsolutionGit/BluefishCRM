import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type {
  CreateOpportunityDto,
  ForecastDto,
  OpportunityDto,
  OpportunityLineDto,
  OpportunityStage,
  UpdateOpportunityDto,
} from '@bluefish/shared'
import type { AuditRequestContext } from '../common/request-context'

const STAGES: OpportunityStage[] = ['Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost']

@Injectable()
export class OpportunitiesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async list(filter: { ownerId?: string; stage?: OpportunityStage; serviceOrProduct?: string } = {}): Promise<OpportunityDto[]> {
    const rows = await this.prisma.opportunity.findMany({
      where: {
        ownerId: filter.ownerId,
        stage: filter.stage,
        serviceOrProduct: filter.serviceOrProduct,
      },
      include: {
        customer: true,
        owner: true,
        lines: { include: { product: true } },
      },
      orderBy: [{ stage: 'asc' }, { value: 'desc' }],
    })
    return rows.map(this.toDto)
  }

  async findOne(id: string): Promise<OpportunityDto> {
    const row = await this.prisma.opportunity.findUnique({
      where: { id },
      include: { customer: true, owner: true, lines: { include: { product: true } } },
    })
    if (!row) throw new NotFoundException(`Opportunity ${id} not found`)
    return this.toDto(row)
  }

  async create(input: CreateOpportunityDto, ctx: AuditRequestContext): Promise<OpportunityDto> {
    if (input.stage && !STAGES.includes(input.stage)) throw new BadRequestException(`Invalid stage ${input.stage}`)
    const row = await this.prisma.opportunity.create({
      data: {
        title: input.title, customerId: input.customerId, ownerId: input.ownerId,
        stage: input.stage ?? 'Qualification', value: input.value ?? 0,
        probability: input.probability ?? 20,
        closeDate: input.closeDate ? new Date(input.closeDate) : null,
        serviceOrProduct: input.serviceOrProduct ?? null,
        competitor: input.competitor ?? null, aiHint: input.aiHint ?? null,
        notes: input.notes ?? null,
      },
      include: { customer: true, owner: true, lines: { include: { product: true } } },
    })
    await this.audit.log({ ...ctx, action: 'opportunity.create', entity: 'opportunity', entityId: row.id, after: row })
    return this.toDto(row)
  }

  async update(id: string, input: UpdateOpportunityDto, ctx: AuditRequestContext): Promise<OpportunityDto> {
    const before = await this.prisma.opportunity.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`Opportunity ${id} not found`)
    if (input.stage && !STAGES.includes(input.stage)) throw new BadRequestException(`Invalid stage ${input.stage}`)

    const data: Record<string, unknown> = { ...input }
    if (input.closeDate !== undefined) data.closeDate = input.closeDate ? new Date(input.closeDate) : null

    const row = await this.prisma.opportunity.update({
      where: { id }, data,
      include: { customer: true, owner: true, lines: { include: { product: true } } },
    })

    const action = input.stage && input.stage !== before.stage ? 'opportunity.stage_change' : 'opportunity.update'
    await this.audit.log({
      ...ctx, action, entity: 'opportunity', entityId: id, before, after: row,
      metadata: action === 'opportunity.stage_change' ? { from: before.stage, to: input.stage } : undefined,
    })
    return this.toDto(row)
  }

  async delete(id: string, ctx: AuditRequestContext): Promise<void> {
    const before = await this.prisma.opportunity.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`Opportunity ${id} not found`)
    await this.prisma.opportunity.delete({ where: { id } })
    await this.audit.log({ ...ctx, action: 'opportunity.delete', entity: 'opportunity', entityId: id, before })
  }

  async setStage(id: string, stage: OpportunityStage, ctx: AuditRequestContext): Promise<OpportunityDto> {
    return this.update(id, { stage }, ctx)
  }

  async forecast(): Promise<ForecastDto> {
    const [opps, users] = await Promise.all([
      this.prisma.opportunity.findMany({ include: { owner: true } }),
      this.prisma.user.findMany({ where: { role: { name: { in: ['sales_manager', 'sales_rep'] } } }, include: { role: true } }),
    ])
    const quota = 40_000_000

    const catOf = (stage: string): 'closed' | 'commit' | 'bestCase' | 'pipeline' | 'lost' => {
      if (stage === 'Won') return 'closed'
      if (stage === 'Negotiation') return 'commit'
      if (stage === 'Proposal') return 'bestCase'
      if (stage === 'Qualification') return 'pipeline'
      return 'lost'
    }

    const totals = { closed: 0, commit: 0, bestCase: 0, pipeline: 0 }
    let weighted = 0
    for (const o of opps) {
      const c = catOf(o.stage)
      if (c === 'lost') continue
      totals[c] += o.value
      weighted += (o.value * o.probability) / 100
    }

    const byRep = users.map((u) => {
      const own = opps.filter((o) => o.ownerId === u.id)
      const closed = own.filter((o) => catOf(o.stage) === 'closed').reduce((a, o) => a + o.value, 0)
      const commit = own.filter((o) => catOf(o.stage) === 'commit').reduce((a, o) => a + o.value, 0)
      const bestCase = own.filter((o) => catOf(o.stage) === 'bestCase').reduce((a, o) => a + o.value, 0)
      const pipeline = own.filter((o) => catOf(o.stage) === 'pipeline').reduce((a, o) => a + o.value, 0)
      return { ownerId: u.id, ownerName: u.name, closed, commit, bestCase, pipeline, total: closed + commit + bestCase + pipeline }
    })

    return {
      quota, closed: totals.closed, commit: totals.commit,
      bestCase: totals.bestCase, pipeline: totals.pipeline,
      weighted, attainmentPct: Math.round(((totals.closed + totals.commit) / quota) * 100),
      byRep,
    }
  }

  private toDto = (row: {
    id: string; title: string; customerId: string; ownerId: string; stage: string
    value: number; probability: number; closeDate: Date | null
    serviceOrProduct: string | null; competitor: string | null
    lostReason: string | null; wonReason: string | null; aiHint: string | null
    notes: string | null
    createdAt: Date; updatedAt: Date
    customer: { name: string }; owner: { name: string }
    lines: Array<{ id: string; productId: string; product: { code: string; name: string }; quantity: number; unitPrice: number; discount: number }>
  }): OpportunityDto => {
    return {
      id: row.id, title: row.title,
      customerId: row.customerId, customerName: row.customer.name,
      ownerId: row.ownerId, ownerName: row.owner.name,
      stage: row.stage as OpportunityStage,
      value: row.value, probability: row.probability,
      closeDate: row.closeDate?.toISOString() ?? null,
      serviceOrProduct: row.serviceOrProduct,
      competitor: row.competitor, lostReason: row.lostReason, wonReason: row.wonReason,
      aiHint: row.aiHint, notes: row.notes,
      lines: row.lines.map((l): OpportunityLineDto => ({
        id: l.id, productId: l.productId,
        productCode: l.product.code, productName: l.product.name,
        quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount,
        amount: l.quantity * l.unitPrice - l.discount,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}
