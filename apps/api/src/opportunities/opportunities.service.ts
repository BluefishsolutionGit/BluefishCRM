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
import { loadServiceScope, scopeScalarField } from '../common/service-scope'
import type { Request } from 'express'

@Injectable()
export class OpportunitiesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** Shared include shape — always resolve customer/owner/lines + the manager
   *  who last wrote the hint (raw user row; toDto extracts just the name). */
  private readonly baseInclude = {
    customer: true,
    owner: true,
    lines: { include: { product: true } },
  } as const

  private async resolveHintByName(row: { managerHintById: string | null }): Promise<string | null> {
    if (!row.managerHintById) return null
    const u = await this.prisma.user.findUnique({ where: { id: row.managerHintById }, select: { name: true } })
    return u?.name ?? null
  }

  private async resolveHintByNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const uniq = [...new Set(ids.filter((v): v is string => !!v))]
    if (uniq.length === 0) return new Map()
    const users = await this.prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } })
    return new Map(users.map((u) => [u.id, u.name]))
  }

  async list(req: Request | null, filter: { ownerId?: string; stage?: OpportunityStage; serviceOrProduct?: string } = {}): Promise<OpportunityDto[]> {
    const scopeFilter = req ? scopeScalarField(await loadServiceScope(this.prisma, req), 'serviceOrProduct') : null
    const rows = await this.prisma.opportunity.findMany({
      where: {
        ownerId: filter.ownerId,
        stage: filter.stage,
        serviceOrProduct: filter.serviceOrProduct,
        ...(scopeFilter ?? {}),
      },
      include: this.baseInclude,
      orderBy: [{ stage: 'asc' }, { value: 'desc' }],
    })
    // Batch the manager-name lookup so N opportunities → 1 query, not N.
    const nameMap = await this.resolveHintByNames(rows.map((r) => r.managerHintById))
    return rows.map((r) => this.toDto({ ...r, managerHintByName: nameMap.get(r.managerHintById ?? '') ?? null }))
  }

  async findOne(id: string, req: Request): Promise<OpportunityDto> {
    const scope = await loadServiceScope(this.prisma, req)
    const scopeFilter = scopeScalarField(scope, 'serviceOrProduct')
    const row = await this.prisma.opportunity.findFirst({
      where: { id, ...(scopeFilter ?? {}) },
      include: this.baseInclude,
    })
    if (!row) throw new NotFoundException(`Opportunity ${id} not found`)
    const managerHintByName = await this.resolveHintByName(row)
    return this.toDto({ ...row, managerHintByName })
  }

  /** Skips service scoping — used for internal reload after a mutation. */
  private async findOneUnchecked(id: string): Promise<OpportunityDto> {
    const row = await this.prisma.opportunity.findUnique({
      where: { id },
      include: this.baseInclude,
    })
    if (!row) throw new NotFoundException(`Opportunity ${id} not found`)
    const managerHintByName = await this.resolveHintByName(row)
    return this.toDto({ ...row, managerHintByName })
  }

  async create(input: CreateOpportunityDto, ctx: AuditRequestContext): Promise<OpportunityDto> {
    if (input.stage !== undefined && input.stage.trim().length === 0) throw new BadRequestException('Stage cannot be empty')
    // If a hint is supplied on create, credit the creator so the owner sees "จากคุณ X".
    const managerHintById = (input.managerHint || input.managerHintPriority) ? (ctx.userId ?? null) : null
    const row = await this.prisma.opportunity.create({
      data: {
        title: input.title, customerId: input.customerId, ownerId: input.ownerId,
        stage: input.stage ?? 'Qualification', value: input.value ?? 0,
        probability: input.probability ?? 20,
        closeDate: input.closeDate ? new Date(input.closeDate) : null,
        bidDeadline: input.bidDeadline ? new Date(input.bidDeadline) : null,
        decisionDate: input.decisionDate ? new Date(input.decisionDate) : null,
        serviceOrProduct: input.serviceOrProduct ?? null,
        competitor: input.competitor ?? null, managerHint: input.managerHint ?? null,
        managerHintPriority: input.managerHintPriority ?? null,
        managerHintById,
        notes: input.notes ?? null,
      },
      include: this.baseInclude,
    })
    await this.audit.log({ ...ctx, action: 'opportunity.create', entity: 'opportunity', entityId: row.id, after: row })
    const managerHintByName = await this.resolveHintByName(row)
    return this.toDto({ ...row, managerHintByName })
  }

  async update(id: string, input: UpdateOpportunityDto, ctx: AuditRequestContext): Promise<OpportunityDto> {
    const before = await this.prisma.opportunity.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`Opportunity ${id} not found`)
    if (input.stage !== undefined && input.stage.trim().length === 0) throw new BadRequestException('Stage cannot be empty')

    const data: Record<string, unknown> = { ...input }
    if (input.closeDate !== undefined) data.closeDate = input.closeDate ? new Date(input.closeDate) : null
    if (input.bidDeadline !== undefined) data.bidDeadline = input.bidDeadline ? new Date(input.bidDeadline) : null
    if (input.decisionDate !== undefined) data.decisionDate = input.decisionDate ? new Date(input.decisionDate) : null

    // Whenever the manager hint text/priority is touched by this update, credit the
    // current user as author. If both fields are being cleared to null/empty, clear
    // the author too — otherwise a stale name would linger on an empty hint.
    if (input.managerHint !== undefined || input.managerHintPriority !== undefined) {
      const nextText = input.managerHint !== undefined ? input.managerHint : before.managerHint
      const nextLevel = input.managerHintPriority !== undefined ? input.managerHintPriority : before.managerHintPriority
      data.managerHintById = (nextText || nextLevel) ? (ctx.userId ?? null) : null
    }

    const row = await this.prisma.opportunity.update({
      where: { id }, data,
      include: this.baseInclude,
    })

    const action = input.stage && input.stage !== before.stage ? 'opportunity.stage_change' : 'opportunity.update'
    await this.audit.log({
      ...ctx, action, entity: 'opportunity', entityId: id, before, after: row,
      metadata: action === 'opportunity.stage_change' ? { from: before.stage, to: input.stage } : undefined,
    })
    const managerHintByName = await this.resolveHintByName(row)
    return this.toDto({ ...row, managerHintByName })
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

  async forecast(req: Request): Promise<ForecastDto> {
    const scope = await loadServiceScope(this.prisma, req)
    const scopeFilter = scopeScalarField(scope, 'serviceOrProduct')
    const [opps, users] = await Promise.all([
      this.prisma.opportunity.findMany({
        where: scopeFilter ?? undefined,
        include: { owner: true },
      }),
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
    value: number; probability: number
    closeDate: Date | null; bidDeadline: Date | null; decisionDate: Date | null
    serviceOrProduct: string | null; competitor: string | null
    lostReason: string | null; wonReason: string | null
    managerHint: string | null; managerHintPriority: string | null
    managerHintById: string | null; managerHintByName: string | null
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
      bidDeadline: row.bidDeadline?.toISOString() ?? null,
      decisionDate: row.decisionDate?.toISOString() ?? null,
      serviceOrProduct: row.serviceOrProduct,
      competitor: row.competitor, lostReason: row.lostReason, wonReason: row.wonReason,
      managerHint: row.managerHint,
      managerHintPriority: (row.managerHintPriority as OpportunityDto['managerHintPriority']) ?? null,
      managerHintById: row.managerHintById,
      managerHintByName: row.managerHintByName,
      notes: row.notes,
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
