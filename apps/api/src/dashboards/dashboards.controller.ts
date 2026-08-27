import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { DashboardsService, type DashboardFilter } from './dashboards.service'
import type { ByServiceDashboardDto, ExecutiveDashboardDto, PipelineDashboardDto, RevenueDashboardDto, SalesDashboardDto } from '@bluefish/shared'

/** Normalise the two shared query params so an empty-string still counts as "no filter". */
function buildFilter(serviceOrProduct?: string, ownerId?: string): DashboardFilter | undefined {
  const f: DashboardFilter = {}
  if (serviceOrProduct && serviceOrProduct !== 'all' && serviceOrProduct.trim() !== '') f.serviceOrProduct = serviceOrProduct
  if (ownerId && ownerId !== 'all' && ownerId.trim() !== '') f.ownerId = ownerId
  return f.serviceOrProduct || f.ownerId ? f : undefined
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('dashboards')
export class DashboardsController {
  constructor(private dashboards: DashboardsService) {}

  @Get('executive')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  executive(
    @Query('serviceOrProduct') serviceOrProduct?: string,
    @Query('ownerId') ownerId?: string,
  ): Promise<ExecutiveDashboardDto> {
    return this.dashboards.executive(buildFilter(serviceOrProduct, ownerId))
  }

  @Get('sales')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  sales(
    @Query('serviceOrProduct') serviceOrProduct?: string,
    @Query('ownerId') ownerId?: string,
  ): Promise<SalesDashboardDto> {
    return this.dashboards.sales(buildFilter(serviceOrProduct, ownerId))
  }

  @Get('pipeline')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  pipeline(
    @Query('serviceOrProduct') serviceOrProduct?: string,
    @Query('ownerId') ownerId?: string,
  ): Promise<PipelineDashboardDto> {
    return this.dashboards.pipeline(buildFilter(serviceOrProduct, ownerId))
  }

  @Get('revenue')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  revenue(
    @Query('serviceOrProduct') serviceOrProduct?: string,
    @Query('ownerId') ownerId?: string,
  ): Promise<RevenueDashboardDto> {
    return this.dashboards.revenue(buildFilter(serviceOrProduct, ownerId))
  }

  @Get('by-service')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  byService(
    @Query('period') period?: string,
    @Query('serviceOrProduct') serviceOrProduct?: string,
    @Query('ownerId') ownerId?: string,
  ): Promise<ByServiceDashboardDto> {
    return this.dashboards.byService(period, buildFilter(serviceOrProduct, ownerId))
  }
}
