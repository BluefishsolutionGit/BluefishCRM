import { Module } from '@nestjs/common'
import { InboxService } from './inbox.service'
import { InboxController } from './inbox.controller'
import { InboxWebhooksController } from './webhooks.controller'

@Module({
  providers: [InboxService],
  controllers: [InboxController, InboxWebhooksController],
  exports: [InboxService],
})
export class InboxModule {}
