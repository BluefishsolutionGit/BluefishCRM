import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { CreateObligationDto, ObligationDto, ObligationKind } from '@bluefish/shared'
import type { AuditRequestContext } from '../common/request-context'

const KINDS: ObligationKind[] = ['Payment', 'Delivery', 'SLA', 'Renewal', 'Warranty', 'Insurance', 'KPI']

@Injectable()
export class ObligationsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async list(filter: { contractId?: string; from?: Date; to?: Date; status?: string } = {}): Promise<ObligationDto[]> {
    const rows = await this.prisma.obligation.findMany({
      where: {
        contractId: filter.contractId, status: filter.status,
        dueDate: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
      },
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
