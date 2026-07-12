import { Controller, Get, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import type { Request } from 'express'
import type { NotificationDto } from '@bluefish/shared'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PrismaService } from '../prisma/prisma.service'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  /**
   * Build a notification feed for the current user from:
   *   - upcoming activities (next 48h, owner = me, not completed)
   *   - overdue activities (before now, not completed)
   *   - pending quotation approvals waiting on my role
   *   - recent inbox unread threads assigned to me
   *   - status changes on my quotations pushed to FlowAccount (last 24h)
   *
   * The badge count is the number of items marked `unread: true`.
   */
  @Get()
  async list(@Req() req: JwtRequest): Promise<NotificationDto[]> {
    if (!req.user) throw new UnauthorizedException()
    const userId = req.user.sub
    const now = new Date()
    const in48h = new Date(now.getTime() + 48 * 3600 * 1000)
    const in24hAgo = new Date(now.getTime() - 24 * 3600 * 1000)

    const [activities, overdue, pendingApprovals, inboxThreads, faChanges] = await Promise.all([
      this.prisma.activity.findMany({
        where: { ownerId: userId, status: { not: 'completed' }, scheduledAt: { gte: now, lte: in48h } },
        take: 10, orderBy: { scheduledAt: 'asc' },
        include: { customer: { select: { name: true } } },
      }),
      this.prisma.activity.findMany({
        where: { ownerId: userId, status: { not: 'completed' }, scheduledAt: { lt: now } },
        take: 5, orderBy: { scheduledAt: 'desc' },
        include: { customer: { select: { name: true } } },
      }),
      this.prisma.quotationApproval.findMany({
        where: { decision: 'pending', approverId: userId },
        take: 5, orderBy: { createdAt: 'desc' },
        include: { quotation: { include: { customer: { select: { name: true } } } } },
      }),
      this.prisma.inboxThread.findMany({
        where: { ownerId: userId, unread: { gt: 0 } },
        take: 5, orderBy: { lastMessageAt: 'desc' },
      }),
      this.prisma.auditLog.findMany({
        where: {
          userId,
          action: 'flowaccount.quotation.status_change',
          createdAt: { gte: in24hAgo },
        },
        take: 5, orderBy: { createdAt: 'desc' },
      }),
    ])

    const rows: NotificationDto[] = []

    for (const a of overdue) {
      rows.push({
        id: 'act-overdue-' + a.id,
        kind: 'activity_overdue',
        title: `Overdue: ${a.title}`,
        sub: a.customer ? `${a.customer.name} · ${a.type}` : a.type,
        tone: 'bad',
        link: '/activities',
        at: a.scheduledAt.toISOString(),
        unread: true,
      })
    }
    for (const p of pendingApprovals) {
      rows.push({
        id: 'appr-' + p.id,
        kind: 'quotation_approval',
        title: `Quotation ${p.quotation.no} needs your approval`,
        sub: `${p.quotation.customer.name} · step ${p.stepName}`,
        tone: 'warn',
        link: `/quotations/${p.quotationId}`,
        at: p.createdAt.toISOString(),
        unread: true,
      })
    }
    for (const t of inboxThreads) {
      rows.push({
        id: 'inbox-' + t.id,
        kind: 'inbox_message',
        title: `${t.unread} new message${t.unread === 1 ? '' : 's'} from ${t.name}`,
        sub: `${t.channel} · ${t.companyName ?? 'unlinked'}`,
        tone: 'ok',
        link: '/inbox',
        at: t.lastMessageAt.toISOString(),
        unread: true,
      })
    }
    for (const c of faChanges) {
      const meta = (c.metadata ?? {}) as { previous?: string; current?: string; flowaccountId?: string }
      rows.push({
        id: 'fa-' + c.id,
        kind: 'flowaccount_status',
        title: `FlowAccount status: ${meta.previous ?? '—'} → ${meta.current ?? '—'}`,
        sub: `Envelope ${meta.flowaccountId ?? '?'}`,
        tone: 'info',
        link: c.entityId ? `/quotations/${c.entityId}` : '/quotations',
        at: c.createdAt.toISOString(),
        unread: true,
      })
    }
    for (const a of activities) {
      const hours = Math.round((a.scheduledAt.getTime() - now.getTime()) / (3600 * 1000))
      rows.push({
        id: 'act-' + a.id,
        kind: 'activity_upcoming',
        title: a.title,
        sub: `${a.customer?.name ?? a.type} · in ${hours}h`,
        tone: 'info',
        link: '/activities',
        at: a.scheduledAt.toISOString(),
        unread: false,
      })
    }

    // Sort by at DESC
    rows.sort((x, y) => y.at.localeCompare(x.at))
    return rows.slice(0, 20)
  }
}
