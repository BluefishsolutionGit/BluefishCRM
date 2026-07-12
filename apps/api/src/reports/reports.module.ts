import { Module } from '@nestjs/common'
import { ReportsService } from './reports.service'
import { ReportExportService } from './report-export.service'
import { ReportSchedulesService } from './report-schedules.service'
import { ReportsController } from './reports.controller'

@Module({
  providers: [ReportsService, ReportExportService, ReportSchedulesService],
  controllers: [ReportsController],
})
export class ReportsModule {}
