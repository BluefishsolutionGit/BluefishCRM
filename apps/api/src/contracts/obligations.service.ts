import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { SERVICE_LINES } from '@bluefish/shared'
import type { CreateObligationDto, ObligationDto, ObligationKind } from '@bluefish/shared'
import type { AuditRequestContext } from '../common/request-context'
import { loadServiceScope, scopeArrayField } from '../common/service-scope'
import type { Request } from 'express'

const KINDS: ObligationKind[] = ['Payment', 'Delivery', 'SLA', 'Renewal', 'Warranty', 'Insurance', 'KPI']

const csvList = (v: string | string[] | undefined): string[] => {
  if (v === undefined) return []
  const arr = Array.isArray(v) ? v : v.split(',')
  return arr.map((s) => s.trim()).filter(Boolean)
}

@Injectable()
export class ObligationsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async list(req: Request, filter: { contractId?: string; from?: Date; to?: Date; status?: string; contractStatus?: string | string[]; contractService?: string | string[]; q?: string } = {}): Promise<ObligationDto[]> {
    const contractWhere: Record<string, unknown> = {}
    const cs = csvList(filter.contractStatus)
    if (cs.length === 1) contractWhere.status = cs[0]
    else if (cs.length > 1) contractWhere.status = { in: cs }
    const svc = csvList(filter.contractService).filter((s) => (SERVICE_LINES as readonly string[]).includes(s))
    if (svc.length === 1) contractWhere.serviceLines = { has: svc[0] }
    else if (svc.length > 1) contractWhere.serviceLines = { hasSome: svc }
    const scope = await loadServiceScope(this.prisma, req)
    const scopeFilter = scopeArrayField(scope, 'serviceLines')
    if (scopeFilter) Object.assign(contractWhere, scopeFilter)

    const q = filter.q?.trim()
    const where: Record<string, unknown> = {
      contractId: filter.contractId, status: filter.status,
      dueDate: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
      ...(Object.keys(contractWhere).length ? { contract: contractWhere } : {}),
    }
    if (q) {
      const contractMatch: Record<string, unknown> = {
        ...contractWhere,
        OR: [
          { no:       { contains: q, mode: 'insensitive' } },
          { type:     { contains: q, mode: 'insensitive' } },
          { customer: { name: { contains: q, mode: 'insensitive' } } },
          { customer: { code: { contains: q, mode: 'insensitive' } } },
          { currentVersion: { title: { contains: q, mode: 'insensitive' } } },
        ],
      }
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
        { contract: contractMatch },
      ]
      delete where.contract
    }

    const rows = await this.prisma.obligation.findMany({
      where,
      include: { contract: { select: { no: true } } },
      orderBy: { dueDate: 'asc' },
    })
    return rows.map((r) => this.toDto(r))
  }

  async create(contractId: string, input: CreateObligationDto, ctx: AuditRequestContext): Promise<ObligationDto> {
    if (!KINDS.includes(input.kind)) throw new BadRequestException(`Invalid kind ${input.kind}`)
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } })
    if (!contract) throw new NotFoundException('Contract not found')
    const row = await this.prisma.obligation.create({
      data: {
        contractId, kind: input.kind, title: input.title,
        dueDate: new Date(input.dueDate),
        amount: input.amount ?? null, notes: input.notes ?? null,
      },
      include: { contract: { select: { no: true } } },
    })
    await this.audit.log({ ...ctx, action: 'obligation.create', entity: 'obligation', entityId: row.id, metadata: { contractId } })
    return this.toDto(row)
  }

  async markCompleted(id: string, ctx: AuditRequestContext): Promise<ObligationDto> {
    const before = await this.prisma.obligation.findUnique({ where: { id } })
    if (!before) throw new NotFoundException('Obligation not found')
    const row = await this.prisma.obligation.update({
      where: { id }, data: { status: 'completed', completedAt: new Date() },
      include: { contract: { select: { no: true } } },
    })
    await this.audit.log({ ...ctx, action: 'obligation.complete', entity: 'obligation', entityId: id })
    return this.toDto(row)
  }

  async delete(id: string, ctx: AuditRequestContext): Promise<void> {
    const before = await this.prisma.obligation.findUnique({ where: { id } })
    if (!before) throw new NotFoundException('Obligation not found')
    await this.prisma.obligation.delete({ where: { id } })
    await this.audit.log({ ...ctx, action: 'obligation.delete', entity: 'obligation', entityId: id })
  }

  private toDto = (row: {
    id: string; contractId: string; kind: string; title: string
    dueDate: Date; amount: number | null; status: string; completedAt: Date | null; notes: string | null
    contract: { no: string }
  }): ObligationDto => ({
    id: row.id, contractId: row.contractId, contractNo: row.contract.no,
    kind: row.kind as ObligationKind, title: row.title,
    dueDate: row.dueDate.toISOString(), amount: row.amount,
    status: row.status as 'pending' | 'completed' | 'overdue',
    completedAt: row.completedAt?.toISOString() ?? null, notes: row.notes,
  })
}
