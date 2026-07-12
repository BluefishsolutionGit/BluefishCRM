import { Module } from '@nestjs/common'
import { LeadsService } from './leads.service'
import { LeadsController } from './leads.controller'
import { LeadsImportController } from './leads-import.controller'
import { AssignmentService } from './assignment.service'

@Module({
  providers: [LeadsService, AssignmentService],
  // ImportController registered BEFORE main controller so /leads/import-template
  // and /leads/import don't get shadowed by the /leads/:id route.
  controllers: [LeadsImportController, LeadsController],
  exports: [LeadsService, AssignmentService],
})
export class LeadsModule {}
