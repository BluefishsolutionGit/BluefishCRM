import { Module } from '@nestjs/common'
import { DashboardsService } from './dashboards.service'
import { DashboardsController } from './dashboards.controller'

@Module({
  providers: [DashboardsService],
  controllers: [DashboardsController],
})
export class DashboardsModule {}
