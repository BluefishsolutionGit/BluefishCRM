import { Module } from '@nestjs/common'
import { LlmClient } from './llm-client'
import { AiRunsService } from './ai-runs.service'
import { AgentOrchestrator } from './agent-orchestrator.service'
import { ReviewQueueService } from './review-queue.service'
import { AiController } from './ai.controller'
import { LeadsModule } from '../leads/leads.module'
import { ActivitiesModule } from '../activities/activities.module'
import { OpportunitiesModule } from '../opportunities/opportunities.module'

@Module({
  imports: [LeadsModule, ActivitiesModule, OpportunitiesModule],
  providers: [LlmClient, AiRunsService, AgentOrchestrator, ReviewQueueService],
  controllers: [AiController],
})
export class AiModule {}
