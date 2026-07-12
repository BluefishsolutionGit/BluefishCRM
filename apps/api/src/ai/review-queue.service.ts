import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AiRunsService } from './ai-runs.service'
import { LeadsService } from '../leads/leads.service'
import { ActivitiesService } from '../activities/activities.service'
import { OpportunitiesService } from '../opportunities/opportunities.service'
import type { AiResultDto } from '@bluefish/shared'
import type { AuditRequestContext } from '../common/request-context'

interface AcceptContext extends AuditRequestContext {
  userId: string
}

@Injectable()
export class ReviewQueueService {
  constructor(
    private prisma: PrismaService,
    private runs: AiRunsService,
    private leads: LeadsService,
    private activities: ActivitiesService,
    private opportunities: OpportunitiesService,
  ) {}

  async list(agentKey?: string): Promise<AiResultDto[]> {
    return this.runs.listPendingResults(agentKey)
  }

  async accept(resultId: string, ctx: AcceptContext): Promise<AiResultDto> {
    const result = await this.runs.findResult(resultId)
    if (result.reviewStatus !== 'pending') throw new BadRequestException('Result already reviewed')

    const payload = result.payload as Record<string, unknown>
    let createdCrm: { id: string; type: string } | undefined

    switch (result.kind) {
      case 'lead': {
        const title = String(payload.title ?? 'AI-sourced prospect')
        const source = String(payload.source ?? 'AI Hunter')
        const budget = typeof payload.budgetTHB === 'number' ? payload.budgetTHB : undefined
        const notes = String(payload.notes ?? '')
        const lead = await this.leads.create(
          {
            name: title.split(' ')[0] ?? 'AI Prospect',
            companyName: title,
            source: source.includes('e-GP') ? 'e-GP Tender' : source.includes('Referral') ? 'Referral' : 'Website',
            estValue: budget,
            notes,
          },
          { userId: ctx.userId, ip: ctx.ip, userAgent: ctx.userAgent },
          { autoAssign: true },
        )
        createdCrm = { id: lead.id, type: 'lead' }
        break
      }
      case 'action_item': {
        const title = String(payload.title ?? 'Action item')
        const inputRun = await this.prisma.aiRun.findUnique({ where: { id: result.runId } })
        const inputData = inputRun?.input as Record<string, unknown> | null
        const customerId = typeof inputData?.customerId === 'string' ? inputData.customerId : undefined
        const activity = await this.activities.create(
          {
            type: 'task', title,
            description: `Auto-created from Meeting AI. Original owner mentioned: ${String(payload.owner ?? 'unassigned')}. Due: ${String(payload.due ?? '')}`,
            scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            ownerId: ctx.userId, customerId,
          },
          { userId: ctx.userId, ip: ctx.ip, userAgent: ctx.userAgent },
        )
        createdCrm = { id: activity.id, type: 'activity' }
        break
      }
      case 'meeting_mom': {
        // MOM itself doesn't map to a CRM record — just accept it (attach later via activity notes)
        const crmUpdates = payload.crmUpdates as { updateStage?: string; updateProbability?: number } | undefined
        const inputRun = await this.prisma.aiRun.findUnique({ where: { id: result.runId } })
        const inputData = inputRun?.input as Record<string, unknown> | null
        const opportunityId = typeof inputData?.opportunityId === 'string' ? inputData.opportunityId : undefined
        if (crmUpdates && opportunityId) {
          const opp = await this.opportunities.update(
            opportunityId,
            {
              stage: crmUpdates.updateStage as 'Qualification' | 'Proposal' | 'Negotiation' | 'Won' | 'Lost' | undefined,
              probability: crmUpdates.updateProbability,
            },
            { userId: ctx.userId, ip: ctx.ip, userAgent: ctx.userAgent },
          )
          createdCrm = { id: opp.id, type: 'opportunity' }
        }
        break
      }
      case 'customer_brief':
      case 'doc_extraction':
      case 'forecast':
        // These are advisory outputs — accepting simply records the review, no CRM record created.
        break
      default:
        throw new BadRequestException(`Cannot accept result kind "${result.kind}"`)
    }

    return this.runs.setReviewed(resultId, 'accepted', ctx.userId, createdCrm)
  }

  async reject(resultId: string, userId: string): Promise<AiResultDto> {
    return this.runs.setReviewed(resultId, 'rejected', userId)
  }
}
