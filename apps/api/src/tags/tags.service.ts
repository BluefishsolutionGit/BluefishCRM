import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { CreateTagDto, TagDto, TagKind, UpdateTagDto } from '@bluefish/shared'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { AuditRequestContext } from '../common/request-context'

type TagRow = { id: string; name: string; color: string; kind: string; description: string | null }

@Injectable()
export class TagsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async list(): Promise<TagDto[]> {
    const rows = await this.prisma.tag.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { customers: true } } },
    })
    return rows.map((r) => ({ ...this.toDto(r), usageCount: r._count.customers }))
  }

  async create(input: CreateTagDto, ctx: AuditRequestContext): Promise<TagDto> {
    const existing = await this.prisma.tag.findUnique({ where: { name: input.name } })
    if (existing) throw new ConflictException(`Tag "${input.name}" already exists`)
    const row = await this.prisma.tag.create({
      data: {
        name: input.name,
        color: input.color ?? '#5C5C74',
        kind: input.kind ?? 'department',
        description: input.description ?? null,
      },
    })
    await this.audit.log({ ...ctx, action: 'tag.create', entity: 'tag', entityId: row.id, after: row })
    return this.toDto(row)
  }

  async update(id: string, input: UpdateTagDto, ctx: AuditRequestContext): Promise<TagDto> {
    const before = await this.prisma.tag.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`Tag ${id} not found`)
    const row = await this.prisma.tag.update({ where: { id }, data: input })
    await this.audit.log({ ...ctx, action: 'tag.update', entity: 'tag', entityId: id, before, after: row })
    return this.toDto(row)
  }

  async delete(id: string, ctx: AuditRequestContext): Promise<void> {
    const before = await this.prisma.tag.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`Tag ${id} not found`)
    await this.prisma.tag.delete({ where: { id } })
    await this.audit.log({ ...ctx, action: 'tag.delete', entity: 'tag', entityId: id, before })
  }

  /** Replace the full set of tags on a customer (idempotent). */
  async setCustomerTags(customerId: string, tagIds: string[], ctx: AuditRequestContext): Promise<TagDto[]> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } })
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`)
    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data: { tags: { set: tagIds.map((id) => ({ id })) } },
      include: { tags: true },
    })
    await this.audit.log({
      ...ctx, action: 'customer.tags.set', entity: 'customer', entityId: customerId,
      metadata: { tagIds },
    })
    return updated.tags.map((t) => this.toDto(t))
  }

  private toDto(row: TagRow): TagDto {
    return {
      id: row.id, name: row.name, color: row.color,
      kind: row.kind as TagKind, description: row.description,
    }
  }
}
