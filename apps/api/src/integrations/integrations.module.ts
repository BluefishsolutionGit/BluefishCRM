import { Module } from '@nestjs/common'
import { ApiKeysService } from './api-keys.service'
import { WebhooksService } from './webhooks.service'
import { PushService } from './push.service'
import { EsignService } from './esign.service'
import { CalendarSyncService } from './calendar-sync.service'
import { CalendarSyncCron } from './calendar-sync.cron'
import { ChannelIntegrationsService } from './channel-integrations.service'
import { IntegrationsController } from './integrations.controller'
import { EsignController } from './esign.controller'
import { CalendarSyncController } from './calendar-sync.controller'
import { ChannelIntegrationsController } from './channel-integrations.controller'

@Module({
  providers: [ApiKeysService, WebhooksService, PushService, EsignService, CalendarSyncService, CalendarSyncCron, ChannelIntegrationsService],
  controllers: [IntegrationsController, EsignController, CalendarSyncController, ChannelIntegrationsController],
  exports: [ApiKeysService, WebhooksService, PushService, EsignService, CalendarSyncService, ChannelIntegrationsService],
})
export class IntegrationsModule {}
