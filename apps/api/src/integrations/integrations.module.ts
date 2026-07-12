import { Module } from '@nestjs/common'
import { ApiKeysService } from './api-keys.service'
import { WebhooksService } from './webhooks.service'
import { PushService } from './push.service'
import { EsignService } from './esign.service'
import { CalendarSyncService } from './calendar-sync.service'
import { IntegrationsController } from './integrations.controller'
import { EsignController } from './esign.controller'
import { CalendarSyncController } from './calendar-sync.controller'
import { ActivitiesModule } from '../activities/activities.module'

@Module({
  imports: [ActivitiesModule],
  providers: [ApiKeysService, WebhooksService, PushService, EsignService, CalendarSyncService],
  controllers: [IntegrationsController, EsignController, CalendarSyncController],
  exports: [ApiKeysService, WebhooksService, PushService, EsignService],
})
export class IntegrationsModule {}
