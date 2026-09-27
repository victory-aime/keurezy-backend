import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatAccessService } from './chat-access.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

/**
 * Chat client ↔ agence. Ne dépend pas des notifications : les nouveaux messages
 * sont publiés sur le bus d'événements (`chat.message.created`).
 */
@Module({
  imports: [CloudinaryModule],
  providers: [ChatGateway, ChatService, ChatAccessService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
