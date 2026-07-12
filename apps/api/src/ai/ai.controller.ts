import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { AgentOrchestrator } from './agent-orchestrator.service'
import { AiRunsService } from './ai-runs.service'
import { ReviewQueueService } from './review-queue.service'
import { auditContext } from '../common/request-context'
import type { Request } from 'express'
import type { AiAgentDto, AiAgentKey, AiCostSummaryDto, AiResultDto, AiRunDto } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class RunBody {
  @IsOptional() input?: Record<string, unknown>
  @IsOptional() @IsBoolean() isDryRun?: boolean
}
class ReviewBody {
  @IsIn(['accept', 'reject']) decision!: 'accept' | 'reject'
  @IsOptional() @IsString() comment?: string
}

const VALID_AGENTS: AiAgentKey[] = ['lead_hunter', 'sales_assistant', 'meeting_assistant', 'document_assistant', 'forecast_assistant']

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ai')
export class AiController {
  constructor(
    private orchestrator: AgentOrchestrator,
    private runs: AiRunsService,
    private queue: ReviewQueueService,
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
}
