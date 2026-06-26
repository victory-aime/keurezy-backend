// modules/chat/chat.module.ts
import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { NotificationsModule } from '_root/modules/notifications/notifications.module';
import { WsBetterAuthGuard } from '_root/guard/ws.guard';
import { UsersModule } from '_root/modules/users/users.module';

@Module({
  imports: [NotificationsModule, UsersModule],
  providers: [ChatGateway, ChatService, WsBetterAuthGuard],
  controllers: [ChatController],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}
