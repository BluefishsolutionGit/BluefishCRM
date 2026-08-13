import { Module } from '@nestjs/common'
import { ApiKeysService } from './api-keys.service'
import { WebhooksService } from './webhooks.service'
import { PushService } from './push.service'
import { EsignService } from './esign.service'
import { CalendarSyncService } from './calendar-sync.service'
import { CalendarSyncCron } from './calendar-sync.cron'
import { IntegrationsController } from './integrations.controller'
import { EsignController } from './esign.controller'
import { CalendarSyncController } from './calendar-sync.controller'

@Module({
  providers: [ApiKeysService, WebhooksService, PushService, EsignService, CalendarSyncService, CalendarSyncCron],
  controllers: [IntegrationsController, EsignController, CalendarSyncController],
  exports: [ApiKeysService, WebhooksService, PushService, EsignService, CalendarSyncService],
})
export class IntegrationsModule {}
