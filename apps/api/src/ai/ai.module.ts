import { Module } from '@nestjs/common'
import { LlmClient } from './llm-client'
import { AiRunsService } from './ai-runs.service'
import { AgentOrchestrator } from './agent-orchestrator.service'
import { ReviewQueueService } from './review-queue.service'
import { CardScanService } from './card-scan.service'
import { TesseractOcrService } from './tesseract-ocr.service'
import { AiController } from './ai.controller'
import { UserAiKeysService } from './user-ai-keys.service'
import { UserAiKeysController } from './user-ai-keys.controller'
import { LeadsModule } from '../leads/leads.module'
import { ActivitiesModule } from '../activities/activities.module'
import { OpportunitiesModule } from '../opportunities/opportunities.module'
import { IntegrationsModule } from '../integrations/integrations.module'

@Module({
  imports: [LeadsModule, ActivitiesModule, OpportunitiesModule, IntegrationsModule],
  providers: [LlmClient, AiRunsService, AgentOrchestrator, ReviewQueueService, CardScanService, TesseractOcrService, UserAiKeysService],
  controllers: [AiController, UserAiKeysController],
})
export class AiModule {}
