import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { OpportunitiesService } from './opportunities.service'
import { auditContext } from '../common/request-context'
import type { Request } from 'express'
import type { ForecastDto, OpportunityDto, OpportunityStage } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class CreateBody {
  @IsString() @MinLength(1) title!: string
  @IsString() customerId!: string
  @IsString() ownerId!: string
  @IsOptional() @IsString() @MinLength(1) stage?: OpportunityStage
  @IsOptional() @IsInt() @Min(0) value?: number
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number
  @IsOptional() @IsString() closeDate?: string
  @IsOptional() @IsString() bidDeadline?: string
  @IsOptional() @IsString() decisionDate?: string
  @IsOptional() @IsString() serviceOrProduct?: string
  @IsOptional() @IsString() competitor?: string
  @IsOptional() @IsString() managerHint?: string
  @IsOptional() @IsString() notes?: string
}
class UpdateBody {
  @IsOptional() @IsString() title?: string
  @IsOptional() @IsString() customerId?: string
  @IsOptional() @IsString() ownerId?: string
  @IsOptional() @IsString() @MinLength(1) stage?: OpportunityStage
  @IsOptional() @IsInt() @Min(0) value?: number
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number
  @IsOptional() @IsString() closeDate?: string
  @IsOptional() @IsString() bidDeadline?: string
  @IsOptional() @IsString() decisionDate?: string
  @IsOptional() @IsString() serviceOrProduct?: string
  @IsOptional() @IsString() competitor?: string
  @IsOptional() @IsString() lostReason?: string
  @IsOptional() @IsString() wonReason?: string
  @IsOptional() @IsString() managerHint?: string
  @IsOptional() @IsString() notes?: string
}
class StageBody { @IsString() @MinLength(1) stage!: OpportunityStage }

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private opps: OpportunitiesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  list(
    @Req() req: JwtRequest,
    @Query('ownerId') ownerId?: string,
    @Query('stage') stage?: OpportunityStage,
    @Query('serviceOrProduct') serviceOrProduct?: string,
  ): Promise<OpportunityDto[]> {
    return this.opps.list(req, { ownerId, stage, serviceOrProduct })
  }

  @Get('forecast')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  forecast(@Req() req: JwtRequest): Promise<ForecastDto> {
    return this.opps.forecast(req)
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  findOne(@Param('id') id: string, @Req() req: JwtRequest): Promise<OpportunityDto> {
    return this.opps.findOne(id, req)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_WRITE)
  create(@Body() body: CreateBody, @Req() req: Request): Promise<OpportunityDto> {
    return this.opps.create(body, auditContext(req))
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_WRITE)
  update(@Param('id') id: string, @Body() body: UpdateBody, @Req() req: Request): Promise<OpportunityDto> {
    return this.opps.update(id, body, auditContext(req))
  }

  @Post(':id/stage')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_WRITE)
  stage(@Param('id') id: string, @Body() body: StageBody, @Req() req: Request): Promise<OpportunityDto> {
    return this.opps.setStage(id, body.stage, auditContext(req))
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_WRITE)
  async delete(@Param('id') id: string, @Req() req: Request): Promise<void> {
    await this.opps.delete(id, auditContext(req))
  }
}
