import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateConversationDto } from './chat.dto';
import { CurrentUserId } from '../../guard/current-user.decorator';

@Controller('v1/secure/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /** Crée ou récupère une conversation avec un user */
  @Post('conversations')
  createConversation(@CurrentUserId() userId: string, @Body() dto: CreateConversationDto) {
    return this.chatService.findOrCreateConversation(userId, dto);
  }

  @Get('conversations')
  getConversations(@CurrentUserId() userId: string) {
    return this.chatService.getUserConversations(userId);
  }

  @Get('conversations/messages')
  getMessages(
    @CurrentUserId() userId: string,
    @Query('conversationId') conversationId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.chatService.getMessages(userId, { conversationId, cursor, limit });
  }
}
