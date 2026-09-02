import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req, UnauthorizedException, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common'
import { AnyFilesInterceptor } from '@nestjs/platform-express'
import { MinLength } from 'class-validator'
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { AgentOrchestrator } from './agent-orchestrator.service'
import { AiRunsService } from './ai-runs.service'
import { ReviewQueueService } from './review-queue.service'
import { CardScanService } from './card-scan.service'
import { auditContext } from '../common/request-context'
import type { Request } from 'express'
import type { AiAgentDto, AiAgentKey, AiCostSummaryDto, AiResultDto, AiRunDto, ScanCardResultDto } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class RunBody {
  @IsOptional() input?: Record<string, unknown>
  @IsOptional() @IsBoolean() isDryRun?: boolean
}
class ReviewBody {
  @IsIn(['accept', 'reject']) decision!: 'accept' | 'reject'
  @IsOptional() @IsString() comment?: string
}
class ParseCardTextBody {
  @IsString() @MinLength(3) text!: string
}
class ScanCardConfigBody {
  @IsOptional() @IsString() anthropicApiKey?: string | null
}

const VALID_AGENTS: AiAgentKey[] = ['lead_hunter', 'sales_assistant', 'meeting_assistant', 'document_assistant', 'forecast_assistant']

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ai')
export class AiController {
  constructor(
    private orchestrator: AgentOrchestrator,
    private runs: AiRunsService,
    private queue: ReviewQueueService,
    private cardScan: CardScanService,
  ) {}

  @Get('agents')
  @RequirePermissions(PERMISSIONS.LEAD_READ)
  listAgents(): Promise<AiAgentDto[]> {
    return this.orchestrator.listAgents()
  }

  @Post('agents/:key/run')
  @RequirePermissions(PERMISSIONS.LEAD_READ)
  async runAgent(@Param('key') key: string, @Body() body: RunBody, @Req() req: JwtRequest): Promise<AiRunDto> {
    if (!VALID_AGENTS.includes(key as AiAgentKey)) throw new BadRequestException(`Unknown agent "${key}"`)
    if (!req.user) throw new UnauthorizedException()
    return this.orchestrator.run(key as AiAgentKey, req.user.sub, { input: body.input, isDryRun: body.isDryRun })
  }

  @Get('runs')
  @RequirePermissions(PERMISSIONS.LEAD_READ)
  listRuns(@Query('agentKey') agentKey?: string, @Query('limit') limit?: string): Promise<AiRunDto[]> {
    return this.runs.list({ agentKey, limit: limit ? Number(limit) : undefined })
  }

  @Get('runs/:id')
  @RequirePermissions(PERMISSIONS.LEAD_READ)
  findRun(@Param('id') id: string): Promise<AiRunDto> {
    return this.runs.findOne(id)
  }

  @Get('review-queue')
  @RequirePermissions(PERMISSIONS.LEAD_READ)
  listReview(@Query('agentKey') agentKey?: string): Promise<AiResultDto[]> {
    return this.queue.list(agentKey)
  }

  @Post('review-queue/:id/review')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.LEAD_WRITE)
  async review(@Param('id') id: string, @Body() body: ReviewBody, @Req() req: JwtRequest): Promise<AiResultDto> {
    if (!req.user) throw new UnauthorizedException()
    const ctx = { ...auditContext(req), userId: req.user.sub }
    return body.decision === 'accept'
      ? this.queue.accept(id, ctx)
      : this.queue.reject(id, req.user.sub)
  }

  @Get('cost-summary')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  cost(): Promise<AiCostSummaryDto> {
    return this.runs.costSummary()
  }

  /**
   * Accept 1 or 2 images (front + optional back). Uses AnyFilesInterceptor
   * so both the new client (posting under field `files`) and the old cached
   * bundle still floating around browsers (posting under `file`) work.
   * Only the first two files are used; extras are ignored.
   */
  @Post('scan-card')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  @UseInterceptors(AnyFilesInterceptor())
  async scanCard(@UploadedFiles() files: Express.Multer.File[] | undefined): Promise<ScanCardResultDto> {
    if (!files || files.length === 0) throw new BadRequestException('No image uploaded')
    const sides = files.slice(0, 2).map((f) => ({ buffer: f.buffer, mimeType: f.mimetype }))
    return this.cardScan.extractMulti(sides)
  }

  /**
   * Parse OCR text that the user got from an external tool (Google Lens,
   * iOS Live Text, Samsung Bixby, etc). Runs the same field extractor as
   * the Tesseract fallback path — no vision AI needed, no per-scan cost,
   * and the user gets Google-grade OCR quality on Thai cards for free.
   */
  @Post('parse-card-text')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  async parseCardText(@Body() body: ParseCardTextBody): Promise<ScanCardResultDto> {
    return this.cardScan.parseText(body.text)
  }

  @Get('scan-card/config')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  async scanCardConfig() {
    return this.cardScan.status()
  }

  @Put('scan-card/config')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  async updateScanCardConfig(@Body() body: ScanCardConfigBody, @Req() req: JwtRequest) {
    // Empty string / null → clear the DB override so env value wins again.
    const trimmed = body.anthropicApiKey?.trim()
    await this.cardScan.setAnthropicKey(trimmed && trimmed.length > 0 ? trimmed : null, req.user?.sub ?? null)
    return this.cardScan.status()
  }
}
