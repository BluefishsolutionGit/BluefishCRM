import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ReportsService } from './reports.service'
import { ReportExportService } from './report-export.service'
import { MailerService } from '../mailer/mailer.service'
import type { CreateReportScheduleDto, ReportFormat, ReportKey, ReportScheduleDto } from '@bluefish/shared'

@Injectable()
export class ReportSchedulesService {
  private readonly logger = new Logger(ReportSchedulesService.name)

  constructor(
    private prisma: PrismaService,
    private reports: ReportsService,
    private exporter: ReportExportService,
    private mailer: MailerService,
  ) {}

  async list(): Promise<ReportScheduleDto[]> {
    const rows = await this.prisma.reportSchedule.findMany({ orderBy: { createdAt: 'desc' } })
    return rows.map((r) => this.toDto(r))
  }

  async create(input: CreateReportScheduleDto, userId: string): Promise<ReportScheduleDto> {
    if (!input.recipients.length) throw new BadRequestException('At least one recipient required')
    if (!this.isValidCron(input.cron)) throw new BadRequestException(`Invalid cron expression "${input.cron}"`)
    this.reports.findDef(input.reportKey) // throws if unknown

    const row = await this.prisma.reportSchedule.create({
      data: {
        reportKey: input.reportKey,
        filters: (input.filters ?? {}) as Prisma.InputJsonValue,
        cron: input.cron,
        format: input.format ?? 'xlsx',
        recipients: input.recipients.join(','),
        createdById: userId,
      },
    })
    return this.toDto(row)
  }

  async setActive(id: string, isActive: boolean): Promise<ReportScheduleDto> {
    const row = await this.prisma.reportSchedule.findUnique({ where: { id } })
    if (!row) throw new NotFoundException()
    const upd = await this.prisma.reportSchedule.update({ where: { id }, data: { isActive } })
    return this.toDto(upd)
  }

  async delete(id: string): Promise<void> {
    await this.prisma.reportSchedule.delete({ where: { id } })
  }

  /**
   * Runs every minute. For each active schedule whose cron pattern matches "now"
   * (evaluated at minute resolution), generate the report and email it.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    const active = await this.prisma.reportSchedule.findMany({ where: { isActive: true } })
    if (!active.length) return
    const now = new Date()
    for (const s of active) {
      try {
        if (!this.cronMatches(s.cron, now)) continue
        // Avoid double-run within the same minute
        if (s.lastRunAt && Math.abs(now.getTime() - s.lastRunAt.getTime()) < 55_000) continue
        await this.runSchedule(s.id)
      } catch (err) {
        this.logger.error(`Schedule ${s.id} failed`, err as Error)
        await this.prisma.reportSchedule.update({
          where: { id: s.id },
          data: { lastError: err instanceof Error ? err.message : String(err) },
        })
      }
    }
  }

  async runSchedule(id: string): Promise<{ recipients: number; bytes: number }> {
    const row = await this.prisma.reportSchedule.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('Schedule not found')

    const filters = (row.filters ?? {}) as Record<string, string>
    const result = await this.reports.run(row.reportKey as ReportKey, filters)
    const exported = await this.exporter.export(row.format as ReportFormat, result)

    const recipients = row.recipients.split(',').map((s) => s.trim()).filter(Boolean)
    for (const to of recipients) {
      await this.mailer.send({
        to,
        subject: `Scheduled report — ${result.key} (${result.rows.length} rows)`,
        text: `Attached is the scheduled ${result.key} report.\n\nGenerated at ${result.generatedAt}.\nFilters: ${JSON.stringify(result.filters)}\n\n— Bluefish CRM`,
        attachments: [{ filename: exported.filename, contentType: exported.contentType, content: exported.buffer }],
      })
    }
    await this.prisma.reportSchedule.update({
      where: { id }, data: { lastRunAt: new Date(), lastError: null },
    })
    return { recipients: recipients.length, bytes: exported.buffer.length }
  }

  /** Support 5-field cron: minute hour dayOfMonth month dayOfWeek — with * / lists / ranges. */
  private cronMatches(expr: string, at: Date): boolean {
    const parts = expr.trim().split(/\s+/)
    if (parts.length !== 5) return false
    const [minute, hour, dom, month, dow] = parts
    return (
      this.fieldMatches(minute, at.getMinutes(), 0, 59) &&
      this.fieldMatches(hour, at.getHours(), 0, 23) &&
      this.fieldMatches(dom, at.getDate(), 1, 31) &&
      this.fieldMatches(month, at.getMonth() + 1, 1, 12) &&
      this.fieldMatches(dow, at.getDay(), 0, 7)
    )
  }

  private fieldMatches(expr: string, value: number, min: number, max: number): boolean {
    for (const part of expr.split(',')) {
      const stepMatch = part.match(/^(.+)\/(\d+)$/)
      const step = stepMatch ? Number(stepMatch[2]) : 1
      const range = stepMatch ? stepMatch[1] : part
      let start = min, end = max
      if (range === '*') { start = min; end = max }
      else if (range.includes('-')) {
        const [a, b] = range.split('-').map(Number)
        start = a; end = b
      } else {
        start = Number(range); end = Number(range)
      }
      for (let v = start; v <= end; v += step) {
        // Support Sunday as both 0 and 7
        if (v === value || (value === 0 && v === 7) || (value === 7 && v === 0)) return true
      }
    }
    return false
  }

  private isValidCron(expr: string): boolean {
    return expr.trim().split(/\s+/).length === 5
  }

  private toDto(row: {
    id: string; reportKey: string; filters: unknown; cron: string; format: string
    recipients: string; lastRunAt: Date | null; lastError: string | null; isActive: boolean; createdAt: Date
  }): ReportScheduleDto {
    return {
      id: row.id, reportKey: row.reportKey as ReportKey,
      filters: (row.filters as Record<string, string> | null) ?? null,
      cron: row.cron, format: row.format as ReportFormat,
      recipients: row.recipients.split(',').map((s) => s.trim()).filter(Boolean),
      isActive: row.isActive, lastRunAt: row.lastRunAt?.toISOString() ?? null,
      lastError: row.lastError, createdAt: row.createdAt.toISOString(),
    }
  }
}
