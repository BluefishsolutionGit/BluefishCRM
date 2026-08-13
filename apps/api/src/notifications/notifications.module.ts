import { Module } from '@nestjs/common'
import { NotificationsController } from './notifications.controller'
import { NotificationsCron } from './notifications.cron'

@Module({
  providers: [NotificationsCron],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
