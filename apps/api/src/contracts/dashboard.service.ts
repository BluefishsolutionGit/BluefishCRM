import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { SERVICE_LINES } from '@bluefish/shared'
import type { ContractDashboardDto, ContractStatus, ObligationDto, ObligationKind } from '@bluefish/shared'
import { loadServiceScope, scopeArrayField } from '../common/service-scope'
import type { Request } from 'express'

const csvList = (v: string | string[] | undefined): string[] => {
  if (v === undefined) return []
  const arr = Array.isArray(v) ? v : v.split(',')
  return arr.map((s) => s.trim()).filter(Boolean)
}

@Injectable()
export class ContractsDashboardService {
  constructor(private prisma: PrismaService) {}

  async summary(req: Request, filter: { status?: string | string[]; service?: string | string[]; q?: string } = {}): Promise<ContractDashboardDto> {
    const statuses = csvList(filter.status)
    const services = csvList(filter.service).filter((s) => (SERVICE_LINES as readonly string[]).includes(s))
    const contractWhere: Record<string, unknown> = {}
    if (statuses.length === 1) contractWhere.status = statuses[0]
    else if (statuses.length > 1) contractWhere.status = { in: statuses }
    if (services.length === 1) contractWhere.serviceLines = { has: services[0] }
    else if (services.length > 1) contractWhere.serviceLines = { hasSome: services }
    const scope = await loadServiceScope(this.prisma, req)
    const scopeFilter = scopeArrayField(scope, 'serviceLines')
    if (scopeFilter) Object.assign(contractWhere, scopeFilter)
    const q = filter.q?.trim()
    if (q) {
      contractWhere.OR = [
        { no:       { contains: q, mode: 'insensitive' } },
        { type:     { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { code: { contains: q, mode: 'insensitive' } } },
        { currentVersion: { title: { contains: q, mode: 'insensitive' } } },
        { currentVersion: { body:  { contains: q, mode: 'insensitive' } } },
      ]
    }

    const all = await this.prisma.contract.findMany({ where: contractWhere, include: { customer: { select: { name: true } } } })
    const totalCount = all.length
    const totalValue = all.reduce((a, c) => a + c.value, 0)
    const activeCount = all.filter((c) => c.status === 'Active' || c.status === 'Signed').length
    const now = new Date()
    const ms = (d: number) => d * 24 * 60 * 60 * 1000
    const in30 = new Date(now.getTime() + ms(30))
    const in60 = new Date(now.getTime() + ms(60))
    const in90 = new Date(now.getTime() + ms(90))
    const isLive = (s: string) => s === 'Active' || s === 'Signed' || s === 'Expiring'
    const expiringIn = (upTo: Date) => all.filter((c) => c.endDate && c.endDate >= now && c.endDate <= upTo && isLive(c.status))
    const expCum30 = expiringIn(in30)
    const expCum60 = expiringIn(in60)
    const expCum90 = expiringIn(in90)
    const expiringCount = expCum60.length // compatibility — "Expiring" KPI card uses ≤60d
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

    const sumValue = (list: typeof all) => list.reduce((a, c) => a + c.value, 0)
    const expiringBuckets = {
      in30: { count: expCum30.length, value: sumValue(expCum30) },
      in60: { count: expCum60.length, value: sumValue(expCum60) },
      in90: { count: expCum90.length, value: sumValue(expCum90) },
    }

    const riskBreakdown = {
      high:   all.filter((c) => c.risk === 'High').length,
      medium: all.filter((c) => c.risk === 'Med' || c.risk === 'Medium').length,
      low:    all.filter((c) => c.risk === 'Low').length,
    }

    // 12 months of trend — bucket by signedAt (or startDate as fallback), include zero-value months so the chart doesn't skip gaps
    const trendStart = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const monthlyMap = new Map<string, { value: number; count: number }>()
    for (let i = 0; i < 12; i++) {
      const d = new Date(trendStart.getFullYear(), trendStart.getMonth() + i, 1)
      monthlyMap.set(monthKey(d), { value: 0, count: 0 })
    }
    for (const c of all) {
      const when = c.signedAt ?? c.startDate
      if (!when || when < trendStart || when > now) continue
      const key = monthKey(when)
      const cur = monthlyMap.get(key)
      if (!cur) continue
      cur.value += c.value
      cur.count++
    }
    const monthlyValueTrend = [...monthlyMap.entries()].map(([month, v]) => ({ month, value: v.value, count: v.count }))

    const topCustMap = new Map<string, { customerName: string; count: number; value: number }>()
    for (const c of all) {
      const cur = topCustMap.get(c.customerId) ?? { customerName: c.customer.name, count: 0, value: 0 }
      cur.count++; cur.value += c.value
      topCustMap.set(c.customerId, cur)
    }
    const topCustomers = [...topCustMap.entries()]
      .map(([customerId, v]) => ({ customerId, customerName: v.customerName, count: v.count, value: v.value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)

    // This-month throughput
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const nextMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const inThisMonth = (d: Date | null) => d != null && d >= monthStart && d < nextMonth
    const thisMonthThroughput = {
      signed:     all.filter((c) => inThisMonth(c.signedAt)).length,
      // "Renewed" = contracts created this month that are a child of another contract
      renewed:    all.filter((c) => c.parentContractId != null && inThisMonth(c.createdAt)).length,
      terminated: all.filter((c) => inThisMonth(c.terminatedAt)).length,
      expired:    all.filter((c) => c.status === 'Expired' && inThisMonth(c.endDate)).length,
    }

    // Longest wait among currently-pending contracts
    const pending = all.filter((c) => c.status === 'Pending Approval' || c.status === 'Under Review')
    let approvalLongestWait: ContractDashboardDto['approvalLongestWait'] = null
    for (const c of pending) {
      const days = Math.floor((now.getTime() - c.createdAt.getTime()) / ms(1))
      if (!approvalLongestWait || days > approvalLongestWait.days) {
        approvalLongestWait = { days, contractId: c.id, contractNo: c.no }
      }
    }

    const overdueFollowupsCount = await this.prisma.obligation.count({
      where: {
        status: { in: ['pending', 'overdue'] },
        dueDate: { lt: now },
        ...(Object.keys(contractWhere).length ? { contract: contractWhere } : {}),
      },
    })

    // Average approval days (time from create → last approval)
    const approved = await this.prisma.contract.findMany({
      where: {
        ...contractWhere,
        status: { in: ['Approved', 'Signed', 'Active', 'Expiring', 'Expired', 'Renewed'] },
      },
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
      where: {
        status: { in: ['pending', 'overdue'] },
        ...(Object.keys(contractWhere).length ? { contract: contractWhere } : {}),
      },
      include: { contract: { select: { no: true, customerId: true, customer: { select: { name: true } } } } },
      orderBy: { dueDate: 'asc' },
      take: 10,
    })
    const upcomingObligations: ObligationDto[] = upcoming.map((o) => ({
      id: o.id, contractId: o.contractId, contractNo: o.contract.no,
      customerId: o.contract.customerId, customerName: o.contract.customer.name,
      kind: o.kind as ObligationKind, title: o.title,
      dueDate: o.dueDate.toISOString(), amount: o.amount,
      status: o.status as 'pending' | 'overdue' | 'completed',
      completedAt: o.completedAt?.toISOString() ?? null, notes: o.notes,
    }))

    return {
      totalCount, totalValue, activeCount, expiringCount, pendingCount, avgApprovalDays,
      byStatus, byType, upcomingObligations,
      expiringBuckets, riskBreakdown, overdueFollowupsCount,
      monthlyValueTrend, topCustomers, thisMonthThroughput, approvalLongestWait,
    }
  }
}
