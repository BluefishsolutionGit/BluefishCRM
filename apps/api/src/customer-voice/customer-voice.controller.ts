import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { CustomerVoiceService } from './customer-voice.service'
import { auditContext } from '../common/request-context'
import { VOICE_KINDS, VOICE_SOURCES } from '@bluefish/shared'
import type { CustomerVoiceDashboardDto, CustomerVoiceDto, VoiceKind, VoiceSource } from '@bluefish/shared'
import type { Request } from 'express'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class CreateVoiceBody {
  @IsString() @MinLength(1) customerId!: string
  @IsIn(VOICE_KINDS as readonly string[]) kind!: VoiceKind
  @IsString() @MinLength(1) @MaxLength(2000) text!: string
  @IsOptional() @IsInt() @Min(0) @Max(10) rating?: number | null
  @IsOptional() @IsIn(VOICE_SOURCES as readonly string[]) source?: VoiceSource | null
  @IsOptional() @IsString() @MaxLength(64) topic?: string
  @IsOptional() @IsString() activityId?: string
  @IsOptional() @IsString() opportunityId?: string
}

class UpdateVoiceBody {
  @IsOptional() @IsIn(VOICE_KINDS as readonly string[]) kind?: VoiceKind
  @IsOptional() @IsString() @MinLength(1) @MaxLength(2000) text?: string
  @IsOptional() @IsInt() @Min(0) @Max(10) rating?: number | null
  @IsOptional() @IsIn(VOICE_SOURCES as readonly string[]) source?: VoiceSource | null
  @IsOptional() @IsString() @MaxLength(64) topic?: string
  @IsOptional() @IsString() activityId?: string
  @IsOptional() @IsString() opportunityId?: string
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('customer-voice')
export class CustomerVoiceController {
  constructor(private svc: CustomerVoiceService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  list(
    @Query('customerId') customerId?: string,
    @Query('kind') kind?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ): Promise<CustomerVoiceDto[]> {
    if (kind && !(VOICE_KINDS as readonly string[]).includes(kind)) {
      throw new BadRequestException(`Unknown kind "${kind}"`)
    }
    return this.svc.list({
      customerId: customerId || undefined,
      kind: kind as VoiceKind | undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? Math.min(500, Math.max(1, Number(limit) | 0)) : undefined,
    })
  }

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  dashboard(@Query('windowDays') windowDays?: string): Promise<CustomerVoiceDashboardDto> {
    const n = windowDays ? Math.min(365, Math.max(1, Number(windowDays) | 0)) : 30
    return this.svc.dashboard(n)
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  findOne(@Param('id') id: string): Promise<CustomerVoiceDto> {
    return this.svc.findOne(id)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  create(@Body() body: CreateVoiceBody, @Req() req: JwtRequest): Promise<CustomerVoiceDto> {
    if (!req.user) throw new UnauthorizedException()
    const ctx = { ...auditContext(req), userId: req.user.sub }
    return this.svc.create(body, ctx)
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  update(@Param('id') id: string, @Body() body: UpdateVoiceBody, @Req() req: JwtRequest): Promise<CustomerVoiceDto> {
    if (!req.user) throw new UnauthorizedException()
    const ctx = { ...auditContext(req), userId: req.user.sub }
    return this.svc.update(id, body, ctx)
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  async delete(@Param('id') id: string, @Req() req: JwtRequest): Promise<void> {
    if (!req.user) throw new UnauthorizedException()
    const ctx = { ...auditContext(req), userId: req.user.sub }
    await this.svc.delete(id, ctx)
  }
}
