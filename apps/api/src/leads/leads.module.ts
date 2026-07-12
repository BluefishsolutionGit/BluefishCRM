import { Module } from '@nestjs/common'
import { LeadsService } from './leads.service'
import { LeadsController } from './leads.controller'
import { AssignmentService } from './assignment.service'

@Module({
  providers: [LeadsService, AssignmentService],
  controllers: [LeadsController],
  exports: [LeadsService, AssignmentService],
})
export class LeadsModule {}
