import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { CommonModule } from '_root/modules/common/common.module';
import { PushNotificationService } from './push-notification.service';
import { PushNotificationController } from './push-notification.controller';

@Module({
  imports: [CommonModule],
  controllers: [NotificationsController, PushNotificationController],
  providers: [NotificationsService, PushNotificationService],
  exports: [NotificationsService, PushNotificationService],
})
export class NotificationsModule {}
