import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { CalendarSyncService } from './calendar-sync.service'

/**
 * Near-realtime sync via cron. In a real deployment this is a fallback for when the
 * Graph webhook subscription can't be created (no public HTTPS URL) or is between
 * renewals. The 5-minute cadence matches Google Calendar and Outlook mobile clients
 * and keeps Graph well under the 10k/hour quota per app.
 */
@Injectable()
export class CalendarSyncCron {
  private readonly logger = new Logger(CalendarSyncCron.name)

  constructor(private prisma: PrismaService, private sync: CalendarSyncService) {}

  /**
   * Renew any webhook subscription within 12 h of expiring. Graph caps event
   * subscriptions at ~3 days, so we can't just create-and-forget. No-op for accounts
   * that never got a subscription (no public URL configured, or dev stub).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async renewSubscriptions(): Promise<void> {
    const cutoff = new Date(Date.now() + 12 * 60 * 60 * 1000)
    const accounts = await this.prisma.calendarSyncAccount.findMany({
      where: { webhookSubscriptionId: { not: null }, webhookExpiresAt: { lt: cutoff } },
      select: { id: true, email: true },
    })
    for (const acc of accounts) {
      try { await this.sync.renewWebhookSubscription(acc.id) }
      catch (err) { this.logger.warn(`Renew failed for ${acc.email}: ${err instanceof Error ? err.message : err}`) }
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async pollAll(): Promise<void> {
    // Only skip accounts that synced very recently — someone hitting "Sync now" a minute
    // before the cron fires shouldn't cause a double-pull.
    const cutoff = new Date(Date.now() - 4 * 60 * 1000)
    const accounts = await this.prisma.calendarSyncAccount.findMany({
      where: {
        provider: 'microsoft',
        OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: cutoff } }],
      },
      select: { id: true, email: true },
    })
    for (const acc of accounts) {
      try {
        const res = await this.sync.runSyncForAccountId(acc.id)
        if (res.imported || res.skipped || res.errors.length) {
          this.logger.log(`Poll ${acc.email}: imported=${res.imported} skipped=${res.skipped} errors=${res.errors.length}`)
        }
      } catch (err) {
        // One bad account (revoked consent, network) must not stop the rest.
        this.logger.warn(`Poll failed for ${acc.email}: ${err instanceof Error ? err.message : err}`)
      }
    }
  }
}
