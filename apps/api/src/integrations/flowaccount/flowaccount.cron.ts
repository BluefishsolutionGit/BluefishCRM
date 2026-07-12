import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { FlowaccountService } from './flowaccount.service'

@Injectable()
export class FlowaccountCron {
  private readonly log = new Logger('FlowaccountCron')
  constructor(private svc: FlowaccountService) {}

  /**
   * Every 15 minutes, poll FlowAccount for status changes on quotations
   * that were pushed but aren't in a terminal state yet.
   * No-op in stub mode.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async pollStatuses(): Promise<void> {
    try {
      const { polled, changed } = await this.svc.pollAllPushed()
      if (polled > 0) this.log.log(`polled ${polled} quotations, ${changed} status change(s)`)
    } catch (e) {
      this.log.warn(`poll failed: ${(e as Error).message}`)
    }
  }
}
