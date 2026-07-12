import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type {
  ActivityDto, ActivityStatus, ActivityType,
  CreateActivityDto, UpdateActivityDto,
} from '@bluefish/shared'
import type { AuditRequestContext } from '../common/request-context'

const TYPES: ActivityType[] = ['meeting', 'call', 'visit', 'demo', 'task', 'follow_up', 'email']
const STATUSES: ActivityStatus[] = ['scheduled', 'completed', 'cancelled']

@Injectable()
export class ActivitiesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async list(filter: { from?: Date; to?: Date; ownerId?: string; customerId?: string; opportunityId?: string } = {}): Promise<ActivityDto[]> {
    const rows = await this.prisma.activity.findMany({
      where: {
        ownerId: filter.ownerId,
        customerId: filter.customerId,
        opportunityId: filter.opportunityId,
        scheduledAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
      },
      include: { owner: true, customer: true, opportunity: true },
      orderBy: { scheduledAt: 'asc' },
    })
    return rows.map(this.toDto)
  }

  async findOne(id: string): Promise<ActivityDto> {
    const row = await this.prisma.activity.findUnique({
      where: { id }, include: { owner: true, customer: true, opportunity: true },
    })
    if (!row) throw new NotFoundException(`Activity ${id} not found`)
    return this.toDto(row)
  }

  async create(input: CreateActivityDto, ctx: AuditRequestContext): Promise<ActivityDto> {
    if (!TYPES.includes(input.type)) throw new BadRequestException(`Invalid activity type ${input.type}`)
    if (input.status && !STATUSES.includes(input.status)) throw new BadRequestException(`Invalid status ${input.status}`)

    const row = await this.prisma.activity.create({
      data: {
        type: input.type, title: input.title, description: input.description ?? null,
        scheduledAt: new Date(input.scheduledAt),
        durationMin: input.durationMin ?? null, ownerId: input.ownerId,
        customerId: input.customerId ?? null, opportunityId: input.opportunityId ?? null,
        status: input.status ?? 'scheduled', notes: input.notes ?? null,
      },
      include: { owner: true, customer: true, opportunity: true },
    })
    await this.audit.log({ ...ctx, action: 'activity.create', entity: 'activity', entityId: row.id, after: row })
    return this.toDto(row)
  }

  async update(id: string, input: UpdateActivityDto, ctx: AuditRequestContext): Promise<ActivityDto> {
    const before = await this.prisma.activity.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`Activity ${id} not found`)
    if (input.type && !TYPES.includes(input.type)) throw new BadRequestException(`Invalid activity type ${input.type}`)
    if (input.status && !STATUSES.includes(input.status)) throw new BadRequestException(`Invalid status ${input.status}`)

    const data: Record<string, unknown> = { ...input }
    if (input.scheduledAt !== undefined) data.scheduledAt = new Date(input.scheduledAt)

    const row = await this.prisma.activity.update({
      where: { id }, data,
      include: { owner: true, customer: true, opportunity: true },
    })
    await this.audit.log({ ...ctx, action: 'activity.update', entity: 'activity', entityId: id, before, after: row })
    return this.toDto(row)
  }

  async delete(id: string, ctx: AuditRequestContext): Promise<void> {
    const before = await this.prisma.activity.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`Activity ${id} not found`)
    await this.prisma.activity.delete({ where: { id } })
    await this.audit.log({ ...ctx, action: 'activity.delete', entity: 'activity', entityId: id, before })
  }

  private toDto = (row: {
    id: string; type: string; title: string; description: string | null
    scheduledAt: Date; durationMin: number | null; status: string; notes: string | null
    ownerId: string; customerId: string | null; opportunityId: string | null
    createdAt: Date
    owner: { name: string }
    customer: { name: string } | null
    opportunity: { title: string } | null
  }): ActivityDto => ({
    id: row.id, type: row.type as ActivityType, title: row.title, description: row.description,
    scheduledAt: row.scheduledAt.toISOString(), durationMin: row.durationMin,
    ownerId: row.ownerId, ownerName: row.owner.name,
    customerId: row.customerId, customerName: row.customer?.name ?? null,
    opportunityId: row.opportunityId, opportunityTitle: row.opportunity?.title ?? null,
    status: row.status as ActivityStatus, notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  })
}
