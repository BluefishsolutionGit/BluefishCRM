import { Controller, Get, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { DashboardsService } from './dashboards.service'
import type { ExecutiveDashboardDto, PipelineDashboardDto, RevenueDashboardDto, SalesDashboardDto } from '@bluefish/shared'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('dashboards')
export class DashboardsController {
  constructor(private dashboards: DashboardsService) {}

  @Get('executive')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  executive(): Promise<ExecutiveDashboardDto> {
    return this.dashboards.executive()
  }

  @Get('sales')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  sales(): Promise<SalesDashboardDto> {
    return this.dashboards.sales()
  }

  @Get('pipeline')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  pipeline(): Promise<PipelineDashboardDto> {
    return this.dashboards.pipeline()
  }

  @Get('revenue')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  revenue(): Promise<RevenueDashboardDto> {
    return this.dashboards.revenue()
  }
}
