import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { CreateCustomerDto, CustomerDto, CustomerStatus, UpdateCustomerDto } from '@bluefish/shared'
import type { AuditRequestContext } from '../common/request-context'

type CustomerRow = {
  id: string; code: string; name: string; nameTh: string | null; industry: string; status: string
  ownerId: string; city: string; address: string; taxId: string; phone: string; terms: string
  openValue: number; wonValue: number; lastActivity: string; owner: { name: string }
}

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async list(query?: string): Promise<CustomerDto[]> {
    const rows = await this.prisma.customer.findMany({
      where: {
        deletedAt: null,
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { nameTh: { contains: query, mode: 'insensitive' } },
                { industry: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { owner: true },
      orderBy: { code: 'asc' },
    })
    return rows.map((c) => this.toDto(c))
  }

  async findOne(id: string): Promise<CustomerDto> {
    const c = await this.prisma.customer.findFirst({ where: { id, deletedAt: null }, include: { owner: true } })
    if (!c) throw new NotFoundException(`Customer ${id} not found`)
    return this.toDto(c)
  }

  async create(input: CreateCustomerDto, ctx: AuditRequestContext): Promise<CustomerDto> {
    const existing = await this.prisma.customer.findUnique({ where: { code: input.code } })
    if (existing) throw new ConflictException(`Customer code ${input.code} already exists`)

    const created = await this.prisma.customer.create({
      data: {
        code: input.code, name: input.name, nameTh: input.nameTh ?? null,
        industry: input.industry, status: input.status ?? 'Prospect',
        ownerId: input.ownerId, city: input.city, address: input.address, taxId: input.taxId,
        phone: input.phone, terms: input.terms,
        openValue: input.openValue ?? 0, wonValue: input.wonValue ?? 0,
        lastActivity: input.lastActivity ?? '—',
      },
      include: { owner: true },
    })
    await this.audit.log({
      userId: ctx.userId, action: 'customer.create', entity: 'customer', entityId: created.id,
      after: created, ip: ctx.ip, userAgent: ctx.userAgent,
    })
    return this.toDto(created)
  }

  async update(id: string, input: UpdateCustomerDto, ctx: AuditRequestContext): Promise<CustomerDto> {
    const before = await this.prisma.customer.findFirst({ where: { id, deletedAt: null } })
    if (!before) throw new NotFoundException(`Customer ${id} not found`)

    if (input.code && input.code !== before.code) {
      const clash = await this.prisma.customer.findUnique({ where: { code: input.code } })
      if (clash) throw new ConflictException(`Customer code ${input.code} already exists`)
    }

    const updated = await this.prisma.customer.update({
      where: { id },
      data: input,
      include: { owner: true },
    })
    await this.audit.log({
      userId: ctx.userId, action: 'customer.update', entity: 'customer', entityId: id,
      before, after: updated, ip: ctx.ip, userAgent: ctx.userAgent,
    })
    return this.toDto(updated)
  }

  async softDelete(id: string, ctx: AuditRequestContext): Promise<void> {
    const before = await this.prisma.customer.findFirst({ where: { id, deletedAt: null } })
    if (!before) throw new NotFoundException(`Customer ${id} not found`)
    await this.prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } })
    await this.audit.log({
      userId: ctx.userId, action: 'customer.delete', entity: 'customer', entityId: id,
      before, ip: ctx.ip, userAgent: ctx.userAgent,
    })
  }

  private toDto(row: CustomerRow): CustomerDto {
    return {
      id: row.id, code: row.code, name: row.name, nameTh: row.nameTh,
      industry: row.industry, status: row.status as CustomerStatus,
      ownerId: row.ownerId, ownerName: row.owner.name,
      city: row.city, address: row.address, taxId: row.taxId, phone: row.phone, terms: row.terms,
      openValue: row.openValue, wonValue: row.wonValue, lastActivity: row.lastActivity,
    }
  }
}
