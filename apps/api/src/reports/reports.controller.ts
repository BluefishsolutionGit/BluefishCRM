import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common'
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { ReportsService } from './reports.service'
import { ReportExportService } from './report-export.service'
import { ReportSchedulesService } from './report-schedules.service'
import type { Request, Response } from 'express'
import type { ReportDefinitionDto, ReportFormat, ReportKey, ReportResultDto, ReportScheduleDto } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

const FORMATS: ReportFormat[] = ['xlsx', 'pdf', 'docx']
const KEYS: ReportKey[] = ['lead_conversion', 'activity_summary', 'opportunity_pipeline', 'customer_overview', 'contract_status']

class RunBody {
  @IsOptional() filters?: Record<string, string>
}
class CreateScheduleBody {
  @IsIn(KEYS) reportKey!: ReportKey
  @IsOptional() filters?: Record<string, string>
  @IsString() @MinLength(9) cron!: string
  @IsOptional() @IsIn(FORMATS) format?: ReportFormat
  @IsArray() @IsString({ each: true }) recipients!: string[]
}
class ToggleBody {
  @IsBoolean() isActive!: boolean
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class ReportsController {
  constructor(
    private reports: ReportsService,
    private exporter: ReportExportService,
    private schedules: ReportSchedulesService,
  ) {}

  @Get('reports')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  list(): ReportDefinitionDto[] {
    return this.reports.list()
  }

  @Post('reports/:key/run')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  run(@Param('key') key: string, @Body() body: RunBody): Promise<ReportResultDto> {
    if (!KEYS.includes(key as ReportKey)) throw new BadRequestException(`Unknown report "${key}"`)
    return this.reports.run(key as ReportKey, body.filters ?? {})
  }

  @Post('reports/:key/export')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async exportReport(
    @Param('key') key: string,
    @Query('format') format: string | undefined,
    @Body() body: RunBody,
    @Res() res: Response,
  ): Promise<void> {
    if (!KEYS.includes(key as ReportKey)) throw new BadRequestException(`Unknown report "${key}"`)
    const fmt = (format ?? 'xlsx') as ReportFormat
    if (!FORMATS.includes(fmt)) throw new BadRequestException(`Unknown format "${fmt}"`)
    const result = await this.reports.run(key as ReportKey, body.filters ?? {})
    const exp = await this.exporter.export(fmt, result)
    res.setHeader('Content-Type', exp.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${exp.filename}"`)
    res.end(exp.buffer)
  }

  @Get('report-schedules')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  listSchedules(): Promise<ReportScheduleDto[]> {
    return this.schedules.list()
  }

  @Post('report-schedules')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  createSchedule(@Body() body: CreateScheduleBody, @Req() req: JwtRequest): Promise<ReportScheduleDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.schedules.create(body, req.user.sub)
  }

  @Patch('report-schedules/:id')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  toggleSchedule(@Param('id') id: string, @Body() body: ToggleBody): Promise<ReportScheduleDto> {
    return this.schedules.setActive(id, body.isActive)
  }

  @Delete('report-schedules/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async deleteSchedule(@Param('id') id: string): Promise<void> {
    await this.schedules.delete(id)
  }

  @Post('report-schedules/:id/run')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  runNow(@Param('id') id: string): Promise<{ recipients: number; bytes: number }> {
    return this.schedules.runSchedule(id)
  }
}

