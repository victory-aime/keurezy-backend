import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatService } from '_root/modules/chat/chat.service';
import { PresenceService } from '_root/modules/chat/presence.service';
import { ChatController } from '_root/modules/chat/chat.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService, PresenceService],
})
export class ChatModule {}
