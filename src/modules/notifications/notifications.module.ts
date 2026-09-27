import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PushNotificationService } from './push-notification.service';
import { PushNotificationController } from './push-notification.controller';
import { FirebaseModule } from '../firebase/firebase.module';
import { ChatNotificationListener } from './chat-notification.listener';
import { ExpoPushService } from './expo-push.service';

@Module({
  imports: [FirebaseModule],
  controllers: [NotificationsController, PushNotificationController],
  providers: [
    NotificationsService,
    PushNotificationService,
    ExpoPushService,
    ChatNotificationListener,
  ],
  exports: [NotificationsService, PushNotificationService],
})
export class NotificationsModule {}
