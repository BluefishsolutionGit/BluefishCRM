import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'

/**
 * NotificationRead rows accumulate as users tick off notifications. The corresponding
 * audit / activity entries eventually age out of the 48-h feed window, so old read-
 * receipts become dead weight in the table. Prune anything older than 60 days once a
 * week — plenty of headroom over the longest feed window we surface.
 */
@Injectable()
export class NotificationsCron {
  private readonly logger = new Logger(NotificationsCron.name)

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_WEEK)
  async pruneStaleReadReceipts(): Promise<void> {
    const cutoff = new Date(Date.now() - 60 * 24 * 3600 * 1000)
    const { count } = await this.prisma.notificationRead.deleteMany({
      where: { readAt: { lt: cutoff } },
    })
    if (count > 0) this.logger.log(`Pruned ${count} stale NotificationRead rows (older than ${cutoff.toISOString()})`)
  }
}
