import { Module } from '@nestjs/common'
import { ContractsService } from './contracts.service'
import { ContractTemplatesService } from './templates.service'
import { ObligationsService } from './obligations.service'
import { ContractsDashboardService } from './dashboard.service'
import { ReminderService } from './reminder.service'
import { ContractsController } from './contracts.controller'

@Module({
  providers: [ContractsService, ContractTemplatesService, ObligationsService, ContractsDashboardService, ReminderService],
  controllers: [ContractsController],
  exports: [ContractsService, ContractTemplatesService],
})
export class ContractsModule {}
