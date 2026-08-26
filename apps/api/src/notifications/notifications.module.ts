import { Module } from '@nestjs/common'
import { NotificationsController } from './notifications.controller'
import { NotificationsCron } from './notifications.cron'
import { PushService } from './push.service'
import { PushDispatcherCron } from './push-dispatcher.cron'

@Module({
  providers: [NotificationsCron, PushService, PushDispatcherCron],
  controllers: [NotificationsController],
  exports: [PushService],
})
export class NotificationsModule {}
