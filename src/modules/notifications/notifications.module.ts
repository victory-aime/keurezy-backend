import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { BullModule } from '@nestjs/bullmq';
import { ExpoPushService } from '_root/modules/notifications/expo-push.service';
import { WebPushService } from '_root/modules/notifications/web-push.service';
import { PushProcessor } from '_root/modules/notifications/push.processor';
import { PUSH_QUEUE } from '_root/modules/notifications/dto/push-job';
import { PushSubscriptionModule } from '_root/modules/push-subscription/push-subscription.module';
import { NotificationsTestController } from '_root/modules/notifications/TestPush.controller';

@Module({
  imports: [],
  controllers: [NotificationsController, NotificationsTestController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
