import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { OpportunitiesService } from './opportunities.service'
import { auditContext } from '../common/request-context'
import type { Request } from 'express'
import type { ForecastDto, OpportunityDto, OpportunityStage } from '@bluefish/shared'

const STAGES: OpportunityStage[] = ['Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost']

class CreateBody {
  @IsString() @MinLength(1) title!: string
  @IsString() customerId!: string
  @IsString() ownerId!: string
  @IsOptional() @IsIn(STAGES) stage?: OpportunityStage
  @IsOptional() @IsInt() @Min(0) value?: number
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number
  @IsOptional() @IsString() closeDate?: string
  @IsOptional() @IsString() serviceOrProduct?: string
  @IsOptional() @IsString() competitor?: string
  @IsOptional() @IsString() aiHint?: string
  @IsOptional() @IsString() notes?: string
}
class UpdateBody {
  @IsOptional() @IsString() title?: string
  @IsOptional() @IsString() customerId?: string
  @IsOptional() @IsString() ownerId?: string
  @IsOptional() @IsIn(STAGES) stage?: OpportunityStage
  @IsOptional() @IsInt() @Min(0) value?: number
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number
  @IsOptional() @IsString() closeDate?: string
  @IsOptional() @IsString() serviceOrProduct?: string
  @IsOptional() @IsString() competitor?: string
  @IsOptional() @IsString() lostReason?: string
  @IsOptional() @IsString() wonReason?: string
  @IsOptional() @IsString() aiHint?: string
  @IsOptional() @IsString() notes?: string
}
class StageBody { @IsIn(STAGES) stage!: OpportunityStage }

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private opps: OpportunitiesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  list(
    @Query('ownerId') ownerId?: string,
    @Query('stage') stage?: OpportunityStage,
    @Query('serviceOrProduct') serviceOrProduct?: string,
  ): Promise<OpportunityDto[]> {
    return this.opps.list({ ownerId, stage, serviceOrProduct })
  }

  @Get('forecast')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  forecast(): Promise<ForecastDto> {
    return this.opps.forecast()
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  findOne(@Param('id') id: string): Promise<OpportunityDto> {
    return this.opps.findOne(id)
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
