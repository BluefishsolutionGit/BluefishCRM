import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { ArrayUnique, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, Min, MinLength } from 'class-validator'
import { SERVICE_LINES, type ServiceLine } from '@bluefish/shared'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { ContractsService } from './contracts.service'
import { ContractTemplatesService } from './templates.service'
import { ContractTypesService } from './contract-types.service'
import { ObligationsService } from './obligations.service'
import { ContractsDashboardService } from './dashboard.service'
import { auditContext } from '../common/request-context'
import type { Request } from 'express'
import type { ContractDto, ContractDashboardDto, ContractTemplateDto, ContractTypeDto, ObligationDto } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class CreateFromTemplateBody {
  @IsString() templateId!: string
  @IsString() customerId!: string
  @IsOptional() @IsString() opportunityId?: string
  @IsOptional() @IsInt() value?: number
  @IsOptional() @IsISO8601() startDate?: string
  @IsOptional() @IsISO8601() endDate?: string
  @IsOptional() variables?: Record<string, string>
  @IsOptional() @IsBoolean() autoRenew?: boolean
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(SERVICE_LINES as readonly string[], { each: true }) serviceLines?: ServiceLine[]
  @IsOptional() @IsString() type?: string
  @IsOptional() @IsString() name?: string
  @IsOptional() @IsString() serviceDescription?: string
  @IsOptional() @IsString() businessUnit?: string
  @IsOptional() @IsString() contactPerson?: string
  @IsOptional() @IsEmail() contactEmail?: string
  @IsOptional() @IsString() contactTel?: string
  @IsOptional() @IsString() contactFax?: string
  @IsOptional() @IsString() contractTerm?: string
  @IsOptional() @IsInt() @Min(0) renewNoticeDays?: number
}
class CreateContractBody {
  @IsString() customerId!: string
  @IsOptional() @IsString() opportunityId?: string
  @IsString() @MinLength(1) type!: string
  @IsOptional() @IsString() title?: string
  @IsOptional() @IsString() body?: string
  @IsOptional() @IsInt() value?: number
  @IsOptional() @IsISO8601() startDate?: string
  @IsOptional() @IsISO8601() endDate?: string
  @IsOptional() @IsBoolean() autoRenew?: boolean
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(SERVICE_LINES as readonly string[], { each: true }) serviceLines?: ServiceLine[]
  @IsOptional() @IsString() name?: string
  @IsOptional() @IsString() serviceDescription?: string
  @IsOptional() @IsString() businessUnit?: string
  @IsOptional() @IsString() contactPerson?: string
  @IsOptional() @IsEmail() contactEmail?: string
  @IsOptional() @IsString() contactTel?: string
  @IsOptional() @IsString() contactFax?: string
  @IsOptional() @IsString() contractTerm?: string
  @IsOptional() @IsInt() @Min(0) renewNoticeDays?: number
}
class UpdateContractBody {
  @IsOptional() @IsString() type?: string
  @IsOptional() @IsString() title?: string
  @IsOptional() @IsString() body?: string
  @IsOptional() @IsInt() value?: number
  @IsOptional() @IsISO8601() startDate?: string
  @IsOptional() @IsISO8601() endDate?: string
  @IsOptional() @IsString() risk?: 'Low' | 'Med' | 'High'
  @IsOptional() @IsBoolean() autoRenew?: boolean
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(SERVICE_LINES as readonly string[], { each: true }) serviceLines?: ServiceLine[]
  @IsOptional() @IsString() name?: string | null
  @IsOptional() @IsString() serviceDescription?: string | null
  @IsOptional() @IsString() businessUnit?: string | null
  @IsOptional() @IsString() contactPerson?: string | null
  @IsOptional() @IsString() contactEmail?: string | null
  @IsOptional() @IsString() contactTel?: string | null
  @IsOptional() @IsString() contactFax?: string | null
  @IsOptional() @IsString() contractTerm?: string | null
  @IsOptional() @IsInt() @Min(0) renewNoticeDays?: number | null
}
class ApproveBody { @IsOptional() @IsString() comment?: string }
class RejectBody { @IsString() @MinLength(1) comment!: string }
class TerminateBody { @IsString() @MinLength(1) comment!: string }
class RenewBody {
  @IsISO8601() newStart!: string
  @IsISO8601() newEnd!: string
  @IsOptional() @IsInt() newValue?: number
}
class CreateContractTypeBody {
  @IsString() @MinLength(1) name!: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsBoolean() active?: boolean
}
class UpdateContractTypeBody {
  @IsOptional() @IsString() @MinLength(1) name?: string
  @IsOptional() @IsString() description?: string | null
  @IsOptional() @IsBoolean() active?: boolean
}

class CreateObligationBody {
  @IsString() kind!: 'Payment' | 'Delivery' | 'SLA' | 'Renewal' | 'Warranty' | 'Insurance' | 'KPI'
  @IsString() @MinLength(1) title!: string
  @IsISO8601() dueDate!: string
  @IsOptional() @IsInt() amount?: number
  @IsOptional() @IsString() notes?: string
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class ContractsController {
  constructor(
    private contracts: ContractsService,
    private templates: ContractTemplatesService,
    private types: ContractTypesService,
    private obligations: ObligationsService,
    private dashboard: ContractsDashboardService,
  ) {}

  // ─── Templates ───
  @Get('contract-templates')
  @RequirePermissions(PERMISSIONS.CONTRACT_READ)
  listTemplates(): Promise<ContractTemplateDto[]> {
    return this.templates.list()
  }

  // ─── Contract Types ───
  @Get('contract-types')
  @RequirePermissions(PERMISSIONS.CONTRACT_READ)
  listTypes(@Query('includeInactive') includeInactive?: string): Promise<ContractTypeDto[]> {
    return this.types.list(includeInactive === 'true' || includeInactive === '1')
  }

  @Post('contract-types')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  createType(@Body() body: CreateContractTypeBody, @Req() req: JwtRequest): Promise<ContractTypeDto> {
    return this.types.create(body, auditContext(req))
  }

  @Patch('contract-types/:id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  updateType(@Param('id') id: string, @Body() body: UpdateContractTypeBody, @Req() req: JwtRequest): Promise<ContractTypeDto> {
    return this.types.update(id, body, auditContext(req))
  }

  @Delete('contract-types/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  async deleteType(@Param('id') id: string, @Req() req: JwtRequest): Promise<void> {
    await this.types.delete(id, auditContext(req))
  }

  // ─── Dashboard ───
  @Get('contracts/dashboard')
  @RequirePermissions(PERMISSIONS.CONTRACT_READ)
  dashboardSummary(@Req() req: JwtRequest, @Query('status') status?: string, @Query('service') service?: string, @Query('q') q?: string): Promise<ContractDashboardDto> {
    return this.dashboard.summary(req, { status, service, q })
  }

  // ─── Obligations ───
  @Get('obligations')
  @RequirePermissions(PERMISSIONS.CONTRACT_READ)
  listObligations(
    @Req() req: JwtRequest,
    @Query('from') from?: string, @Query('to') to?: string, @Query('status') status?: string, @Query('contractId') contractId?: string,
    @Query('contractStatus') contractStatus?: string, @Query('contractService') contractService?: string,
    @Query('q') q?: string,
  ): Promise<ObligationDto[]> {
    return this.obligations.list(req, {
      contractId, status,
      contractStatus, contractService, q,
      from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined,
    })
  }

  @Post('contracts/:id/obligations')
  @RequirePermissions(PERMISSIONS.CONTRACT_WRITE)
  createObligation(@Param('id') id: string, @Body() body: CreateObligationBody, @Req() req: JwtRequest): Promise<ObligationDto> {
    return this.obligations.create(id, body, auditContext(req))
  }

  @Post('obligations/:id/complete')
  @RequirePermissions(PERMISSIONS.CONTRACT_WRITE)
  completeObligation(@Param('id') id: string, @Req() req: JwtRequest): Promise<ObligationDto> {
    return this.obligations.markCompleted(id, auditContext(req))
  }

  @Delete('obligations/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CONTRACT_WRITE)
  async deleteObligation(@Param('id') id: string, @Req() req: JwtRequest): Promise<void> {
    await this.obligations.delete(id, auditContext(req))
  }

  // ─── Contracts ───
  @Get('contracts')
  @RequirePermissions(PERMISSIONS.CONTRACT_READ)
  list(
    @Req() req: JwtRequest,
    @Query('status') status?: string, @Query('customerId') customerId?: string,
    @Query('service') service?: string, @Query('q') q?: string,
  ): Promise<ContractDto[]> {
    return this.contracts.list(req, { status, customerId, service, q })
  }

  @Get('contracts/:id')
  @RequirePermissions(PERMISSIONS.CONTRACT_READ)
  findOne(@Param('id') id: string, @Req() req: JwtRequest): Promise<ContractDto> {
    return this.contracts.findOne(id, req)
  }

  @Post('contracts')
  @RequirePermissions(PERMISSIONS.CONTRACT_WRITE)
  create(@Body() body: CreateContractBody, @Req() req: JwtRequest): Promise<ContractDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.contracts.create(body, req.user.sub, auditContext(req))
  }

  @Post('contracts/from-template')
  @RequirePermissions(PERMISSIONS.CONTRACT_WRITE)
  createFromTemplate(@Body() body: CreateFromTemplateBody, @Req() req: JwtRequest): Promise<ContractDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.contracts.createFromTemplate(body, req.user.sub, auditContext(req))
  }

  @Patch('contracts/:id')
  @RequirePermissions(PERMISSIONS.CONTRACT_WRITE)
  update(@Param('id') id: string, @Body() body: UpdateContractBody, @Req() req: JwtRequest): Promise<ContractDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.contracts.update(id, body, req.user.sub, auditContext(req))
  }

  @Post('contracts/:id/submit')
  @RequirePermissions(PERMISSIONS.CONTRACT_WRITE)
  submit(@Param('id') id: string, @Req() req: JwtRequest): Promise<ContractDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.contracts.submit(id, req.user.sub, auditContext(req))
  }

  @Post('contracts/:id/approve')
  approve(@Param('id') id: string, @Body() body: ApproveBody, @Req() req: JwtRequest): Promise<ContractDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.contracts.approve(id, req.user.sub, req.user.role, body.comment, auditContext(req))
  }

  @Post('contracts/:id/reject')
  reject(@Param('id') id: string, @Body() body: RejectBody, @Req() req: JwtRequest): Promise<ContractDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.contracts.reject(id, req.user.sub, req.user.role, body.comment, auditContext(req))
  }

  @Post('contracts/:id/terminate')
  @RequirePermissions(PERMISSIONS.CONTRACT_WRITE)
  terminate(@Param('id') id: string, @Body() body: TerminateBody, @Req() req: JwtRequest): Promise<ContractDto> {
    return this.contracts.terminate(id, body.comment, auditContext(req))
  }

  @Post('contracts/:id/renew')
  @RequirePermissions(PERMISSIONS.CONTRACT_WRITE)
  renew(@Param('id') id: string, @Body() body: RenewBody, @Req() req: JwtRequest): Promise<ContractDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.contracts.renew(id, body, req.user.sub, auditContext(req))
  }
}
