import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type {
  ByServiceDashboardDto, ByServiceStatDto,
  ExecutiveDashboardDto, PipelineDashboardDto,
  RevenueDashboardDto, SalesDashboardDto, SalesRepStatsDto,
} from '@bluefish/shared'
import { SERVICE_LINES } from '@bluefish/shared'

const OPEN_STAGES = ['Qualification', 'Proposal', 'Negotiation']

@Injectable()
export class DashboardsService {
  constructor(private prisma: PrismaService) {}

  async executive(): Promise<ExecutiveDashboardDto> {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    const yearStart = new Date(now.getFullYear(), 0, 1)
    const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [opps, leads, wonOpps, contracts, aiCost, activities] = await Promise.all([
      this.prisma.opportunity.findMany({ include: { customer: true } }),
      this.prisma.lead.findMany({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.opportunity.findMany({ where: { stage: 'Won' } }),
      this.prisma.contract.findMany(),
      this.prisma.aiRun.aggregate({ _sum: { costUsd: true } }),
      this.prisma.activity.groupBy({ by: ['type'], _count: { id: true } }),
    ])

    const openOpps = opps.filter((o) => OPEN_STAGES.includes(o.stage))
    const openPipeline = openOpps.reduce((a, o) => a + o.value, 0)

    const wonInRange = (from: Date) => wonOpps.filter((o) => o.updatedAt >= from).reduce((a, o) => a + o.value, 0)
    const revenueMTD = wonInRange(monthStart)
    const revenueQTD = wonInRange(quarterStart)
    const revenueYTD = wonInRange(yearStart)

    const dealsWonPeriod = wonOpps.filter((o) => o.updatedAt >= monthStart).length
    const activeContracts = contracts.filter((c) => c.status === 'Active' || c.status === 'Signed').length
    const expiringContracts = contracts.filter((c) => c.endDate && c.endDate >= now && c.endDate <= in60).length
    const pendingApprovals =
      contracts.filter((c) => c.status === 'Pending Approval').length +
      (await this.prisma.quotation.count({ where: { status: 'Pending Approval' } }))

    const convertedLeads = await this.prisma.lead.count({ where: { status: 'Converted' } })
    const totalLeads = await this.prisma.lead.count()
    const leadConversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0
    const avgDealSize = wonOpps.length > 0 ? Math.round(wonOpps.reduce((a, o) => a + o.value, 0) / wonOpps.length) : 0

    const topDeals = openOpps
      .sort((a, b) => b.value * b.probability - a.value * a.probability)
      .slice(0, 5)
      .map((o) => ({ id: o.id, title: o.title, customerName: o.customer.name, value: o.value, stage: o.stage, probability: o.probability }))

    return {
      asOf: now.toISOString(),
      openPipeline, revenueMTD, revenueQTD, revenueYTD,
      newLeadsPeriod: leads.length, dealsWonPeriod,
      activeContracts, expiringContracts, pendingApprovals,
      aiSpendUsd: Number((aiCost._sum.costUsd ?? 0).toFixed(4)),
      leadConversionRate, avgDealSize,
      topDeals,
      activityBreakdown: activities.map((a) => ({ type: a.type, count: a._count.id })),
    }
  }

  async sales(): Promise<SalesDashboardDto> {
    const reps = await this.prisma.user.findMany({
      where: { role: { name: { in: ['sales_manager', 'sales_rep'] } } },
      include: { role: true },
    })
    const quota = 40_000_000
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const stats: SalesRepStatsDto[] = await Promise.all(reps.map(async (u) => {
      const [opps, activities, leads] = await Promise.all([
        this.prisma.opportunity.findMany({ where: { ownerId: u.id } }),
        this.prisma.activity.count({ where: { ownerId: u.id, scheduledAt: { gte: weekAgo } } }),
        this.prisma.lead.count({ where: { ownerId: u.id } }),
      ])
      const open = opps.filter((o) => OPEN_STAGES.includes(o.stage))
      const won = opps.filter((o) => o.stage === 'Won')
      return {
        ownerId: u.id, ownerName: u.name,
        openDeals: open.length, openValue: open.reduce((a, o) => a + o.value, 0),
        wonDeals: won.length, wonValue: won.reduce((a, o) => a + o.value, 0),
        activitiesLastWeek: activities, leadsAssigned: leads,
      }
    }))

    const totalOpen = stats.reduce((a, s) => a + s.openValue, 0)
    const totalWon = stats.reduce((a, s) => a + s.wonValue, 0)
    const quotaAttainment = Math.round((totalWon / quota) * 100)

    return { reps: stats.sort((a, b) => b.wonValue - a.wonValue), quotaAttainment, totalOpen, totalWon }
  }

  async pipeline(): Promise<PipelineDashboardDto> {
    const opps = await this.prisma.opportunity.findMany({ include: { customer: true } })
    const stageNames = ['Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost']
    const stages = stageNames.map((name) => {
      const list = opps.filter((o) => o.stage === name)
      return { name, count: list.length, value: list.reduce((a, o) => a + o.value, 0) }
    })
    const openOpps = opps.filter((o) => OPEN_STAGES.includes(o.stage))
    const weightedTotal = openOpps.reduce((a, o) => a + (o.value * o.probability) / 100, 0)

    const wonOpps = opps.filter((o) => o.stage === 'Won')
    const avgCycleDays = wonOpps.length > 0
      ? Math.round(wonOpps.reduce((a, o) => a + (o.updatedAt.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60 * 24), 0) / wonOpps.length)
      : 0

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const idleDeals = openOpps
      .filter((o) => o.updatedAt < cutoff)
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .slice(0, 5)
      .map((o) => ({
        id: o.id, title: o.title, customerName: o.customer.name,
        daysIdle: Math.round((Date.now() - o.updatedAt.getTime()) / (1000 * 60 * 60 * 24)),
      }))

    return { stages, weightedTotal: Math.round(weightedTotal), avgCycleDays, idleDeals }
  }

  async revenue(): Promise<RevenueDashboardDto> {
    const now = new Date()
    const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1)
    const [wonOpps, leadsWithOwners] = await Promise.all([
      this.prisma.opportunity.findMany({ where: { stage: 'Won' }, include: { customer: true } }),
      this.prisma.lead.findMany({ where: { status: 'Converted' }, select: { source: true } }),
    ])
    const monthlyMap = new Map<string, number>()
    for (const o of wonOpps) {
      if (o.updatedAt < yearAgo) continue
      const key = `${o.updatedAt.getFullYear()}-${String(o.updatedAt.getMonth() + 1).padStart(2, '0')}`
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + o.value)
    }
    // Fill last 12 months even if empty
    const monthly: Array<{ month: string; won: number }> = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthly.push({ month: key, won: monthlyMap.get(key) ?? 0 })
    }

    // by source (from leads that converted → mapped to opportunities is complex; approximate by lead sources)
    const sourceMap = new Map<string, { count: number; won: number }>()
    for (const l of leadsWithOwners) {
      const key = l.source
      const cur = sourceMap.get(key) ?? { count: 0, won: 0 }
      cur.count++
      sourceMap.set(key, cur)
    }
    const bySource = [...sourceMap.entries()].map(([source, v]) => ({ source, count: v.count, won: v.won }))

    // by industry
    const industryMap = new Map<string, { count: number; won: number }>()
    for (const o of wonOpps) {
      const ind = o.customer.industry
      const cur = industryMap.get(ind) ?? { count: 0, won: 0 }
      cur.count++
      cur.won += o.value
      industryMap.set(ind, cur)
    }
    const byIndustry = [...industryMap.entries()].map(([industry, v]) => ({ industry, count: v.count, won: v.won }))

    return { monthly, bySource, byIndustry }
  }

  /**
   * Revenue by service line for the given year, joined with any SalesTarget set for
   * that period. Emits a row per known service line even if won=0 or target=0 so the
   * UI charts always render the full palette; pctOfTarget is 0 when target is unset
   * (avoids showing "Infinity%" attainment).
   */
  async byService(periodInput?: string): Promise<ByServiceDashboardDto> {
    const period = periodInput && /^\d{4}$/.test(periodInput) ? periodInput : String(new Date().getFullYear())
    const yearStart = new Date(Number(period), 0, 1)
    const yearEnd = new Date(Number(period) + 1, 0, 1)

    const [wonOpps, targets] = await Promise.all([
      this.prisma.opportunity.findMany({
        where: { stage: 'Won', updatedAt: { gte: yearStart, lt: yearEnd } },
        select: { serviceOrProduct: true, value: true, updatedAt: true },
      }),
      this.prisma.salesTarget.findMany({ where: { period } }),
    ])

    const wonMap = new Map<string, { won: number; count: number }>()
    // month key ("YYYY-MM") → service → sum(won)
    const monthlyMap = new Map<string, Map<string, number>>()
    for (const o of wonOpps) {
      const key = o.serviceOrProduct ?? '_unassigned'
      const cur = wonMap.get(key) ?? { won: 0, count: 0 }
      cur.won += o.value; cur.count++
      wonMap.set(key, cur)
      // Grouped-monthly aggregate. `_unassigned` events would slot into an "Other"
      // service on the client; skip them here to avoid a fifth bar in the chart.
      if (!o.serviceOrProduct) continue
      const monthKey = `${period}-${String(o.updatedAt.getMonth() + 1).padStart(2, '0')}`
      const monthEntry = monthlyMap.get(monthKey) ?? new Map<string, number>()
      monthEntry.set(o.serviceOrProduct, (monthEntry.get(o.serviceOrProduct) ?? 0) + o.value)
      monthlyMap.set(monthKey, monthEntry)
    }
    const targetMap = new Map(targets.map((t) => [t.service, t.amount]))

    const stats: ByServiceStatDto[] = SERVICE_LINES.map((service) => {
      const w = wonMap.get(service) ?? { won: 0, count: 0 }
      const target = targetMap.get(service) ?? 0
      const pctOfTarget = target > 0 ? Math.round((w.won / target) * 100) : 0
      return { service, target, won: w.won, count: w.count, pctOfTarget }
    })

    // Zero-fill all 12 months + every service so the chart always renders a full
    // Jan-Dec x-axis with a slot per bar (even if the value is 0).
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const monthKey = `${period}-${String(i + 1).padStart(2, '0')}`
      const entry = monthlyMap.get(monthKey)
      const byService: Record<string, number> = {}
      for (const s of SERVICE_LINES) byService[s] = entry?.get(s) ?? 0
      return { month: monthKey, byService }
    })

    return { period, stats, monthly }
  }
}
