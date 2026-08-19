import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { PERMISSIONS, permissionsFor, type Permission } from '../auth/permissions'
import { ContractTemplatesService } from './templates.service'
import { analyzeContractText, overallRisk } from './risk-detection'
import { nextContractNo } from './contract-numbers'
import { SERVICE_LINES } from '@bluefish/shared'
import type {
  ContractApprovalDto,
  ContractDto,
  ContractRiskFindingDto,
  ContractStatus,
  ContractVersionDto,
  CreateContractDto,
  CreateContractFromTemplateDto,
  ObligationDto,
  ObligationKind,
  RiskLevel,
  ServiceLine,
  UpdateContractDto,
} from '@bluefish/shared'

const sanitizeServiceLines = (values: readonly string[] | undefined | null): ServiceLine[] => {
  if (!values) return []
  const set = new Set<ServiceLine>()
  for (const v of values) {
    if ((SERVICE_LINES as readonly string[]).includes(v)) set.add(v as ServiceLine)
  }
  return [...set]
}

const toList = (v: string | string[] | undefined): string[] => {
  if (v === undefined) return []
  const arr = Array.isArray(v) ? v : v.split(',')
  return arr.map((s) => s.trim()).filter(Boolean)
}
import type { AuditRequestContext } from '../common/request-context'

const APPROVAL_CHAIN = [
  { step: 1, name: 'Legal' },
  { step: 2, name: 'Finance' },
  { step: 3, name: 'Executive' },
  { step: 4, name: 'Sign' },
]

const STEP_PERMISSION: Record<string, Permission | 'any'> = {
  Legal: PERMISSIONS.CONTRACT_APPROVE_LEGAL,
  Finance: PERMISSIONS.CONTRACT_APPROVE_FINANCE,
  Executive: PERMISSIONS.CONTRACT_APPROVE_EXEC,
  Sign: 'any',
}

@Injectable()
export class ContractsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private templates: ContractTemplatesService,
  ) {}

  async list(filter: { status?: string | string[]; customerId?: string; service?: string | string[] } = {}): Promise<ContractDto[]> {
    const where: Record<string, unknown> = {}
    if (filter.customerId) where.customerId = filter.customerId
    const statuses = toList(filter.status)
    if (statuses.length === 1) where.status = statuses[0]
    else if (statuses.length > 1) where.status = { in: statuses }
    const services = toList(filter.service).filter((s) => (SERVICE_LINES as readonly string[]).includes(s))
    if (services.length === 1) where.serviceLines = { has: services[0] }
    else if (services.length > 1) where.serviceLines = { hasSome: services }
    const rows = await this.prisma.contract.findMany({
      where,
      include: this.includeAll(),
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((r) => this.toDto(r))
  }

  async findOne(id: string): Promise<ContractDto> {
    const row = await this.prisma.contract.findUnique({ where: { id }, include: this.includeAll() })
    if (!row) throw new NotFoundException('Contract not found')
    return this.toDto(row)
  }

  async createFromTemplate(input: CreateContractFromTemplateDto, userId: string, ctx: AuditRequestContext): Promise<ContractDto> {
    const template = await this.prisma.contractTemplate.findUnique({ where: { id: input.templateId } })
    if (!template) throw new NotFoundException('Template not found')
    const customer = await this.prisma.customer.findUnique({ where: { id: input.customerId } })
    if (!customer) throw new NotFoundException('Customer not found')

    const values: Record<string, string> = {
      customer_name: customer.name, customer_tax_id: customer.taxId, customer_address: customer.address,
      contract_value: (input.value ?? 0).toLocaleString('en-US'),
      start_date: input.startDate ?? '', end_date: input.endDate ?? '',
      payment_days: '30', service_name: template.type,
      ...(input.variables ?? {}),
    }
    const body = this.templates.render(template.body, values)

    return this.createInternal({
      customerId: input.customerId, opportunityId: input.opportunityId,
      type: template.type, title: `${template.type} — ${customer.name}`, body,
      value: input.value, startDate: input.startDate, endDate: input.endDate,
      templateId: template.id, autoRenew: input.autoRenew,
      serviceLines: sanitizeServiceLines(input.serviceLines),
    }, userId, ctx)
  }

  async create(input: CreateContractDto, userId: string, ctx: AuditRequestContext): Promise<ContractDto> {
    const customer = await this.prisma.customer.findUnique({ where: { id: input.customerId } })
    if (!customer) throw new NotFoundException('Customer not found')
    return this.createInternal({
      customerId: input.customerId, opportunityId: input.opportunityId, type: input.type,
      title: input.title ?? `${input.type} — ${customer.name}`,
      body: input.body ?? `${input.type} for ${customer.name}. Standard terms apply.`,
      value: input.value, startDate: input.startDate, endDate: input.endDate,
      autoRenew: input.autoRenew,
      serviceLines: sanitizeServiceLines(input.serviceLines),
    }, userId, ctx)
  }

  private async createInternal(data: {
    customerId: string; opportunityId?: string; type: string; title: string; body: string
    value?: number; startDate?: string; endDate?: string; templateId?: string; autoRenew?: boolean
    serviceLines?: ServiceLine[]
  }, userId: string, ctx: AuditRequestContext): Promise<ContractDto> {
    const no = await nextContractNo(this.prisma)
    const contract = await this.prisma.contract.create({
      data: {
        no, customerId: data.customerId, opportunityId: data.opportunityId ?? null, ownerId: userId,
        type: data.type, status: 'Draft', autoRenew: data.autoRenew ?? false,
        serviceLines: data.serviceLines ?? [],
        value: data.value ?? 0,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
    })
    const version = await this.prisma.contractVersion.create({
      data: {
        contractId: contract.id, versionNo: 1,
        title: data.title, body: data.body,
        templateId: data.templateId ?? null,
        createdById: userId,
      },
    })
    await this.prisma.contract.update({ where: { id: contract.id }, data: { currentVersionId: version.id } })
    await this.runRiskAnalysis(contract.id, data.body)
    await this.audit.log({ ...ctx, action: 'contract.create', entity: 'contract', entityId: contract.id, metadata: { no, templateId: data.templateId } })
    return this.findOne(contract.id)
  }

  async update(id: string, input: UpdateContractDto, userId: string, ctx: AuditRequestContext): Promise<ContractDto> {
    const contract = await this.prisma.contract.findUnique({ where: { id }, include: { currentVersion: true } })
    if (!contract) throw new NotFoundException('Contract not found')
    if (contract.status !== 'Draft' && (input.title || input.body)) {
      throw new BadRequestException('Body/title can only be edited while contract is Draft')
    }
    const before = { ...contract }

    const scalarUpdate: Record<string, unknown> = {}
    if (input.type !== undefined) scalarUpdate.type = input.type
    if (input.value !== undefined) scalarUpdate.value = input.value
    if (input.risk !== undefined) scalarUpdate.risk = input.risk
    if (input.autoRenew !== undefined) scalarUpdate.autoRenew = input.autoRenew
    if (input.startDate !== undefined) scalarUpdate.startDate = input.startDate ? new Date(input.startDate) : null
    if (input.endDate !== undefined) scalarUpdate.endDate = input.endDate ? new Date(input.endDate) : null
    if (input.serviceLines !== undefined) scalarUpdate.serviceLines = { set: sanitizeServiceLines(input.serviceLines) }
    if (Object.keys(scalarUpdate).length) {
      await this.prisma.contract.update({ where: { id }, data: scalarUpdate })
    }

    if ((input.title || input.body) && contract.currentVersion) {
      const nextVersion = await this.prisma.contractVersion.create({
        data: {
          contractId: id, versionNo: (await this.latestVersionNo(id)) + 1,
          title: input.title ?? contract.currentVersion.title,
          body: input.body ?? contract.currentVersion.body,
          templateId: contract.currentVersion.templateId,
          createdById: userId,
        },
      })
      await this.prisma.contract.update({ where: { id }, data: { currentVersionId: nextVersion.id } })
      if (input.body) await this.runRiskAnalysis(id, input.body)
    }

    await this.audit.log({ ...ctx, action: 'contract.update', entity: 'contract', entityId: id, before, after: await this.prisma.contract.findUnique({ where: { id } }) })
    return this.findOne(id)
  }

  async submit(id: string, userId: string, ctx: AuditRequestContext): Promise<ContractDto> {
    const c = await this.prisma.contract.findUnique({ where: { id } })
    if (!c) throw new NotFoundException()
    if (c.status !== 'Draft' && c.status !== 'Under Review') throw new BadRequestException('Only Draft or Under Review contracts can be submitted')
    await this.prisma.$transaction([
      this.prisma.contractApproval.deleteMany({ where: { contractId: id } }),
      ...APPROVAL_CHAIN.map((s) => this.prisma.contractApproval.create({ data: { contractId: id, step: s.step, stepName: s.name } })),
      this.prisma.contract.update({ where: { id }, data: { status: 'Pending Approval', approvalStep: 1 } }),
    ])
    await this.audit.log({ ...ctx, userId, action: 'contract.submit', entity: 'contract', entityId: id })
    return this.findOne(id)
  }

  async approve(id: string, userId: string, userRole: string, comment: string | undefined, ctx: AuditRequestContext): Promise<ContractDto> {
    const c = await this.prisma.contract.findUnique({ where: { id }, include: { approvals: true } })
    if (!c) throw new NotFoundException()
    if (c.status !== 'Pending Approval') throw new BadRequestException('Only Pending Approval contracts can be approved')

    const pending = c.approvals.find((a) => a.step === c.approvalStep && a.decision === 'pending')
    if (!pending) throw new BadRequestException('No pending approval step')

    const required = STEP_PERMISSION[pending.stepName]
    const perms = permissionsFor(userRole)
    const canApprove = required === 'any'
      ? perms.some((p) => p === PERMISSIONS.CONTRACT_APPROVE_LEGAL || p === PERMISSIONS.CONTRACT_APPROVE_FINANCE || p === PERMISSIONS.CONTRACT_APPROVE_EXEC)
      : perms.includes(required)
    if (!canApprove) throw new ForbiddenException(`Your role does not have permission to approve the "${pending.stepName}" step`)

    await this.prisma.contractApproval.update({
      where: { id: pending.id },
      data: { decision: 'approved', approverId: userId, decidedAt: new Date(), comment: comment ?? null },
    })

    const nextStep = c.approvalStep + 1
    const isFinal = nextStep > APPROVAL_CHAIN.length
    if (isFinal) {
      // Final step is 'Sign' — auto-mark as Signed + Active
      await this.prisma.contract.update({
        where: { id },
        data: { status: 'Signed', approvalStep: 0, signedAt: new Date() },
      })
      // Auto-activate if start date has passed
      const contract = await this.prisma.contract.findUnique({ where: { id } })
      if (contract && contract.startDate && contract.startDate <= new Date()) {
        await this.prisma.contract.update({ where: { id }, data: { status: 'Active' } })
      }
    } else {
      await this.prisma.contract.update({ where: { id }, data: { approvalStep: nextStep } })
    }

    await this.audit.log({ ...ctx, userId, action: 'contract.approve', entity: 'contract', entityId: id, metadata: { step: c.approvalStep, stepName: pending.stepName, isFinal } })
    return this.findOne(id)
  }

  async reject(id: string, userId: string, userRole: string, comment: string, ctx: AuditRequestContext): Promise<ContractDto> {
    const c = await this.prisma.contract.findUnique({ where: { id }, include: { approvals: true } })
    if (!c) throw new NotFoundException()
    if (c.status !== 'Pending Approval') throw new BadRequestException('Only Pending Approval contracts can be rejected')
    const pending = c.approvals.find((a) => a.step === c.approvalStep && a.decision === 'pending')
    if (!pending) throw new BadRequestException('No pending step')

    const required = STEP_PERMISSION[pending.stepName]
    const perms = permissionsFor(userRole)
    const canReject = required === 'any'
      ? perms.some((p) => p === PERMISSIONS.CONTRACT_APPROVE_LEGAL || p === PERMISSIONS.CONTRACT_APPROVE_FINANCE || p === PERMISSIONS.CONTRACT_APPROVE_EXEC)
      : perms.includes(required)
    if (!canReject) throw new ForbiddenException(`Your role does not have permission to reject the "${pending.stepName}" step`)
    await this.prisma.contractApproval.update({
      where: { id: pending.id },
      data: { decision: 'rejected', approverId: userId, decidedAt: new Date(), comment },
    })
    await this.prisma.contract.update({ where: { id }, data: { status: 'Under Review', approvalStep: 0 } })
    await this.audit.log({ ...ctx, userId, action: 'contract.reject', entity: 'contract', entityId: id, metadata: { step: c.approvalStep, stepName: pending.stepName, comment } })
    return this.findOne(id)
  }

  async terminate(id: string, comment: string, ctx: AuditRequestContext): Promise<ContractDto> {
    const c = await this.prisma.contract.findUnique({ where: { id } })
    if (!c) throw new NotFoundException()
    await this.prisma.contract.update({ where: { id }, data: { status: 'Terminated', terminatedAt: new Date() } })
    await this.audit.log({ ...ctx, action: 'contract.terminate', entity: 'contract', entityId: id, metadata: { comment } })
    return this.findOne(id)
  }

  async renew(id: string, input: { newStart: string; newEnd: string; newValue?: number }, userId: string, ctx: AuditRequestContext): Promise<ContractDto> {
    const source = await this.prisma.contract.findUnique({ where: { id }, include: { currentVersion: true } })
    if (!source) throw new NotFoundException()
    if (!source.currentVersion) throw new BadRequestException('Source contract has no version')

    const created = await this.createInternal({
      customerId: source.customerId, opportunityId: source.opportunityId ?? undefined,
      type: source.type, title: source.currentVersion.title, body: source.currentVersion.body,
      value: input.newValue ?? source.value,
      startDate: input.newStart, endDate: input.newEnd,
      templateId: source.currentVersion.templateId ?? undefined,
      autoRenew: source.autoRenew,
      serviceLines: sanitizeServiceLines(source.serviceLines),
    }, userId, ctx)

    await this.prisma.contract.update({ where: { id: created.id }, data: { parentContractId: source.id } })
    await this.prisma.contract.update({ where: { id: source.id }, data: { status: 'Renewed' } })
    await this.audit.log({ ...ctx, action: 'contract.renew', entity: 'contract', entityId: source.id, metadata: { renewedTo: created.id } })
    return this.findOne(created.id)
  }

  async recomputeStatuses(): Promise<{ updated: number }> {
    const now = new Date()
    const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
    let updated = 0

    const expired = await this.prisma.contract.updateMany({
      where: { status: { in: ['Active', 'Signed', 'Expiring'] }, endDate: { lt: now } },
      data: { status: 'Expired' },
    })
    updated += expired.count

    const expiring = await this.prisma.contract.updateMany({
      where: { status: { in: ['Active', 'Signed'] }, endDate: { gte: now, lte: in60 } },
      data: { status: 'Expiring' },
    })
    updated += expiring.count

    // Move Signed contracts whose start date has passed → Active
    const activated = await this.prisma.contract.updateMany({
      where: { status: 'Signed', startDate: { lte: now } },
      data: { status: 'Active' },
    })
    updated += activated.count

    // Mark overdue obligations
    await this.prisma.obligation.updateMany({
      where: { status: 'pending', dueDate: { lt: now } },
      data: { status: 'overdue' },
    })

    return { updated }
  }

  private async runRiskAnalysis(contractId: string, body: string) {
    const findings = analyzeContractText(body)
    await this.prisma.contractRiskFinding.deleteMany({ where: { contractId } })
    if (findings.length > 0) {
      await this.prisma.contractRiskFinding.createMany({
        data: findings.map((f) => ({ contractId, severity: f.severity, category: f.category, message: f.message, snippet: f.snippet })),
      })
    }
    await this.prisma.contract.update({ where: { id: contractId }, data: { risk: overallRisk(findings) as RiskLevel } })
  }

  private async latestVersionNo(contractId: string): Promise<number> {
    const latest = await this.prisma.contractVersion.findFirst({ where: { contractId }, orderBy: { versionNo: 'desc' } })
    return latest?.versionNo ?? 0
  }

  private includeAll() {
    return {
      customer: true, owner: true, opportunity: true,
      currentVersion: { include: { createdBy: true } },
      versions: { select: { id: true, versionNo: true, createdAt: true }, orderBy: { versionNo: 'desc' as const } },
      approvals: { include: { approver: true }, orderBy: { step: 'asc' as const } },
      obligations: { orderBy: { dueDate: 'asc' as const } },
      riskFindings: { orderBy: { severity: 'desc' as const } },
    }
  }

  private toDto = (row: {
    id: string; no: string; customerId: string; opportunityId: string | null; ownerId: string
    type: string; serviceLines: string[]; status: string; approvalStep: number; value: number; currency: string; risk: string
    startDate: Date | null; endDate: Date | null; signedAt: Date | null; terminatedAt: Date | null
    autoRenew: boolean; parentContractId: string | null; createdAt: Date; updatedAt: Date
    customer: { name: string }
    opportunity: { title: string } | null
    owner: { name: string }
    currentVersion: null | { id: string; versionNo: number; title: string; body: string; templateId: string | null; createdAt: Date; createdBy: { name: string } }
    versions: Array<{ id: string; versionNo: number; createdAt: Date }>
    approvals: Array<{ id: string; step: number; stepName: string; decision: string; approverId: string | null; approver: { name: string } | null; decidedAt: Date | null; comment: string | null }>
    obligations: Array<{ id: string; kind: string; title: string; dueDate: Date; amount: number | null; status: string; completedAt: Date | null; notes: string | null }>
    riskFindings: Array<{ id: string; severity: string; category: string; message: string; snippet: string | null }>
  }): ContractDto => {
    const cv = row.currentVersion
    const currentVersion: ContractVersionDto | null = cv ? {
      id: cv.id, versionNo: cv.versionNo, title: cv.title, body: cv.body,
      templateId: cv.templateId, createdAt: cv.createdAt.toISOString(),
      createdByName: cv.createdBy.name,
    } : null

    const daysLeft = row.endDate
      ? Math.ceil((row.endDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : null

    return {
      id: row.id, no: row.no,
      customerId: row.customerId, customerName: row.customer.name,
      opportunityId: row.opportunityId, opportunityTitle: row.opportunity?.title ?? null,
      ownerId: row.ownerId, ownerName: row.owner.name,
      type: row.type, serviceLines: sanitizeServiceLines(row.serviceLines),
      status: row.status as ContractStatus,
      approvalStep: row.approvalStep,
      value: row.value, currency: row.currency, risk: row.risk as RiskLevel,
      startDate: row.startDate?.toISOString() ?? null,
      endDate: row.endDate?.toISOString() ?? null,
      signedAt: row.signedAt?.toISOString() ?? null,
      terminatedAt: row.terminatedAt?.toISOString() ?? null,
      autoRenew: row.autoRenew, parentContractId: row.parentContractId, daysLeft,
      currentVersion,
      versions: row.versions.map((v) => ({ id: v.id, versionNo: v.versionNo, createdAt: v.createdAt.toISOString() })),
      approvals: row.approvals.map((a): ContractApprovalDto => ({
        id: a.id, step: a.step, stepName: a.stepName,
        decision: a.decision as 'pending' | 'approved' | 'rejected',
        approverId: a.approverId, approverName: a.approver?.name ?? null,
        decidedAt: a.decidedAt?.toISOString() ?? null, comment: a.comment,
      })),
      obligations: row.obligations.map((o): ObligationDto => ({
        id: o.id, contractId: row.id, contractNo: row.no,
        kind: o.kind as ObligationKind, title: o.title,
        dueDate: o.dueDate.toISOString(), amount: o.amount,
        status: o.status as 'pending' | 'completed' | 'overdue',
        completedAt: o.completedAt?.toISOString() ?? null, notes: o.notes,
      })),
      riskFindings: row.riskFindings.map((f): ContractRiskFindingDto => ({
        id: f.id, severity: f.severity as 'low' | 'medium' | 'high',
        category: f.category, message: f.message, snippet: f.snippet,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}
