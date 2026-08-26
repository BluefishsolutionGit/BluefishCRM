import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { SERVICE_LINES } from '@bluefish/shared'
import type { CreateCustomerDto, CustomerDto, CustomerStatus, ServiceLine, TagDto, TagKind, UpdateCustomerDto } from '@bluefish/shared'
import type { AuditRequestContext } from '../common/request-context'
import { loadServiceScope, scopeArrayField } from '../common/service-scope'
import type { Request } from 'express'

type TagRow = { id: string; name: string; color: string; kind: string; description: string | null }
type CustomerRow = {
  id: string; code: string; name: string; nameTh: string | null; industry: string; status: string
  ownerId: string; city: string; address: string; taxId: string; phone: string; terms: string
  openValue: number; wonValue: number; lastActivity: string
  primaryServiceLines: string[]
  owner: { name: string }
  tags: TagRow[]
}

const sanitizeServiceLines = (values: readonly string[] | undefined | null): ServiceLine[] => {
  if (!values) return []
  const set = new Set<ServiceLine>()
  for (const v of values) {
    if ((SERVICE_LINES as readonly string[]).includes(v)) set.add(v as ServiceLine)
  }
  return [...set]
}

const CUSTOMER_INCLUDE = { owner: true, tags: true } as const

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async list(req: Request, query?: string, tagId?: string): Promise<CustomerDto[]> {
    const scope = await loadServiceScope(this.prisma, req)
    const scopeFilter = scopeArrayField(scope, 'primaryServiceLines')
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
        ...(tagId ? { tags: { some: { id: tagId } } } : {}),
        ...(scopeFilter ?? {}),
      },
      include: CUSTOMER_INCLUDE,
      orderBy: { code: 'asc' },
    })
    return rows.map((c) => this.toDto(c))
  }

  async findOne(id: string, req: Request): Promise<CustomerDto> {
    const scope = await loadServiceScope(this.prisma, req)
    const scopeFilter = scopeArrayField(scope, 'primaryServiceLines')
    const c = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null, ...(scopeFilter ?? {}) },
      include: CUSTOMER_INCLUDE,
    })
    if (!c) throw new NotFoundException(`Customer ${id} not found`)
    return this.toDto(c)
  }

  async create(input: CreateCustomerDto, ctx: AuditRequestContext): Promise<CustomerDto> {
    const existing = await this.prisma.customer.findUnique({ where: { code: input.code } })
    if (existing) throw new ConflictException(`Customer code ${input.code} already exists`)

    const { tagIds, primaryServiceLines, ...rest } = input
    const created = await this.prisma.customer.create({
      data: {
        code: rest.code, name: rest.name, nameTh: rest.nameTh ?? null,
        industry: rest.industry, status: rest.status ?? 'Prospect',
        ownerId: rest.ownerId, city: rest.city, address: rest.address, taxId: rest.taxId,
        phone: rest.phone, terms: rest.terms,
        openValue: rest.openValue ?? 0, wonValue: rest.wonValue ?? 0,
        lastActivity: rest.lastActivity ?? '—',
        primaryServiceLines: sanitizeServiceLines(primaryServiceLines),
        ...(tagIds?.length ? { tags: { connect: tagIds.map((id) => ({ id })) } } : {}),
      },
      include: CUSTOMER_INCLUDE,
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

    const { tagIds, primaryServiceLines, ...rest } = input
    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        ...rest,
        ...(primaryServiceLines !== undefined ? { primaryServiceLines: { set: sanitizeServiceLines(primaryServiceLines) } } : {}),
        ...(tagIds !== undefined ? { tags: { set: tagIds.map((id) => ({ id })) } } : {}),
      },
      include: CUSTOMER_INCLUDE,
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
    const tags: TagDto[] = row.tags.map((t) => ({ id: t.id, name: t.name, color: t.color, kind: t.kind as TagKind, description: t.description }))
    return {
      id: row.id, code: row.code, name: row.name, nameTh: row.nameTh,
      industry: row.industry, status: row.status as CustomerStatus,
      ownerId: row.ownerId, ownerName: row.owner.name,
      city: row.city, address: row.address, taxId: row.taxId, phone: row.phone, terms: row.terms,
      openValue: row.openValue, wonValue: row.wonValue, lastActivity: row.lastActivity,
      primaryServiceLines: sanitizeServiceLines(row.primaryServiceLines),
      tags,
    }
  }
}
