import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PushNotificationService } from './push-notification.service';
import { PushNotificationController } from './push-notification.controller';
import { FirebaseModule } from '../firebase/firebase.module';
import { PreferencesModule } from '../preferences/preferences.module';
import { EmailModule } from '../mail/mail.module';
import { BookingEmailListener } from './booking-email.listener';
import { ListingNotificationListener } from './listing-notification.listener';
import { ChatNotificationListener } from './chat-notification.listener';
import { ExpoPushService } from './expo-push.service';
import { SubscriptionLifecycleListener } from './subscription-lifecycle.listener';

@Module({
  imports: [FirebaseModule, PreferencesModule, EmailModule],
  controllers: [NotificationsController, PushNotificationController],
  providers: [
    NotificationsService,
    PushNotificationService,
    ExpoPushService,
    ChatNotificationListener,
    BookingEmailListener,
    ListingNotificationListener,
    SubscriptionLifecycleListener,
  ],
  exports: [NotificationsService, PushNotificationService],
})
export class NotificationsModule {}
