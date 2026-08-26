import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { ContractTypeDto, CreateContractTypeDto, UpdateContractTypeDto } from '@bluefish/shared'
import type { AuditRequestContext } from '../common/request-context'

@Injectable()
export class ContractTypesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async list(includeInactive = false): Promise<ContractTypeDto[]> {
    const rows = await this.prisma.contractType.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { name: 'asc' },
    })
    const counts = await this.prisma.contract.groupBy({ by: ['type'], _count: { type: true } })
    const usage = new Map(counts.map((c) => [c.type, c._count.type]))
    return rows.map((r) => this.toDto(r, usage.get(r.name) ?? 0))
  }

  async create(input: CreateContractTypeDto, ctx: AuditRequestContext): Promise<ContractTypeDto> {
    const name = input.name.trim()
    if (!name) throw new BadRequestException('Name is required')
    const clash = await this.prisma.contractType.findUnique({ where: { name } })
    if (clash) throw new ConflictException(`Contract type "${name}" already exists`)
    const row = await this.prisma.contractType.create({
      data: { name, description: input.description?.trim() || null, active: input.active ?? true },
    })
    await this.audit.log({ ...ctx, action: 'contract_type.create', entity: 'contract_type', entityId: row.id, metadata: { name } })
    return this.toDto(row, 0)
  }

  async update(id: string, input: UpdateContractTypeDto, ctx: AuditRequestContext): Promise<ContractTypeDto> {
    const existing = await this.prisma.contractType.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Contract type not found')

    const data: Record<string, unknown> = {}
    if (input.name !== undefined) {
      const name = input.name.trim()
      if (!name) throw new BadRequestException('Name cannot be blank')
      if (name !== existing.name) {
        const clash = await this.prisma.contractType.findUnique({ where: { name } })
        if (clash) throw new ConflictException(`Contract type "${name}" already exists`)
      }
      data.name = name
    }
    if (input.description !== undefined) data.description = input.description?.trim() || null
    if (input.active !== undefined) data.active = input.active

    const row = await this.prisma.contractType.update({ where: { id }, data })

    // Rename cascades: propagate to Contract.type + ContractTemplate.type
    if (data.name && data.name !== existing.name) {
      await this.prisma.contract.updateMany({ where: { type: existing.name }, data: { type: row.name } })
      await this.prisma.contractTemplate.updateMany({ where: { type: existing.name }, data: { type: row.name } })
    }

    await this.audit.log({ ...ctx, action: 'contract_type.update', entity: 'contract_type', entityId: id, before: existing, after: row })
    const count = await this.prisma.contract.count({ where: { type: row.name } })
    return this.toDto(row, count)
  }

  async delete(id: string, ctx: AuditRequestContext): Promise<void> {
    const existing = await this.prisma.contractType.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Contract type not found')
    const inUse = await this.prisma.contract.count({ where: { type: existing.name } })
    if (inUse > 0) {
      throw new ConflictException(`Cannot delete "${existing.name}" — used by ${inUse} contract(s). Deactivate it instead.`)
    }
    await this.prisma.contractType.delete({ where: { id } })
    await this.audit.log({ ...ctx, action: 'contract_type.delete', entity: 'contract_type', entityId: id, metadata: { name: existing.name } })
  }

  private toDto = (row: { id: string; name: string; description: string | null; active: boolean; createdAt: Date; updatedAt: Date }, usageCount: number): ContractTypeDto => ({
    id: row.id, name: row.name, description: row.description, active: row.active, usageCount,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  })
}
