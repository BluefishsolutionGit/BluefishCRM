import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type {
  CreateCustomerVoiceDto,
  CustomerVoiceDashboardDto,
  CustomerVoiceDto,
  UpdateCustomerVoiceDto,
  VoiceKind,
  VoiceSource,
} from '@bluefish/shared'
import { VOICE_KINDS, VOICE_SOURCES } from '@bluefish/shared'
import type { AuditRequestContext } from '../common/request-context'

@Injectable()
export class CustomerVoiceService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async list(filter: {
    customerId?: string
    kind?: VoiceKind
    from?: Date
    to?: Date
    limit?: number
  } = {}): Promise<CustomerVoiceDto[]> {
    const rows = await this.prisma.customerVoice.findMany({
      where: {
        customerId: filter.customerId,
        kind: filter.kind,
        createdAt: (filter.from || filter.to) ? { gte: filter.from, lte: filter.to } : undefined,
      },
      include: { customer: true, author: true, opportunity: true },
      orderBy: { createdAt: 'desc' },
      take: filter.limit ?? 100,
    })
    return rows.map(this.toDto)
  }

  async findOne(id: string): Promise<CustomerVoiceDto> {
    const row = await this.prisma.customerVoice.findUnique({
      where: { id },
      include: { customer: true, author: true, opportunity: true },
    })
    if (!row) throw new NotFoundException(`CustomerVoice ${id} not found`)
    return this.toDto(row)
  }

  async create(input: CreateCustomerVoiceDto, ctx: AuditRequestContext): Promise<CustomerVoiceDto> {
    this.validateKindAndRating(input.kind, input.rating ?? null)
    if (!ctx.userId) throw new BadRequestException('Author required')

    const row = await this.prisma.customerVoice.create({
      data: {
        customerId: input.customerId,
        authorId: ctx.userId,
        kind: input.kind,
        rating: input.rating ?? null,
        text: input.text.trim(),
        source: input.source ?? null,
        topic: input.topic?.trim() || null,
        activityId: input.activityId ?? null,
        opportunityId: input.opportunityId ?? null,
      },
      include: { customer: true, author: true, opportunity: true },
    })
    await this.audit.log({ ...ctx, action: 'customer_voice.create', entity: 'customer_voice', entityId: row.id, after: row })
    return this.toDto(row)
  }

  async update(id: string, input: UpdateCustomerVoiceDto, ctx: AuditRequestContext): Promise<CustomerVoiceDto> {
    const before = await this.prisma.customerVoice.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`CustomerVoice ${id} not found`)

    const nextKind = (input.kind ?? before.kind) as VoiceKind
    const nextRating = input.rating !== undefined ? input.rating : before.rating
    this.validateKindAndRating(nextKind, nextRating)

    const row = await this.prisma.customerVoice.update({
      where: { id },
      data: {
        kind: input.kind,
        rating: input.rating === undefined ? undefined : input.rating,
        text: input.text?.trim(),
        source: input.source === undefined ? undefined : input.source,
        topic: input.topic === undefined ? undefined : (input.topic?.trim() || null),
        activityId: input.activityId === undefined ? undefined : input.activityId,
        opportunityId: input.opportunityId === undefined ? undefined : input.opportunityId,
      },
      include: { customer: true, author: true, opportunity: true },
    })
    await this.audit.log({ ...ctx, action: 'customer_voice.update', entity: 'customer_voice', entityId: id, before, after: row })
    return this.toDto(row)
  }

  async delete(id: string, ctx: AuditRequestContext): Promise<void> {
    const before = await this.prisma.customerVoice.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`CustomerVoice ${id} not found`)
    await this.prisma.customerVoice.delete({ where: { id } })
    await this.audit.log({ ...ctx, action: 'customer_voice.delete', entity: 'customer_voice', entityId: id, before })
  }

  /**
   * Org-wide aggregate for the Dashboard widget. Window defaults to 30 days
   * for the headline counts / NPS / CSAT; the monthly trend always covers
   * the last 12 months regardless so the chart isn't sparse for orgs that
   * log feedback infrequently.
   */
  async dashboard(windowDays: number = 30): Promise<CustomerVoiceDashboardDto> {
    const now = new Date()
    const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)
    const yearStart = new Date(now.getFullYear(), now.getMonth() - 11, 1)   // start of month, 12 months back

    const [windowRows, monthlyRows, recent] = await Promise.all([
      this.prisma.customerVoice.findMany({ where: { createdAt: { gte: windowStart } } }),
      this.prisma.customerVoice.findMany({
        where: { createdAt: { gte: yearStart } },
        select: { createdAt: true, kind: true, rating: true },
      }),
      this.prisma.customerVoice.findMany({
        include: { customer: true, author: true, opportunity: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ])

    // by kind — seed every known kind so the response shape stays stable
    const byKind = Object.fromEntries(VOICE_KINDS.map((k) => [k, 0])) as Record<VoiceKind, number>
    const bySource: Record<string, number> = {}
    const topicCounts = new Map<string, number>()
    for (const r of windowRows) {
      if ((VOICE_KINDS as readonly string[]).includes(r.kind)) byKind[r.kind as VoiceKind]++
      if (r.source) bySource[r.source] = (bySource[r.source] ?? 0) + 1
      if (r.topic) topicCounts.set(r.topic, (topicCounts.get(r.topic) ?? 0) + 1)
    }

    // NPS = %promoter (9-10) - %detractor (0-6). Passives (7-8) are ignored
    // by definition. Only kind='nps' rows with a numeric rating count.
    const npsRows = windowRows.filter((r) => r.kind === 'nps' && typeof r.rating === 'number')
    const promoters = npsRows.filter((r) => (r.rating ?? -1) >= 9).length
    const detractors = npsRows.filter((r) => (r.rating ?? 99) <= 6).length
    const npsScore = npsRows.length > 0
      ? Math.round(((promoters - detractors) / npsRows.length) * 100)
      : 0

    // CSAT avg 1-5 — only kind='csat' rows.
    const csatRows = windowRows.filter((r) => r.kind === 'csat' && typeof r.rating === 'number')
    const csatAvg = csatRows.length > 0
      ? Math.round((csatRows.reduce((s, r) => s + (r.rating ?? 0), 0) / csatRows.length) * 10) / 10
      : 0

    // Zero-fill 12 monthly buckets so the chart always has Jan..Dec (well, the
    // last 12 months in order) rather than being sparse.
    const monthly: CustomerVoiceDashboardDto['monthly'] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(yearStart.getFullYear(), yearStart.getMonth() + i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const entries = monthlyRows.filter((r) => {
        const rd = r.createdAt
        return rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth()
      })
      const npsInMonth = entries.filter((e) => e.kind === 'nps' && typeof e.rating === 'number')
      const avgNps = npsInMonth.length > 0
        ? Math.round((npsInMonth.reduce((s, e) => s + (e.rating ?? 0), 0) / npsInMonth.length) * 10) / 10
        : null
      monthly.push({ month: key, count: entries.length, avgNps })
    }

    const topTopics = [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, count]) => ({ topic, count }))

    return {
      windowDays,
      totalCount: windowRows.length,
      byKind,
      bySource,
      monthly,
      npsScore,
      npsResponses: npsRows.length,
      csatAvg,
      csatResponses: csatRows.length,
      topTopics,
      recent: recent.map(this.toDto),
    }
  }

  private validateKindAndRating(kind: VoiceKind, rating: number | null): void {
    if (!(VOICE_KINDS as readonly string[]).includes(kind)) {
      throw new BadRequestException(`Unknown voice kind "${kind}"`)
    }
    if (rating === null || rating === undefined) return
    if (kind === 'nps' && (rating < 0 || rating > 10)) {
      throw new BadRequestException('NPS rating must be 0-10')
    }
    if (kind === 'csat' && (rating < 1 || rating > 5)) {
      throw new BadRequestException('CSAT rating must be 1-5')
    }
  }

  private toDto = (row: {
    id: string; customerId: string; authorId: string
    kind: string; rating: number | null; text: string
    source: string | null; topic: string | null
    activityId: string | null; opportunityId: string | null
    createdAt: Date; updatedAt: Date
    customer: { name: string }
    author: { name: string }
    opportunity: { title: string } | null
  }): CustomerVoiceDto => ({
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer.name,
    authorId: row.authorId,
    authorName: row.author.name,
    kind: row.kind as VoiceKind,
    rating: row.rating,
    text: row.text,
    source: row.source as VoiceSource | null,
    topic: row.topic,
    activityId: row.activityId,
    opportunityId: row.opportunityId,
    opportunityTitle: row.opportunity?.title ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}
