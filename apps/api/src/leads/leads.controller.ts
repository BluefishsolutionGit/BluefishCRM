import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { IsInt, IsOptional, IsString, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { LeadsService } from './leads.service'
import { auditContext } from '../common/request-context'
import type { Request } from 'express'
import type { LeadDto, ConvertLeadDto, DuplicateCheckResult } from '@bluefish/shared'

class CreateLeadBody {
  @IsString() @MinLength(1) name!: string
  @IsString() @MinLength(1) companyName!: string
  @IsOptional() @IsString() email?: string
  @IsOptional() @IsString() phone?: string
  @IsString() source!: string
  @IsOptional() @IsString() ownerId?: string | null
  @IsOptional() @IsString() status?: 'New' | 'Contacted' | 'Qualified' | 'AI Sourced' | 'Converted' | 'Lost'
  @IsOptional() @IsInt() estValue?: number
  @IsOptional() @IsString() serviceOrProduct?: string
  @IsOptional() @IsString() notes?: string
}

class UpdateLeadBody {
  @IsOptional() @IsString() name?: string
  @IsOptional() @IsString() companyName?: string
  @IsOptional() @IsString() email?: string
  @IsOptional() @IsString() phone?: string
  @IsOptional() @IsString() source?: string
  @IsOptional() @IsString() status?: 'New' | 'Contacted' | 'Qualified' | 'AI Sourced' | 'Converted' | 'Lost'
  @IsOptional() @IsInt() estValue?: number
  @IsOptional() @IsString() serviceOrProduct?: string
  @IsOptional() @IsString() notes?: string
}

class DuplicateCheckBody {
  @IsString() @MinLength(1) name!: string
  @IsString() @MinLength(1) companyName!: string
  @IsOptional() @IsString() email?: string
  @IsOptional() @IsString() phone?: string
}

class ConvertLeadBody {
  @IsOptional() @IsString() customerId?: string
  @IsOptional() @IsString() title?: string
  @IsOptional() @IsInt() value?: number
  @IsOptional() @IsInt() probability?: number
  @IsOptional() @IsString() closeDate?: string
}

class AssignBody {
  @IsOptional() @IsString() ownerId?: string | null
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('leads')
export class LeadsController {
  constructor(private leads: LeadsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.LEAD_READ)
  list(@Query('q') q?: string, @Query('status') status?: string): Promise<LeadDto[]> {
    return this.leads.list({ q, status })
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.LEAD_READ)
  findOne(@Param('id') id: string): Promise<LeadDto> {
    return this.leads.findOne(id)
  }

  @Post('duplicate-check')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.LEAD_READ)
  duplicateCheck(@Body() body: DuplicateCheckBody): Promise<DuplicateCheckResult> {
    return this.leads.duplicateCheck(body)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.LEAD_WRITE)
  create(@Body() body: CreateLeadBody, @Req() req: Request): Promise<LeadDto> {
    return this.leads.create(body, auditContext(req), { autoAssign: !body.ownerId })
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.LEAD_WRITE)
  update(@Param('id') id: string, @Body() body: UpdateLeadBody, @Req() req: Request): Promise<LeadDto> {
    return this.leads.update(id, body, auditContext(req))
  }

  @Post(':id/assign')
  @RequirePermissions(PERMISSIONS.LEAD_WRITE)
  assign(@Param('id') id: string, @Body() body: AssignBody, @Req() req: Request): Promise<LeadDto> {
    return this.leads.assign(id, body.ownerId ?? null, auditContext(req))
  }

  @Post(':id/convert')
  @RequirePermissions(PERMISSIONS.LEAD_WRITE)
  convert(@Param('id') id: string, @Body() body: ConvertLeadBody, @Req() req: Request) {
    return this.leads.convert(id, body, auditContext(req))
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.LEAD_WRITE)
  async delete(@Param('id') id: string, @Req() req: Request): Promise<void> {
    await this.leads.delete(id, auditContext(req))
  }
}
