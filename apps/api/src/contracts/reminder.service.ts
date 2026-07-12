import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { MailerService } from '../mailer/mailer.service'
import { ContractsService } from './contracts.service'

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name)

  constructor(
    private prisma: PrismaService,
    private mailer: MailerService,
    private contracts: ContractsService,
  ) {}

  /**
   * Runs every hour. Scans:
   *   - Obligations due within 7 days that haven't been reminded → notify owner
   *   - Recompute contract statuses (Active → Expiring / Expired, Signed → Active)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async runHourly(): Promise<void> {
    try {
      const { updated } = await this.contracts.recomputeStatuses()
      if (updated > 0) this.logger.log(`Recomputed ${updated} contract statuses`)

      const in7days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      const dueSoon = await this.prisma.obligation.findMany({
        where: { status: { in: ['pending', 'overdue'] }, reminderSentAt: null, dueDate: { lte: in7days } },
        include: { contract: { include: { owner: true, customer: true } } },
      })

      for (const o of dueSoon) {
        await this.mailer.send({
          to: o.contract.owner.email,
          subject: `Reminder: ${o.kind} — ${o.title} (contract ${o.contract.no})`,
          text: `Hi ${o.contract.owner.name},

The following obligation is due soon:

  Contract: ${o.contract.no} (${o.contract.customer.name})
  Type: ${o.kind}
  Title: ${o.title}
  Due: ${o.dueDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
  ${o.amount ? `Amount: ฿${o.amount.toLocaleString('en-US')}` : ''}

Please review in the CRM.

— Bluefish CRM`,
        })
        await this.prisma.obligation.update({ where: { id: o.id }, data: { reminderSentAt: new Date() } })
      }
      if (dueSoon.length > 0) this.logger.log(`Sent ${dueSoon.length} obligation reminders`)
    } catch (err) {
      this.logger.error('Reminder run failed', err as Error)
    }
  }
}
