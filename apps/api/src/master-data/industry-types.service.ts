import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { CreateIndustryTypeDto, IndustryTypeDto, UpdateIndustryTypeDto } from '@bluefish/shared'
import type { AuditRequestContext } from '../common/request-context'

@Injectable()
export class IndustryTypesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async list(includeInactive = false): Promise<IndustryTypeDto[]> {
    const rows = await this.prisma.industryType.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { name: 'asc' },
    })
    const counts = await this.prisma.customer.groupBy({ by: ['industry'], _count: { industry: true } })
    const usage = new Map(counts.map((c) => [c.industry, c._count.industry]))
    return rows.map((r) => this.toDto(r, usage.get(r.name) ?? 0))
  }

  async create(input: CreateIndustryTypeDto, ctx: AuditRequestContext): Promise<IndustryTypeDto> {
    const name = input.name.trim()
    if (!name) throw new BadRequestException('Name is required')
    const clash = await this.prisma.industryType.findUnique({ where: { name } })
    if (clash) throw new ConflictException(`Industry type "${name}" already exists`)
    const row = await this.prisma.industryType.create({
      data: { name, description: input.description?.trim() || null, active: input.active ?? true },
    })
    await this.audit.log({ ...ctx, action: 'industry_type.create', entity: 'industry_type', entityId: row.id, metadata: { name } })
    return this.toDto(row, 0)
  }

  async update(id: string, input: UpdateIndustryTypeDto, ctx: AuditRequestContext): Promise<IndustryTypeDto> {
    const existing = await this.prisma.industryType.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Industry type not found')

    const data: Record<string, unknown> = {}
    if (input.name !== undefined) {
      const name = input.name.trim()
      if (!name) throw new BadRequestException('Name cannot be blank')
      if (name !== existing.name) {
        const clash = await this.prisma.industryType.findUnique({ where: { name } })
        if (clash) throw new ConflictException(`Industry type "${name}" already exists`)
      }
      data.name = name
    }
    if (input.description !== undefined) data.description = input.description?.trim() || null
    if (input.active !== undefined) data.active = input.active

    const row = await this.prisma.industryType.update({ where: { id }, data })

    // Rename cascade to Customer.industry
    if (data.name && data.name !== existing.name) {
      await this.prisma.customer.updateMany({ where: { industry: existing.name }, data: { industry: row.name } })
    }

    await this.audit.log({ ...ctx, action: 'industry_type.update', entity: 'industry_type', entityId: id, before: existing, after: row })
    const count = await this.prisma.customer.count({ where: { industry: row.name } })
    return this.toDto(row, count)
  }

  async delete(id: string, ctx: AuditRequestContext): Promise<void> {
    const existing = await this.prisma.industryType.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Industry type not found')
    const inUse = await this.prisma.customer.count({ where: { industry: existing.name } })
    if (inUse > 0) {
      throw new ConflictException(`Cannot delete "${existing.name}" — used by ${inUse} customer(s). Deactivate it instead.`)
    }
    await this.prisma.industryType.delete({ where: { id } })
    await this.audit.log({ ...ctx, action: 'industry_type.delete', entity: 'industry_type', entityId: id, metadata: { name: existing.name } })
  }

  private toDto = (row: { id: string; name: string; description: string | null; active: boolean; createdAt: Date; updatedAt: Date }, usageCount: number): IndustryTypeDto => ({
    id: row.id, name: row.name, description: row.description, active: row.active, usageCount,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  })
}
