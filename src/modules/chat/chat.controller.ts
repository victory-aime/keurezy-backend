import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { API_URL } from '../../config/api';
import { MultipartJson } from '../../config/multipart-json.decorator';
import { CurrentUserId } from '../../guard/current-user.decorator';
import { ChatFilesInterceptor } from './chat-files';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import {
  ConversationIdDto,
  ConversationsQueryDto,
  GetMessagesDto,
  OpenBookingConversationDto,
  OpenPropertyConversationDto,
  SendMessageDto,
} from './chat.dto';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller()
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Post(API_URL.CHAT.OPEN_PROPERTY)
  @ApiOperation({
    summary: 'Contacter l’agence depuis une annonce (client)',
    description: 'Retourne la conversation existante pour ce bien, ou la crée.',
  })
  @ApiBody({ type: OpenPropertyConversationDto })
  @ApiNotFoundResponse({ description: 'Annonce introuvable ou inactive' })
  @ApiForbiddenResponse({ description: 'Le compte connecté n’est pas un compte client' })
  openProperty(@CurrentUserId() userId: string, @Body() dto: OpenPropertyConversationDto) {
    return this.chatService.openPropertyConversation(userId, dto.annonceId);
  }

  @Post(API_URL.CHAT.OPEN_BOOKING)
  @ApiOperation({
    summary: 'Discussion liée à une réservation (client ou agence)',
    description: 'Même conversation que pour le bien ; la réservation devient son contexte.',
  })
  @ApiBody({ type: OpenBookingConversationDto })
  @ApiNotFoundResponse({ description: 'Réservation introuvable' })
  @ApiForbiddenResponse({ description: 'Réservation d’un autre client ou d’une autre agence' })
  openBooking(@CurrentUserId() userId: string, @Body() dto: OpenBookingConversationDto) {
    return this.chatService.openBookingConversation(userId, dto.bookingId);
  }

  @Get(API_URL.CHAT.CONVERSATIONS)
  @ApiOperation({
    summary: 'Mes conversations (client), ou celles d’une agence avec `agencyId`',
  })
  @ApiOkResponse({ description: '{ items, nextCursor, unreadTotal }' })
  getConversations(@CurrentUserId() userId: string, @Query() query: ConversationsQueryDto) {
    return this.chatService.getConversations(userId, query);
  }

  @Get(API_URL.CHAT.DETAIL)
  @ApiOperation({ summary: 'Détail d’une conversation (agence, bien, réservation)' })
  getDetail(@CurrentUserId() userId: string, @Query() query: ConversationIdDto) {
    return this.chatService.getConversationDetail(userId, query.conversationId);
  }

  @Get(API_URL.CHAT.MESSAGES)
  @ApiOperation({ summary: 'Messages paginés (du plus récent au plus ancien)' })
  getMessages(@CurrentUserId() userId: string, @Query() query: GetMessagesDto) {
    return this.chatService.getMessages(userId, query);
  }

  @Post(API_URL.CHAT.MESSAGES)
  @UseInterceptors(ChatFilesInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Envoyer un message avec pièces jointes ou note vocale',
    description:
      'Champ `data` (JSON : conversationId, content?, tempId?, durationMs?) et champ `files` : 3 fichiers maximum, 2 Mo chacun (PDF, JPG, PNG), ou une note vocale seule (m4a/aac, 2 minutes maximum).',
  })
  @ApiBadRequestResponse({
    description:
      'CHAT_EMPTY_MESSAGE, CHAT_TOO_MANY_FILES, CHAT_FILE_TOO_LARGE, CHAT_FILE_TYPE_NOT_ALLOWED, CHAT_VOICE_TOO_LONG',
  })
  async sendMessage(
    @CurrentUserId() userId: string,
    @MultipartJson('data', SendMessageDto) dto: SendMessageDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    const sent = await this.chatService.sendMessage(userId, dto, files);
    return this.chatGateway.dispatchMessage(sent, userId, dto.tempId);
  }

  @Patch(API_URL.CHAT.READ)
  @ApiOperation({ summary: 'Marquer la conversation comme lue (hors socket)' })
  @ApiBody({ type: ConversationIdDto })
  async markRead(@CurrentUserId() userId: string, @Body() dto: ConversationIdDto) {
    const messageIds = await this.chatService.markAllAsRead(dto.conversationId, userId);
    await this.chatGateway.broadcastRead(dto.conversationId, userId, messageIds);
    return { conversationId: dto.conversationId, readCount: messageIds.length };
  }
}
