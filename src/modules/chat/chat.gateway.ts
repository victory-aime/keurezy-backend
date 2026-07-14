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
import { Logger } from '@nestjs/common';
import { ChatService } from './chat.service';
import { SendMessageDto, TypingPayload } from './chat.dto';
import { MessageStatus, NotificationType } from '../../../prisma/generated/enums';
import { PushNotificationService } from '../notifications/push-notification.service';
import { getAuthInstance } from '../../lib/auth';

const connectedUsers = new Map<string, Set<string>>();
const openConversationByUser = new Map<string, string>();

interface SendMessageWithTempId extends SendMessageDto {
  tempId?: string;
}

type SendMessageAck = (response: { success: boolean; message?: any; error?: string }) => void;

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
    private readonly pushService: PushNotificationService,
  ) {}

  async handleConnection(client: Socket) {
    this.logger.log(`Connexion tentée — socketId: ${client.id}`);

    try {
      const rawHeaders = client.handshake.headers;
      const headers = new Headers();
      Object.entries(rawHeaders).forEach(([key, value]) => {
        if (typeof value === 'string') headers.append(key, value);
        else if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
      });

      const auth = getAuthInstance();
      const session = await auth.api.getSession({ headers });

      if (!session?.user?.id) {
        this.logger.warn(`Session introuvable — socketId: ${client.id}`);
        client.disconnect();
        return;
      }

      const userId = session.user.id;
      client.data.userId = userId;
      client.data.user = session.user;

      client.join(`user:${userId}`);

      if (!connectedUsers.has(userId)) connectedUsers.set(userId, new Set());
      connectedUsers.get(userId)!.add(client.id);

      this.logger.log(
        `User connecté: ${userId} — socketId: ${client.id} — total sockets actifs: ${connectedUsers.get(userId)!.size}`,
      );

      this.server.emit('presence:update', { userId, online: true });
    } catch (error) {
      this.logger.error(`Erreur résolution session WS: ${error}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;

    const sockets = connectedUsers.get(userId);
    sockets?.delete(client.id);

    this.logger.log(`Déconnexion — userId: ${userId} — sockets restants: ${sockets?.size ?? 0}`);

    if (!sockets?.size) {
      connectedUsers.delete(userId);
      openConversationByUser.delete(userId);
      this.server.emit('presence:update', { userId, online: false });
    }
  }

  @SubscribeMessage('message:send')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SendMessageWithTempId,
  ) {
    const senderId = client.data.userId;
    if (!senderId) {
      client.disconnect();
      return;
    }

    try {
      const message = await this.chatService.sendMessage(senderId, dto);
      await this.chatService.createReceiptsForMessage(message.id, dto.conversationId, senderId);

      const recipientIds = await this.chatService.getActiveRecipientIds(
        dto.conversationId,
        senderId,
      );

      for (const recipientId of recipientIds) {
        const isOnline = connectedUsers.has(recipientId);
        const hasConversationOpen = openConversationByUser.get(recipientId) === dto.conversationId;

        if (isOnline) {
          const status = hasConversationOpen ? MessageStatus.READ : MessageStatus.DELIVERED;
          await this.chatService.updateReceiptStatus(message.id, recipientId, status);

          // FIX : pas de compteur si la conv est ouverte (status = READ, pas de pastille)
          if (!hasConversationOpen) {
            await this.chatService.incrementUnreadCount(dto.conversationId, recipientId);
          }

          this.server.to(`user:${recipientId}`).emit('message:receive', { ...message, status });
        } else {
          await this.chatService.incrementUnreadCount(dto.conversationId, recipientId);
          try {
            await this.pushService.sendToUser(recipientId, {
              title: 'Nouveau message',
              body:
                message.content.length > 60 ? `${message.content.slice(0, 60)}…` : message.content,
              notificationId: message.id,
              type: NotificationType.LEAD,
            });
          } catch (pushError) {
            this.logger.error(`Échec push FCM à ${recipientId}: ${pushError}`);
          }
        }
      }
      const bestStatus = await this.chatService.getMessageConsolidatedStatus(message.id);
      this.server.to(`user:${senderId}`).emit('message:sent', {
        ...message,
        status: bestStatus,
        tempId: dto.tempId,
      });
    } catch (error) {
      this.logger.error(`Échec traitement message:send: ${error}`);
    }
  }

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const payload: TypingPayload = {
      conversationId: data.conversationId,
      userId: client.data.userId,
      isTyping: true,
    };
    client.to(`conversation:${data.conversationId}`).emit('typing:update', payload);
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const payload: TypingPayload = {
      conversationId: data.conversationId,
      userId: client.data.userId,
      isTyping: false,
    };
    client.to(`conversation:${data.conversationId}`).emit('typing:update', payload);
  }

  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.userId;
    client.join(`conversation:${data.conversationId}`);
    this.logger.log(`socket ${client.id} a rejoint conversation:${data.conversationId}`);

    openConversationByUser.set(userId, data.conversationId);

    const readMessageIds = await this.chatService.markAllAsRead(data.conversationId, userId);

    this.logger.log(`conversation:join — userId=${userId} readMessageIds=${readMessageIds.length}`);

    if (!readMessageIds.length) return;

    const senderIds = await this.chatService.getActiveRecipientIds(data.conversationId, userId);

    for (const senderId of senderIds) {
      this.server.to(`user:${senderId}`).emit('conversation:read', {
        conversationId: data.conversationId,
        userId,
        messageIds: readMessageIds,
        lastReadAt: new Date(),
      });
    }

    this.server.to(`user:${userId}`).emit('unread:reset', {
      conversationId: data.conversationId,
    });
  }

  @SubscribeMessage('conversation:leave')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.userId;
    client.leave(`conversation:${data.conversationId}`);

    if (openConversationByUser.get(userId) === data.conversationId) {
      openConversationByUser.delete(userId);
    }
  }

  isUserOnline(userId: string): boolean {
    return connectedUsers.has(userId);
  }
}
