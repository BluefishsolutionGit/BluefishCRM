import { Module } from '@nestjs/common'
import { FlowaccountService } from './flowaccount.service'
import { FlowaccountController } from './flowaccount.controller'
import { FlowaccountCron } from './flowaccount.cron'

@Module({
  providers: [FlowaccountService, FlowaccountCron],
  controllers: [FlowaccountController],
  exports: [FlowaccountService],
})
export class FlowaccountModule {}
