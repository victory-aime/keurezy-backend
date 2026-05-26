import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ChatService } from '_root/modules/chat/chat.service';
import { Session } from '@thallesp/nestjs-better-auth';
import { CreateConversationDto } from '_root/modules/chat/dto/message.dto';

@Controller('conversations')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /** GET /conversations — liste des conversations de l'utilisateur */
  @Get()
  getConversations(@Session('id') data: { user: { id: string } }) {
    console.log('getConversations', data);
    return this.chatService.getConversations(data?.user?.id);
  }

  /** GET /conversations/unread — compteurs de non-lus par conversation */
  @Get('unread')
  getUnreadCounts(@Session('id') data: { user: { id: string } }) {
    return this.chatService.getUnreadCounts(data?.user?.id);
  }

  /** GET /conversations/:id/messages?cursor=xxx — messages paginés */
  @Get(':id/messages')
  getMessages(
    @Param('id') id: string,
    @Session('id') data: { user: { id: string } },
    @Query('cursor') cursor?: string,
  ) {
    return this.chatService.getMessages(id, data?.user?.id, cursor);
  }

  /** POST /conversations — crée ou retourne une conversation existante */
  @Post()
  createConversation(
    @Session('id') data: { user: { id: string } },
    @Body() dto: CreateConversationDto,
  ) {
    return this.chatService.createConversation(data?.user?.id, dto);
  }
}
