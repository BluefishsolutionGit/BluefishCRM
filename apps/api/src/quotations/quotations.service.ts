import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { nextQuotationNo } from './quotation-numbers'
import type {
  CreateQuotationDto,
  CreateVersionDto,
  QuotationApprovalDto,
  QuotationDto,
  QuotationLineDto,
  QuotationStatus,
  QuotationVersionDto,
} from '@bluefish/shared'
import type { AuditRequestContext } from '../common/request-context'

const APPROVAL_STEPS = [
  { step: 1, name: 'Sales Manager' },
  { step: 2, name: 'Country Director' },
]

function calcLine(line: { quantity: number; unitPrice: number; discountPct: number }): number {
  const raw = line.quantity * line.unitPrice
  return Math.round(raw * (1 - line.discountPct / 100))
}

@Injectable()
export class QuotationsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async list(): Promise<QuotationDto[]> {
    const rows = await this.prisma.quotation.findMany({
      include: this.includeAll(),
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((r) => this.toDto(r))
  }

  async findOne(id: string): Promise<QuotationDto> {
    const row = await this.prisma.quotation.findUnique({
      where: { id }, include: this.includeAll(),
    })
    if (!row) throw new NotFoundException(`Quotation ${id} not found`)
    return this.toDto(row)
  }

  async create(input: CreateQuotationDto, userId: string, ctx: AuditRequestContext): Promise<QuotationDto> {
    const customer = await this.prisma.customer.findUnique({ where: { id: input.customerId } })
    if (!customer) throw new NotFoundException('Customer not found')

    const no = await nextQuotationNo(this.prisma)
    const ownerId = input.ownerId ?? userId

    const q = await this.prisma.quotation.create({
      data: { no, customerId: input.customerId, opportunityId: input.opportunityId ?? null, ownerId, status: 'Draft' },
      include: this.includeAll(),
    })

    // Create initial empty version
    await this.createVersion(q.id, { lines: [], discountPct: 0, vatPct: 7 }, userId, ctx, { silent: true })

    await this.audit.log({ ...ctx, action: 'quotation.create', entity: 'quotation', entityId: q.id, after: q })
    return this.findOne(q.id)
  }

  async createVersion(quotationId: string, input: CreateVersionDto, userId: string, ctx: AuditRequestContext, opts: { silent?: boolean } = {}): Promise<QuotationDto> {
    const q = await this.prisma.quotation.findUnique({ where: { id: quotationId } })
    if (!q) throw new NotFoundException('Quotation not found')
    if (q.status !== 'Draft' && q.status !== 'Rejected') {
      throw new BadRequestException('Can only edit a quotation while it is Draft or Rejected')
    }

    const latestVersion = await this.prisma.quotationVersion.findFirst({
      where: { quotationId }, orderBy: { versionNo: 'desc' },
    })
    const nextNo = (latestVersion?.versionNo ?? 0) + 1

    const linesData = input.lines.map((l, idx) => ({
      productId: l.productId ?? null, itemName: l.itemName,
      description: l.description ?? null,
      quantity: l.quantity, unitPrice: l.unitPrice,
      discountPct: l.discountPct ?? 0,
      amount: calcLine({ quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct ?? 0 }),
      ordering: idx,
    }))

    const subtotal = linesData.reduce((a, l) => a + l.amount, 0)
    const discountPct = input.discountPct ?? 0
    const discountAmt = Math.round(subtotal * (discountPct / 100))
    const afterDiscount = subtotal - discountAmt
    const vatPct = input.vatPct ?? 7
    const vatAmt = Math.round(afterDiscount * (vatPct / 100))
    const grandTotal = afterDiscount + vatAmt

    const created = await this.prisma.quotationVersion.create({
      data: {
        quotationId, versionNo: nextNo,
        subtotal, discountPct, discountAmt, vatPct, vatAmt, grandTotal,
        terms: input.terms ?? 'Validity 30 days · Payment 30/40/30 · Delivery 16 weeks from PO',
        notes: input.notes ?? null,
        createdById: userId,
        lines: { create: linesData },
      },
    })

    await this.prisma.quotation.update({
      where: { id: quotationId },
      data: { currentVersionId: created.id, status: 'Draft', approvalStep: 0 },
    })

    if (!opts.silent) {
      await this.audit.log({ ...ctx, action: 'quotation.version.create', entity: 'quotation', entityId: quotationId, after: created, metadata: { versionNo: nextNo } })
    }

    return this.findOne(quotationId)
  }

  async submit(id: string, userId: string, ctx: AuditRequestContext): Promise<QuotationDto> {
    const q = await this.prisma.quotation.findUnique({ where: { id }, include: { currentVersion: { include: { lines: true } } } })
    if (!q) throw new NotFoundException('Quotation not found')
    if (q.status !== 'Draft' && q.status !== 'Rejected') throw new BadRequestException('Only Draft or Rejected quotations can be submitted')
    if (!q.currentVersion || q.currentVersion.lines.length === 0) throw new BadRequestException('Quotation must have at least one line item')

    // Clear previous pending approvals + create fresh chain
    await this.prisma.$transaction([
      this.prisma.quotationApproval.deleteMany({ where: { quotationId: id } }),
      ...APPROVAL_STEPS.map((s) => this.prisma.quotationApproval.create({
        data: { quotationId: id, step: s.step, stepName: s.name, decision: 'pending' },
      })),
      this.prisma.quotation.update({ where: { id }, data: { status: 'Pending Approval', approvalStep: 1 } }),
    ])
    await this.audit.log({ ...ctx, userId, action: 'quotation.submit', entity: 'quotation', entityId: id })
    return this.findOne(id)
  }

  async approve(id: string, userId: string, comment: string | undefined, ctx: AuditRequestContext): Promise<QuotationDto> {
    const q = await this.prisma.quotation.findUnique({ where: { id }, include: { approvals: true } })
    if (!q) throw new NotFoundException('Quotation not found')
    if (q.status !== 'Pending Approval') throw new BadRequestException('Only Pending Approval quotations can be approved')

    const currentApproval = q.approvals.find((a) => a.step === q.approvalStep && a.decision === 'pending')
    if (!currentApproval) throw new BadRequestException('No pending approval step for this quotation')

    await this.prisma.quotationApproval.update({
      where: { id: currentApproval.id },
      data: { decision: 'approved', approverId: userId, decidedAt: new Date(), comment: comment ?? null },
    })

    const isFinal = q.approvalStep >= APPROVAL_STEPS.length
    if (isFinal) {
      await this.prisma.quotation.update({ where: { id }, data: { status: 'Approved', approvalStep: 0 } })
    } else {
      await this.prisma.quotation.update({ where: { id }, data: { approvalStep: q.approvalStep + 1 } })
    }
    await this.audit.log({ ...ctx, userId, action: 'quotation.approve', entity: 'quotation', entityId: id, metadata: { step: q.approvalStep, isFinal } })
    return this.findOne(id)
  }

  async reject(id: string, userId: string, comment: string, ctx: AuditRequestContext): Promise<QuotationDto> {
    const q = await this.prisma.quotation.findUnique({ where: { id }, include: { approvals: true } })
    if (!q) throw new NotFoundException('Quotation not found')
    if (q.status !== 'Pending Approval') throw new BadRequestException('Only Pending Approval quotations can be rejected')

    const currentApproval = q.approvals.find((a) => a.step === q.approvalStep && a.decision === 'pending')
    if (!currentApproval) throw new BadRequestException('No pending approval step')

    await this.prisma.quotationApproval.update({
      where: { id: currentApproval.id },
      data: { decision: 'rejected', approverId: userId, decidedAt: new Date(), comment },
    })
    await this.prisma.quotation.update({ where: { id }, data: { status: 'Rejected', approvalStep: 0 } })
    await this.audit.log({ ...ctx, userId, action: 'quotation.reject', entity: 'quotation', entityId: id, metadata: { step: q.approvalStep, comment } })
    return this.findOne(id)
  }

  async markSent(id: string, ctx: AuditRequestContext): Promise<void> {
    const q = await this.prisma.quotation.findUnique({ where: { id } })
    if (!q) throw new NotFoundException('Quotation not found')
    if (q.status !== 'Approved' && q.status !== 'Sent') throw new ForbiddenException('Only Approved quotations can be sent')
    await this.prisma.quotation.update({ where: { id }, data: { status: 'Sent', sentAt: q.sentAt ?? new Date() } })
    await this.audit.log({ ...ctx, action: 'quotation.send', entity: 'quotation', entityId: id })
  }

  async currentVersionWithLines(quotationId: string) {
    const q = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        customer: true, owner: true,
        currentVersion: { include: { lines: { include: { product: true }, orderBy: { ordering: 'asc' } } } },
      },
    })
    if (!q) throw new NotFoundException('Quotation not found')
    return q
  }

  private includeAll() {
    return {
      customer: true, owner: true, opportunity: true,
      currentVersion: { include: { lines: { include: { product: true }, orderBy: { ordering: 'asc' as const } }, createdBy: true } },
      versions: { select: { id: true, versionNo: true, createdAt: true }, orderBy: { versionNo: 'desc' as const } },
      approvals: { include: { approver: true }, orderBy: { step: 'asc' as const } },
    }
  }

  private toDto = (row: {
    id: string; no: string; customerId: string; opportunityId: string | null; ownerId: string
    status: string; approvalStep: number; sentAt: Date | null; createdAt: Date; updatedAt: Date
    flowaccountId: string | null; flowaccountDocumentNumber: string | null
    flowaccountStatus: string | null; flowaccountLastSyncedAt: Date | null
    customer: { name: string }
    opportunity: { title: string } | null
    owner: { name: string }
    currentVersion: null | {
      id: string; versionNo: number; subtotal: number; discountPct: number; discountAmt: number
      vatPct: number; vatAmt: number; grandTotal: number; terms: string; notes: string | null
      createdAt: Date; createdBy: { name: string }
      lines: Array<{ id: string; productId: string | null; product: { code: string } | null; itemName: string; description: string | null; quantity: number; unitPrice: number; discountPct: number; amount: number; ordering: number }>
    }
    versions: Array<{ id: string; versionNo: number; createdAt: Date }>
    approvals: Array<{ id: string; step: number; stepName: string; decision: string; approverId: string | null; approver: { name: string } | null; decidedAt: Date | null; comment: string | null }>
  }): QuotationDto => {
    const cv = row.currentVersion
    const currentVersion: QuotationVersionDto | null = cv ? {
      id: cv.id, versionNo: cv.versionNo,
      subtotal: cv.subtotal, discountPct: cv.discountPct, discountAmt: cv.discountAmt,
      vatPct: cv.vatPct, vatAmt: cv.vatAmt, grandTotal: cv.grandTotal,
      terms: cv.terms, notes: cv.notes,
      createdAt: cv.createdAt.toISOString(), createdByName: cv.createdBy.name,
      lines: cv.lines.map((l): QuotationLineDto => ({
        id: l.id, productId: l.productId, productCode: l.product?.code ?? null,
        itemName: l.itemName, description: l.description,
        quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct,
        amount: l.amount, ordering: l.ordering,
      })),
    } : null

    return {
      id: row.id, no: row.no,
      customerId: row.customerId, customerName: row.customer.name,
      opportunityId: row.opportunityId, opportunityTitle: row.opportunity?.title ?? null,
      ownerId: row.ownerId, ownerName: row.owner.name,
      status: row.status as QuotationStatus, approvalStep: row.approvalStep,
      currentVersion,
      versions: row.versions.map((v) => ({ id: v.id, versionNo: v.versionNo, createdAt: v.createdAt.toISOString() })),
      approvals: row.approvals.map((a): QuotationApprovalDto => ({
        id: a.id, step: a.step, stepName: a.stepName,
        decision: a.decision as 'pending' | 'approved' | 'rejected',
        approverId: a.approverId, approverName: a.approver?.name ?? null,
        decidedAt: a.decidedAt?.toISOString() ?? null,
        comment: a.comment,
      })),
      sentAt: row.sentAt?.toISOString() ?? null,
      flowaccountId: row.flowaccountId,
      flowaccountDocumentNumber: row.flowaccountDocumentNumber,
      flowaccountStatus: row.flowaccountStatus,
      flowaccountLastSyncedAt: row.flowaccountLastSyncedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}
