import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ArrayUnique, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { CompetitorsService } from './competitors.service'
import { auditContext } from '../common/request-context'
import type { Request } from 'express'
import { SERVICE_LINES, type ServiceLine } from '@bluefish/shared'
import type { CompetitorContractDto, CompetitorDto } from '@bluefish/shared'

const STATUSES = ['Prospect', 'Contract Identified', 'Monitoring', 'Renewal Window', 'Proposal Submitted', 'Negotiation', 'Auto Renewed', 'Won', 'Lost'] as const
const CONFIDENCES = ['Low', 'Med', 'High'] as const

class CreateCompetitorBody {
  @IsString() @MinLength(2) @MaxLength(80) name!: string
  @IsOptional() @IsString() @MaxLength(3) logo?: string
  @IsOptional() @IsString() @MaxLength(9) color?: string
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(SERVICE_LINES as readonly string[], { each: true }) serviceLines?: ServiceLine[]
  @IsOptional() @IsString() @MaxLength(120) product?: string
  @IsOptional() @IsString() @MaxLength(500) notes?: string
}
class UpdateCompetitorBody {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string
  @IsOptional() @IsString() @MaxLength(3) logo?: string
  @IsOptional() @IsString() @MaxLength(9) color?: string
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(SERVICE_LINES as readonly string[], { each: true }) serviceLines?: ServiceLine[]
  @IsOptional() @IsString() @MaxLength(120) product?: string | null
  @IsOptional() @IsString() @MaxLength(500) notes?: string
}
class CreateContractBody {
  @IsString() competitorId!: string
  @IsOptional() @IsString() customerId?: string
  @IsString() @MinLength(2) customerName!: string
  @IsString() @MinLength(2) service!: string
  @IsISO8601() endDate!: string
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number]
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number
  @IsOptional() @IsInt() @Min(0) dealValue?: number
  @IsOptional() @IsString() ownerId?: string
  @IsOptional() @IsIn(CONFIDENCES) confidence?: (typeof CONFIDENCES)[number]
  @IsOptional() @IsString() @MaxLength(1000) notes?: string
}
class UpdateContractBody {
  @IsOptional() @IsString() competitorId?: string
  @IsOptional() @IsString() customerId?: string
  @IsOptional() @IsString() @MinLength(2) customerName?: string
  @IsOptional() @IsString() @MinLength(2) service?: string
  @IsOptional() @IsISO8601() endDate?: string
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number]
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number
  @IsOptional() @IsInt() @Min(0) dealValue?: number
  @IsOptional() @IsString() ownerId?: string
  @IsOptional() @IsIn(CONFIDENCES) confidence?: (typeof CONFIDENCES)[number]
  @IsOptional() @IsString() @MaxLength(1000) notes?: string
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CompetitorsController {
  constructor(private svc: CompetitorsService) {}

  @Get('competitors')
  @RequirePermissions(PERMISSIONS.COMPETITOR_READ)
  listCompetitors(@Query('service') service?: string): Promise<CompetitorDto[]> {
    return this.svc.listCompetitors({ service })
  }

  @Post('competitors')
  @RequirePermissions(PERMISSIONS.COMPETITOR_WRITE)
  createCompetitor(@Body() body: CreateCompetitorBody, @Req() req: Request): Promise<CompetitorDto> {
    return this.svc.createCompetitor(body, auditContext(req))
  }

  @Patch('competitors/:id')
  @RequirePermissions(PERMISSIONS.COMPETITOR_WRITE)
  updateCompetitor(@Param('id') id: string, @Body() body: UpdateCompetitorBody, @Req() req: Request): Promise<CompetitorDto> {
    return this.svc.updateCompetitor(id, body, auditContext(req))
  }

  @Delete('competitors/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.COMPETITOR_WRITE)
  async deleteCompetitor(@Param('id') id: string, @Req() req: Request): Promise<void> {
    await this.svc.deleteCompetitor(id, auditContext(req))
  }

  @Get('competitor-contracts')
  @RequirePermissions(PERMISSIONS.COMPETITOR_READ)
  listContracts(
    @Query('competitorId') competitorId?: string,
    @Query('status') status?: string,
  ): Promise<CompetitorContractDto[]> {
    return this.svc.listContracts({ competitorId, status })
  }

  @Post('competitor-contracts')
  @RequirePermissions(PERMISSIONS.COMPETITOR_WRITE)
  createContract(@Body() body: CreateContractBody, @Req() req: Request): Promise<CompetitorContractDto> {
    return this.svc.createContract(body, auditContext(req))
  }

  @Patch('competitor-contracts/:id')
  @RequirePermissions(PERMISSIONS.COMPETITOR_WRITE)
  updateContract(@Param('id') id: string, @Body() body: UpdateContractBody, @Req() req: Request): Promise<CompetitorContractDto> {
    return this.svc.updateContract(id, body, auditContext(req))
  }

  @Delete('competitor-contracts/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.COMPETITOR_WRITE)
  async deleteContract(@Param('id') id: string, @Req() req: Request): Promise<void> {
    await this.svc.deleteContract(id, auditContext(req))
  }
}
