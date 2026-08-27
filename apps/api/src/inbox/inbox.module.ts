import { Module } from '@nestjs/common'
import { InboxService } from './inbox.service'
import { InboxController } from './inbox.controller'
import { InboxWebhooksController } from './webhooks.controller'
import { IntegrationsModule } from '../integrations/integrations.module'

@Module({
  imports: [IntegrationsModule],
  providers: [InboxService],
  controllers: [InboxController, InboxWebhooksController],
  exports: [InboxService],
})
export class InboxModule {}
