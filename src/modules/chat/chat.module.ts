import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { WsBetterAuthGuard } from '../../guard/ws.guard';

@Module({
  imports: [NotificationsModule, UsersModule],
  providers: [ChatGateway, ChatService, WsBetterAuthGuard],
  controllers: [ChatController],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}
