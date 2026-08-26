import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from './push.service'

/**
 * Every 5 minutes, look at what would be a NEW push-worthy event since the
 * last tick and fan out a web-push to each subscribed user. Right now this
 * covers three high-signal cases:
 *
 *   - New pending quotation approval assigned to a user
 *   - Newly overdue activity owned by a user
 *   - New unread inbox thread (LINE / Messenger / IG / WhatsApp / Email)
 *
 * "New since last tick" is computed against the audit log + timestamps on
 * the source rows — deduping happens naturally because we use notification
 * keys (matching the compute-feed keys) as the dedup index in
 * PushDispatched.
 */
@Injectable()
export class PushDispatcherCron {
  private readonly logger = new Logger(PushDispatcherCron.name)
  private lastTick = new Date(Date.now() - 5 * 60_000)

  constructor(private prisma: PrismaService, private push: PushService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async dispatch(): Promise<void> {
    if (!this.push.isReady()) return
    const now = new Date()
    const since = this.lastTick
    this.lastTick = now

    try {
      // New pending quotation approvals assigned in the window
      const approvals = await this.prisma.quotationApproval.findMany({
        where: { decision: 'pending', approverId: { not: null }, createdAt: { gte: since } },
        include: { quotation: { select: { no: true, customer: { select: { name: true } } } } },
      })
      for (const a of approvals) {
        if (!a.approverId) continue
        await this.push.sendToUser(a.approverId, {
          title: `Quotation ${a.quotation.no} needs approval`,
          body: `${a.quotation.customer.name} · step ${a.stepName}`,
          url: `/m/quotations/${a.quotationId}`,
          tag: `appr-${a.id}`,
        })
      }

      // Activities newly overdue (scheduled between now and 5 min ago, still not done)
      const overdue = await this.prisma.activity.findMany({
        where: {
          status: { not: 'completed' },
          scheduledAt: { gte: new Date(now.getTime() - 5 * 60_000), lt: now },
        },
        include: { customer: { select: { name: true } } },
      })
      for (const a of overdue) {
        await this.push.sendToUser(a.ownerId, {
          title: `Now overdue: ${a.title}`,
          body: a.customer ? `${a.customer.name} · ${a.type}` : a.type,
          url: `/m/tasks/${a.id}`,
          tag: `act-overdue-${a.id}`,
        })
      }

      // New inbox messages while user was offline — surface once per thread per tick
      const threads = await this.prisma.inboxThread.findMany({
        where: { ownerId: { not: null }, unread: { gt: 0 }, lastMessageAt: { gte: since } },
        select: { id: true, ownerId: true, name: true, channel: true, unread: true },
      })
      for (const t of threads) {
        if (!t.ownerId) continue
        await this.push.sendToUser(t.ownerId, {
          title: `${t.name} · ${t.channel}`,
          body: `${t.unread} new message${t.unread === 1 ? '' : 's'}`,
          url: `/m/inbox/${t.id}`,
          tag: `inbox-${t.id}`,
        })
      }
    } catch (e) {
      this.logger.warn(`push dispatch failed: ${(e as Error).message}`)
    }
  }
}
