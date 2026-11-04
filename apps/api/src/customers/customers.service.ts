import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { SERVICE_LINES } from '@bluefish/shared'
import type { CreateCustomerDto, CustomerDto, CustomerStatus, SalesTeamMemberDto, ServiceLine, TagDto, TagKind, UpdateCustomerDto } from '@bluefish/shared'
import type { AuditRequestContext } from '../common/request-context'
import { loadServiceScope, scopeArrayField } from '../common/service-scope'
import type { Request } from 'express'

type TagRow = { id: string; name: string; color: string; kind: string; description: string | null }
type CustomerRow = {
  id: string; code: string; name: string; nameTh: string | null; industry: string; status: string
  ownerId: string; city: string; address: string; taxId: string; phone: string; terms: string
  lastActivity: string
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

// openValue = sum of open opportunity values; wonValue = sum of Won opportunity values.
// Kept in sync with dashboards.service.ts.
const OPEN_STAGES = ['Qualification', 'Proposal', 'Negotiation']

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
    const ids = rows.map((r) => r.id)
    const [sums, teams] = await Promise.all([this.computeOppSums(ids), this.computeSalesTeams(ids)])
    return rows.map((c) => this.toDto(c, sums.open.get(c.id) ?? 0, sums.won.get(c.id) ?? 0, teams.get(c.id) ?? []))
  }

  async findOne(id: string, req: Request): Promise<CustomerDto> {
    const scope = await loadServiceScope(this.prisma, req)
    const scopeFilter = scopeArrayField(scope, 'primaryServiceLines')
    const c = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null, ...(scopeFilter ?? {}) },
      include: CUSTOMER_INCLUDE,
    })
    if (!c) throw new NotFoundException(`Customer ${id} not found`)
    const [{ open, won }, teams] = await Promise.all([this.oppSumsForOne(id), this.computeSalesTeams([id])])
    return this.toDto(c, open, won, teams.get(id) ?? [])
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
    return this.toDto(created, 0, 0, [])
  }

  async update(id: string, input: UpdateCustomerDto, ctx: AuditRequestContext): Promise<CustomerDto> {
    const before = await this.prisma.customer.findFirst({ where: { id, deletedAt: null } })
    if (!before) throw new NotFoundException(`Customer ${id} not found`)

    if (input.code && input.code !== before.code) {
      const clash = await this.prisma.customer.findUnique({ where: { code: input.code } })
      if (clash) throw new ConflictException(`Customer code ${input.code} already exists`)
    }

    const { tagIds, primaryServiceLines, openValue: _ov, wonValue: _wv, ...rest } = input
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
    const [{ open, won }, teams] = await Promise.all([this.oppSumsForOne(id), this.computeSalesTeams([id])])
    return this.toDto(updated, open, won, teams.get(id) ?? [])
  }

  private async computeOppSums(customerIds: string[]): Promise<{ open: Map<string, number>; won: Map<string, number> }> {
    const open = new Map<string, number>()
    const won = new Map<string, number>()
    if (customerIds.length === 0) return { open, won }
    const rows = await this.prisma.opportunity.groupBy({
      by: ['customerId', 'stage'],
      where: { customerId: { in: customerIds } },
      _sum: { value: true },
    })
    for (const r of rows) {
      const sum = r._sum.value ?? 0
      if (OPEN_STAGES.includes(r.stage)) {
        open.set(r.customerId, (open.get(r.customerId) ?? 0) + sum)
      } else if (r.stage === 'Won') {
        won.set(r.customerId, (won.get(r.customerId) ?? 0) + sum)
      }
    }
    return { open, won }
  }

  // Roll up distinct opportunity owners per customer with their open/won deal
  // counts. Sorted by total deals desc so the busiest owner surfaces first.
  private async computeSalesTeams(customerIds: string[]): Promise<Map<string, SalesTeamMemberDto[]>> {
    const out = new Map<string, SalesTeamMemberDto[]>()
    if (customerIds.length === 0) return out
    const rows = await this.prisma.opportunity.groupBy({
      by: ['customerId', 'ownerId', 'stage'],
      where: { customerId: { in: customerIds } },
      _count: { _all: true },
    })
    if (rows.length === 0) return out

    const ownerIds = [...new Set(rows.map((r) => r.ownerId))]
    const users = await this.prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, name: true, department: true },
    })
    const userById = new Map(users.map((u) => [u.id, u]))

    // (customerId → ownerId → tallies)
    const bucket = new Map<string, Map<string, { open: number; won: number }>>()
    for (const r of rows) {
      const byOwner = bucket.get(r.customerId) ?? new Map()
      const tally = byOwner.get(r.ownerId) ?? { open: 0, won: 0 }
      if (OPEN_STAGES.includes(r.stage)) tally.open += r._count._all
      else if (r.stage === 'Won') tally.won += r._count._all
      byOwner.set(r.ownerId, tally)
      bucket.set(r.customerId, byOwner)
    }

    for (const [customerId, byOwner] of bucket) {
      const members: SalesTeamMemberDto[] = []
      for (const [ownerId, tally] of byOwner) {
        const u = userById.get(ownerId)
        if (!u) continue
        members.push({ userId: u.id, name: u.name, department: u.department, openDeals: tally.open, wonDeals: tally.won })
      }
      members.sort((a, b) => (b.openDeals + b.wonDeals) - (a.openDeals + a.wonDeals) || a.name.localeCompare(b.name))
      out.set(customerId, members)
    }
    return out
  }

  private async oppSumsForOne(customerId: string): Promise<{ open: number; won: number }> {
    const [openAgg, wonAgg] = await Promise.all([
      this.prisma.opportunity.aggregate({
        where: { customerId, stage: { in: OPEN_STAGES } },
        _sum: { value: true },
      }),
      this.prisma.opportunity.aggregate({
        where: { customerId, stage: 'Won' },
        _sum: { value: true },
      }),
    ])
    return { open: openAgg._sum.value ?? 0, won: wonAgg._sum.value ?? 0 }
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

  private toDto(row: CustomerRow, openValue: number, wonValue: number, salesTeam: SalesTeamMemberDto[]): CustomerDto {
    const tags: TagDto[] = row.tags.map((t) => ({ id: t.id, name: t.name, color: t.color, kind: t.kind as TagKind, description: t.description }))
    return {
      id: row.id, code: row.code, name: row.name, nameTh: row.nameTh,
      industry: row.industry, status: row.status as CustomerStatus,
      ownerId: row.ownerId, ownerName: row.owner.name,
      city: row.city, address: row.address, taxId: row.taxId, phone: row.phone, terms: row.terms,
      openValue, wonValue, lastActivity: row.lastActivity,
      primaryServiceLines: sanitizeServiceLines(row.primaryServiceLines),
      tags, salesTeam,
    }
  }
}
