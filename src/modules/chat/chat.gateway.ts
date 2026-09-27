import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { HttpException, Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { ChatService, SentMessage } from './chat.service';
import { ChatAccessService } from './chat-access.service';
import {
  SendMessageAck,
  SendMessageDto,
  TypingDto,
  TypingPayload,
  ConversationIdDto,
} from './chat.dto';
import { MessageStatus, MessageType } from '../../../prisma/generated/enums';
import { DomainEventBus } from '../events/domain-events';
import { getAuthInstance } from '../../lib/auth';

// Présence en mémoire : valable pour une seule instance (adapter Redis à prévoir en multi-instance)
interface SocketData {
  userId?: string;
}

/** Utilisateur authentifié du socket (renseigné à la connexion). */
const userIdOf = (client: Socket): string => (client.data as SocketData).userId ?? '';

const connectedUsers = new Map<string, Set<string>>();
const openConversationByUser = new Map<string, string>();

const PREVIEW_BY_TYPE: Partial<Record<MessageType, string>> = {
  [MessageType.AUDIO]: '🎤 Note vocale',
  [MessageType.IMAGE]: '📷 Photo',
  [MessageType.FILE]: '📎 Pièce jointe',
};

const toAckError = (error: unknown): SendMessageAck => {
  if (error instanceof HttpException) {
    const response = error.getResponse() as { message?: string; errorCode?: string };
    return { ok: false, error: response.message ?? error.message, errorCode: response.errorCode };
  }
  return { ok: false, error: 'Envoi impossible, réessayez' };
};

@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly access: ChatAccessService,
    private readonly events: DomainEventBus,
  ) {}

  /** Authentification par la session Better Auth (cookie du web, ou header Cookie du mobile). */
  async handleConnection(client: Socket) {
    try {
      const headers = new Headers();
      Object.entries(client.handshake.headers).forEach(([key, value]) => {
        if (typeof value === 'string') headers.append(key, value);
        else if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
      });

      // Cookie de session (mobile, web sur le même domaine), sinon jeton transmis à la connexion
      const session = await getAuthInstance().api.getSession({ headers });
      const handshakeToken = (client.handshake.auth as { token?: unknown } | undefined)?.token;
      const userId =
        session?.user?.id ??
        (typeof handshakeToken === 'string'
          ? await this.access.getUserIdFromSessionToken(handshakeToken)
          : null);
      if (!userId) {
        this.logger.warn(`Connexion chat refusée : session introuvable (socket ${client.id})`);
        client.disconnect();
        return;
      }

      (client.data as SocketData).userId = userId;
      await client.join(`user:${userId}`);

      const wasOffline = !connectedUsers.has(userId);
      if (wasOffline) connectedUsers.set(userId, new Set());
      connectedUsers.get(userId)!.add(client.id);

      if (wasOffline) await this.broadcastPresence(userId, true);
    } catch (error) {
      this.logger.error(`Erreur résolution session WS: ${error}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = userIdOf(client);
    if (!userId) return;

    const sockets = connectedUsers.get(userId);
    sockets?.delete(client.id);
    if (!sockets?.size) {
      connectedUsers.delete(userId);
      openConversationByUser.delete(userId);
      await this.broadcastPresence(userId, false);
    }
  }

  /** Envoi d'un message texte. Les pièces jointes passent par l'API REST (multipart). */
  @SubscribeMessage('message:send')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SendMessageDto,
  ): Promise<SendMessageAck> {
    const senderId = userIdOf(client);
    try {
      const sent = await this.chatService.sendMessage(senderId, dto);
      const message = await this.dispatchMessage(sent, senderId, dto.tempId);
      return { ok: true, message };
    } catch (error) {
      this.logger.warn(`message:send refusé pour ${senderId}: ${error}`);
      const ack = toAckError(error);
      client.emit('message:error', { tempId: dto.tempId, ...ack });
      return ack;
    }
  }

  /**
   * Diffusion commune aux envois socket et REST : accusés DELIVERED/READ selon la présence,
   * compteurs de non-lus, événement pour les destinataires à notifier.
   */
  async dispatchMessage(sent: SentMessage, senderId: string, tempId?: string) {
    const { message, recipientIds, conversation } = sent;
    const toNotify: string[] = [];
    const unread: string[] = [];
    const online: string[] = [];

    // 1. Accusés et compteurs d'abord : un rechargement déclenché par la réception
    //    du message côté client lit ainsi des compteurs déjà à jour
    for (const recipientId of recipientIds) {
      const hasConversationOpen =
        openConversationByUser.get(recipientId) === message.conversationId;

      if (connectedUsers.has(recipientId)) {
        const status = hasConversationOpen ? MessageStatus.READ : MessageStatus.DELIVERED;
        await this.chatService.updateReceiptStatus(message.id, recipientId, status);
        online.push(recipientId);
      } else {
        toNotify.push(recipientId);
      }
      if (!hasConversationOpen) unread.push(recipientId);
    }
    await this.chatService.incrementUnreadCount(message.conversationId, unread);

    // 2. Diffusion aux destinataires connectés
    for (const recipientId of online) {
      this.server.to(`user:${recipientId}`).emit('message:receive', {
        ...message,
        bookingId: conversation.bookingId,
        propertyId: conversation.propertyId,
      });
    }

    if (toNotify.length) {
      this.events.emit('chat.message.created', {
        conversationId: message.conversationId,
        messageId: message.id,
        senderId,
        senderName: sent.senderDisplayName,
        recipientIds: toNotify,
        agencyId: conversation.agencyId,
        propertyId: conversation.propertyId,
        bookingId: conversation.bookingId,
        preview: message.content || PREVIEW_BY_TYPE[message.type] || 'Nouveau message',
      });
    }

    // Compteur de l'expéditeur remis à zéro, et accusés de lecture pour son interlocuteur
    await this.broadcastRead(message.conversationId, senderId, sent.readMessageIds);

    const payload = {
      ...message,
      status: await this.chatService.getConsolidatedStatus(message.id),
    };
    this.server.to(`user:${senderId}`).emit('message:sent', { ...payload, tempId });
    return payload;
  }

  @SubscribeMessage('typing:start')
  handleTypingStart(@ConnectedSocket() client: Socket, @MessageBody() data: TypingDto) {
    this.relayTyping(client, data.conversationId, true);
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(@ConnectedSocket() client: Socket, @MessageBody() data: TypingDto) {
    this.relayTyping(client, data.conversationId, false);
  }

  private relayTyping(client: Socket, conversationId: string, isTyping: boolean) {
    // L'indicateur n'est relayé qu'aux sockets ayant rejoint la conversation (donc déjà autorisés)
    if (!client.rooms.has(`conversation:${conversationId}`)) return;
    const payload: TypingPayload = { conversationId, userId: userIdOf(client), isTyping };
    client.to(`conversation:${conversationId}`).emit('typing:update', payload);
  }

  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ConversationIdDto,
  ) {
    const userId = userIdOf(client);
    const { conversationId } = data;
    try {
      await this.access.assertConversationAccess(conversationId, userId, 'read');
    } catch {
      client.emit('conversation:error', { conversationId, errorCode: 'CHAT_ACCESS_DENIED' });
      return;
    }

    await client.join(`conversation:${conversationId}`);
    openConversationByUser.set(userId, conversationId);

    const readMessageIds = await this.chatService.markAllAsRead(conversationId, userId);
    const others = (await this.chatService.getConversationUserIds(conversationId)).filter(
      (id) => id !== userId,
    );

    // État de présence initial des interlocuteurs
    for (const otherId of others) {
      if (connectedUsers.has(otherId)) {
        client.emit('presence:update', { userId: otherId, online: true });
      }
    }

    await this.broadcastRead(conversationId, userId, readMessageIds, others);
  }

  @SubscribeMessage('conversation:leave')
  async handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ConversationIdDto,
  ) {
    const userId = userIdOf(client);
    await client.leave(`conversation:${data.conversationId}`);
    if (openConversationByUser.get(userId) === data.conversationId) {
      openConversationByUser.delete(userId);
    }
  }

  /**
   * Conversation lue par `userId` : ses appareils remettent le compteur à zéro,
   * et les interlocuteurs reçoivent l'accusé de lecture des messages concernés.
   */
  async broadcastRead(
    conversationId: string,
    userId: string,
    messageIds: string[],
    others?: string[],
  ) {
    this.server.to(`user:${userId}`).emit('unread:reset', { conversationId });
    if (!messageIds.length) return;

    const recipients =
      others ??
      (await this.chatService.getConversationUserIds(conversationId)).filter((id) => id !== userId);
    for (const otherId of recipients) {
      this.server.to(`user:${otherId}`).emit('conversation:read', {
        conversationId,
        userId,
        messageIds,
        lastReadAt: new Date(),
      });
    }
  }

  /** La présence n'est diffusée qu'aux interlocuteurs de l'utilisateur. */
  private async broadcastPresence(userId: string, online: boolean) {
    const contacts = await this.chatService.getContactUserIds(userId);
    if (!contacts.length) return;
    this.server.to(contacts.map((id) => `user:${id}`)).emit('presence:update', { userId, online });
  }

  isUserOnline(userId: string): boolean {
    return connectedUsers.has(userId);
  }
}
