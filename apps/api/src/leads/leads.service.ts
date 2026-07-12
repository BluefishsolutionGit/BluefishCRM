import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { AssignmentService } from './assignment.service'
import { scoreLead } from './lead-scoring'
import { findDuplicates } from './duplicate-check'
import type {
  ConvertLeadDto,
  CreateLeadDto,
  DuplicateCheckResult,
  LeadDto,
  LeadStatus,
  UpdateLeadDto,
} from '@bluefish/shared'
import type { AuditRequestContext } from '../common/request-context'

@Injectable()
export class LeadsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private assignment: AssignmentService,
  ) {}

  async list(): Promise<LeadDto[]> {
    const rows = await this.prisma.lead.findMany({
      include: { owner: true },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    })
    return rows.map(this.toDto)
  }

  async findOne(id: string): Promise<LeadDto> {
    const row = await this.prisma.lead.findUnique({ where: { id }, include: { owner: true } })
    if (!row) throw new NotFoundException(`Lead ${id} not found`)
    return this.toDto(row)
  }

  async duplicateCheck(input: { name: string; companyName: string; email?: string; phone?: string }): Promise<DuplicateCheckResult> {
    const existing = await this.prisma.lead.findMany({
      select: { id: true, name: true, companyName: true, email: true, phone: true },
      take: 500,
    })
    return { duplicates: findDuplicates(input, existing) }
  }

  async create(input: CreateLeadDto, ctx: AuditRequestContext, options: { autoAssign?: boolean } = {}): Promise<LeadDto> {
    const dupCheck = await this.duplicateCheck({
      name: input.name, companyName: input.companyName, email: input.email, phone: input.phone,
    })
    if (dupCheck.duplicates.some((d) => d.similarity >= 0.95)) {
      throw new ConflictException(`Possible duplicate: ${dupCheck.duplicates[0].companyName}`)
    }

    const score = scoreLead(input)
    const ownerId = input.ownerId ?? (options.autoAssign ? await this.assignment.nextOwnerForLead() : null)

    const row = await this.prisma.lead.create({
      data: {
        name: input.name, companyName: input.companyName,
        email: input.email ?? null, phone: input.phone ?? null,
        source: input.source, score,
        ownerId, status: input.status ?? 'New',
        estValue: input.estValue ?? null, notes: input.notes ?? null,
      },
      include: { owner: true },
    })
    await this.audit.log({ ...ctx, action: 'lead.create', entity: 'lead', entityId: row.id, after: row })
    return this.toDto(row)
  }

  async update(id: string, input: UpdateLeadDto, ctx: AuditRequestContext): Promise<LeadDto> {
    const before = await this.prisma.lead.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`Lead ${id} not found`)
    if (before.convertedAt) throw new BadRequestException('Cannot edit a converted lead')

    const merged = { ...before, ...input }
    const score = scoreLead({
      source: merged.source, email: merged.email, phone: merged.phone,
      estValue: merged.estValue, companyName: merged.companyName,
    })

    const row = await this.prisma.lead.update({
      where: { id },
      data: { ...input, score },
      include: { owner: true },
    })
    await this.audit.log({ ...ctx, action: 'lead.update', entity: 'lead', entityId: id, before, after: row })
    return this.toDto(row)
  }

  async assign(id: string, ownerId: string | null, ctx: AuditRequestContext): Promise<LeadDto> {
    const before = await this.prisma.lead.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`Lead ${id} not found`)
    const finalOwnerId = ownerId ?? (await this.assignment.nextOwnerForLead())
    const row = await this.prisma.lead.update({
      where: { id }, data: { ownerId: finalOwnerId }, include: { owner: true },
    })
    await this.audit.log({ ...ctx, action: 'lead.assign', entity: 'lead', entityId: id, before, after: row, metadata: { ownerId: finalOwnerId } })
    return this.toDto(row)
  }

  async delete(id: string, ctx: AuditRequestContext): Promise<void> {
    const before = await this.prisma.lead.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`Lead ${id} not found`)
    await this.prisma.lead.delete({ where: { id } })
    await this.audit.log({ ...ctx, action: 'lead.delete', entity: 'lead', entityId: id, before })
  }

  async convert(id: string, input: ConvertLeadDto, ctx: AuditRequestContext): Promise<{ lead: LeadDto; opportunityId: string }> {
    const before = await this.prisma.lead.findUnique({ where: { id }, include: { owner: true } })
    if (!before) throw new NotFoundException(`Lead ${id} not found`)
    if (before.convertedAt) throw new BadRequestException('Lead is already converted')

    let customerId = input.customerId
    if (!customerId) {
      // create a minimal customer stub from the lead's company + owner
      const ownerId = before.ownerId ?? (await this.assignment.nextOwnerForLead())
      if (!ownerId) throw new BadRequestException('No available owner for new customer')
      const code = 'L-' + before.id.slice(-6).toUpperCase()
      const stub = await this.prisma.customer.create({
        data: {
          code, name: before.companyName, industry: 'Uncategorized',
          status: 'Prospect', ownerId, city: '—', address: '—',
          taxId: '—', phone: before.phone ?? '—', terms: '—',
          lastActivity: 'Converted from lead',
        },
      })
      customerId = stub.id
    }

    const opp = await this.prisma.opportunity.create({
      data: {
        title: input.title ?? `${before.companyName} — ${before.source}`,
        customerId, ownerId: before.ownerId ?? (await this.assignment.nextOwnerForLead() ?? ''),
        stage: 'Qualification',
        value: input.value ?? before.estValue ?? 0,
        probability: input.probability ?? 20,
        closeDate: input.closeDate ? new Date(input.closeDate) : null,
      },
    })
    const leadUpdated = await this.prisma.lead.update({
      where: { id },
      data: { status: 'Converted', convertedAt: new Date(), convertedOpportunityId: opp.id },
      include: { owner: true },
    })
    await this.audit.log({
      ...ctx, action: 'lead.convert', entity: 'lead', entityId: id,
      before, after: leadUpdated, metadata: { opportunityId: opp.id, customerId },
    })
    return { lead: this.toDto(leadUpdated), opportunityId: opp.id }
  }

  private toDto(row: {
    id: string; name: string; companyName: string; email: string | null; phone: string | null
    source: string; score: number; ownerId: string | null; status: string
    estValue: number | null; notes: string | null
    convertedAt: Date | null; convertedOpportunityId: string | null; createdAt: Date
    owner: { name: string } | null
  }): LeadDto {
    return {
      id: row.id, name: row.name, companyName: row.companyName,
      email: row.email, phone: row.phone, source: row.source, score: row.score,
      ownerId: row.ownerId, ownerName: row.owner?.name ?? null,
      status: row.status as LeadStatus,
      estValue: row.estValue, notes: row.notes,
      convertedAt: row.convertedAt?.toISOString() ?? null,
      convertedOpportunityId: row.convertedOpportunityId,
      createdAt: row.createdAt.toISOString(),
    }
  }
}
