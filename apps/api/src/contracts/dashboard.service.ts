import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { ContractDashboardDto, ContractStatus, ObligationDto, ObligationKind } from '@bluefish/shared'

@Injectable()
export class ContractsDashboardService {
  constructor(private prisma: PrismaService) {}

  async summary(): Promise<ContractDashboardDto> {
    const all = await this.prisma.contract.findMany()
    const totalCount = all.length
    const totalValue = all.reduce((a, c) => a + c.value, 0)
    const activeCount = all.filter((c) => c.status === 'Active' || c.status === 'Signed').length
    const now = new Date()
    const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
    const expiringCount = all.filter((c) => c.endDate && c.endDate >= now && c.endDate <= in60 && (c.status === 'Active' || c.status === 'Signed' || c.status === 'Expiring')).length
    const pendingCount = all.filter((c) => c.status === 'Pending Approval' || c.status === 'Under Review').length

    const statusOrder: ContractStatus[] = ['Draft', 'Under Review', 'Pending Approval', 'Approved', 'Signed', 'Active', 'Expiring', 'Expired', 'Renewed', 'Terminated']
    const byStatus = statusOrder.map((s) => ({ status: s, count: all.filter((c) => c.status === s).length }))

    const byTypeMap = new Map<string, { count: number; value: number }>()
    for (const c of all) {
      const cur = byTypeMap.get(c.type) ?? { count: 0, value: 0 }
      cur.count++; cur.value += c.value
      byTypeMap.set(c.type, cur)
    }
    const byType = [...byTypeMap.entries()].map(([type, v]) => ({ type, count: v.count, value: v.value }))

    // Average approval days (time from create → last approval)
    const approved = await this.prisma.contract.findMany({
      where: { status: { in: ['Approved', 'Signed', 'Active', 'Expiring', 'Expired', 'Renewed'] } },
      include: { approvals: true },
    })
    let totalDays = 0
    let approvedCount = 0
    for (const c of approved) {
      const last = c.approvals.filter((a) => a.decidedAt).sort((a, b) => (b.decidedAt!.getTime() - a.decidedAt!.getTime()))[0]
      if (last?.decidedAt) {
        totalDays += (last.decidedAt.getTime() - c.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        approvedCount++
      }
    }
    const avgApprovalDays = approvedCount > 0 ? Math.round(totalDays / approvedCount) : 0

    const upcoming = await this.prisma.obligation.findMany({
      where: { status: { in: ['pending', 'overdue'] } },
      include: { contract: { select: { no: true } } },
      orderBy: { dueDate: 'asc' },
      take: 10,
    })
    const upcomingObligations: ObligationDto[] = upcoming.map((o) => ({
      id: o.id, contractId: o.contractId, contractNo: o.contract.no,
      kind: o.kind as ObligationKind, title: o.title,
      dueDate: o.dueDate.toISOString(), amount: o.amount,
      status: o.status as 'pending' | 'overdue' | 'completed',
      completedAt: o.completedAt?.toISOString() ?? null, notes: o.notes,
    }))

    return { totalCount, totalValue, activeCount, expiringCount, pendingCount, avgApprovalDays, byStatus, byType, upcomingObligations }
  }
}
