import { Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../auth/jwt.guard'
import { PermissionsGuard } from '../../auth/permissions.guard'
import { RequirePermissions } from '../../auth/permissions.decorator'
import { PERMISSIONS } from '../../auth/permissions'
import { FlowaccountService } from './flowaccount.service'
import { auditContext } from '../../common/request-context'
import type { Request } from 'express'
import type { FlowaccountPushResultDto, FlowaccountStatusDto, FlowaccountSyncResultDto } from '@bluefish/shared'

@Controller('integrations/flowaccount')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FlowaccountController {
  constructor(private svc: FlowaccountService) {}

  @Get('status')
  status(): FlowaccountStatusDto {
    return this.svc.status()
  }

  @Post('quotations/:id/push')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.QUOTATION_WRITE)
  push(@Param('id') id: string, @Req() req: Request): Promise<FlowaccountPushResultDto> {
    return this.svc.pushQuotation(id, auditContext(req))
  }

  @Post('quotations/:id/sync')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  sync(@Param('id') id: string, @Req() req: Request): Promise<FlowaccountSyncResultDto> {
    return this.svc.syncQuotationStatus(id, auditContext(req))
  }
}
