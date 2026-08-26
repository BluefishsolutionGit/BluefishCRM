import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { IsOptional, IsString, MinLength } from 'class-validator'
import type { Request } from 'express'
import type { NotificationDto } from '@bluefish/shared'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from './push.service'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class SubscribeBody {
  @IsString() @MinLength(10) endpoint!: string
  @IsString() @MinLength(4)  p256dh!: string
  @IsString() @MinLength(4)  auth!: string
  @IsOptional() @IsString() userAgent?: string
}

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private prisma: PrismaService, private push: PushService) {}

  // ─── Push subscription endpoints ─────────────────────────────────
  @Get('vapid-public-key')
  vapidKey(): { publicKey: string | null } {
    return { publicKey: this.push.getPublicKey() }
  }

  @Post('subscribe')
  @HttpCode(204)
  async subscribe(@Body() body: SubscribeBody, @Req() req: JwtRequest): Promise<void> {
    if (!req.user) throw new UnauthorizedException()
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: { userId: req.user.sub, p256dh: body.p256dh, auth: body.auth, userAgent: body.userAgent ?? null, lastErrorAt: null },
      create: { userId: req.user.sub, endpoint: body.endpoint, p256dh: body.p256dh, auth: body.auth, userAgent: body.userAgent ?? null },
    })
  }

  @Delete('subscribe')
  @HttpCode(204)
  async unsubscribe(@Body() body: { endpoint: string }, @Req() req: JwtRequest): Promise<void> {
    if (!req.user) throw new UnauthorizedException()
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId: req.user.sub } })
  }

  @Post('subscribe/test')
  @HttpCode(200)
  async sendTest(@Req() req: JwtRequest): Promise<{ ok: number; gone: number; failed: number }> {
    if (!req.user) throw new UnauthorizedException()
    return this.push.sendToUser(req.user.sub, {
      title: 'Bluefish CRM',
      body: 'Push notifications are live 🎉',
      url: '/m',
      tag: 'test',
    })
  }

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

    const in48hAgo = new Date(now.getTime() - 48 * 3600 * 1000)
    const [activities, overdue, pendingApprovals, inboxThreads, faChanges, declines, readKeys] = await Promise.all([
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
      // Recent RSVP changes on activities I own — captures both declines and tentative
      // downgrades so a sales rep sees drop-outs and soft-commits in one place.
      this.prisma.auditLog.findMany({
        where: {
          userId,
          action: { in: ['activity.attendee.declined', 'activity.attendee.tentative'] },
          createdAt: { gte: in48hAgo },
        },
        take: 15, orderBy: { createdAt: 'desc' },
      }),
      // Which notification keys has this user already marked read? Used to override the
      // per-source default `unread=true` when we assemble the final list.
      this.prisma.notificationRead.findMany({ where: { userId }, select: { key: true } }),
    ])
    const readSet = new Set(readKeys.map((r) => r.key))

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
    for (const d of declines) {
      const meta = (d.metadata ?? {}) as { attendeeEmail?: string; attendeeName?: string; activityTitle?: string; previousResponse?: string }
      const who = meta.attendeeName ?? meta.attendeeEmail ?? 'Someone'
      const isDeclined = d.action === 'activity.attendee.declined'
      rows.push({
        id: (isDeclined ? 'decline-' : 'tentative-') + d.id,
        kind: isDeclined ? 'attendee_declined' : 'attendee_tentative',
        title: `${who} ${isDeclined ? 'declined' : 'is tentative on'} "${meta.activityTitle ?? 'meeting'}"`,
        sub: meta.previousResponse ? `was ${meta.previousResponse}` : 'via Outlook calendar',
        tone: isDeclined ? 'bad' : 'warn',
        link: '/activities',
        at: d.createdAt.toISOString(),
        unread: true,
      })
    }

    // Apply the read-receipt overlay — any row whose key we've stored gets unread=false
    // regardless of the per-source default. Keeps the badge count meaningful.
    for (const row of rows) {
      if (readSet.has(row.id)) row.unread = false
    }

    // Attendee-change events are actionable — someone dropped out or downgraded to
    // tentative — so they float to the top regardless of meeting time. Declines rank
    // above tentative. Everything else falls back to at DESC.
    const rank = (k: string) => (k === 'attendee_declined' ? 0 : k === 'attendee_tentative' ? 1 : 2)
    rows.sort((x, y) => {
      const dx = rank(x.kind), dy = rank(y.kind)
      if (dx !== dy) return dx - dy
      return y.at.localeCompare(x.at)
    })
    return rows.slice(0, 20)
  }

  /** Mark a single notification (by its computed id) as read. Idempotent. */
  @Post(':key/read')
  @HttpCode(204)
  async markRead(@Param('key') key: string, @Req() req: JwtRequest): Promise<void> {
    if (!req.user) throw new UnauthorizedException()
    // Upsert so double-clicking doesn't error — same key, refresh readAt.
    await this.prisma.notificationRead.upsert({
      where: { userId_key: { userId: req.user.sub, key } },
      update: { readAt: new Date() },
      create: { userId: req.user.sub, key, readAt: new Date() },
    })
  }

  /** Mark every notification currently in the user's feed as read in one shot. */
  @Post('read-all')
  @HttpCode(204)
  async markAllRead(@Req() req: JwtRequest): Promise<void> {
    if (!req.user) throw new UnauthorizedException()
    const rows = await this.list(req)
    const now = new Date()
    // createMany with skipDuplicates keeps this idempotent — anything already read stays put.
    await this.prisma.notificationRead.createMany({
      data: rows.map((r) => ({ userId: req.user!.sub, key: r.id, readAt: now })),
      skipDuplicates: true,
    })
  }
}
