import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '_root/database/prisma.service';
import { ChatService } from '_root/modules/chat/chat.service';
import { PresenceService } from '_root/modules/chat/presence.service';
import { ReadReceiptDto, SendMessageDto } from '_root/modules/chat/dto/message.dto';
import { PUSH_QUEUE, PushJobData } from '_root/modules/notifications/dto/push-job';

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
    credentials: true,
  },
})
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly presenceService: PresenceService,
    @InjectQueue(PUSH_QUEUE) private readonly pushQueue: Queue<PushJobData>,
  ) {}

  // ── Middleware auth sur le handshake ─────────────────────────
  afterInit(server: Server) {
    server.use(async (socket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ??
          socket.handshake.headers?.authorization?.replace('Bearer ', '');

        if (!token) return next(new Error('UNAUTHORIZED'));

        const session = await this.prisma.session.findFirst({
          where: { token, expiresAt: { gt: new Date() } },
          include: { user: true },
        });

        if (!session?.user) return next(new Error('UNAUTHORIZED'));

        socket.data.userId = session.user.id;
        socket.data.user = session.user;
        next();
      } catch {
        next(new Error('UNAUTHORIZED'));
      }
    });

    this.logger.log('ChatGateway ready');
  }

  // ── Lifecycle ────────────────────────────────────────────────
  async handleConnection(client: Socket) {
    const { userId } = client.data;
    await client.join(`user:${userId}`);
    await this.presenceService.setOnline(userId, client.id);

    // Annonce la présence aux contacts connectés
    this.server.emit('presence_update', { userId, online: true });
    this.logger.log(`+ ${client.id} (user: ${userId})`);
  }

  async handleDisconnect(client: Socket) {
    const { userId } = client.data;
    if (!userId) return;
    await this.presenceService.setOffline(userId, client.id);

    const stillOnline = await this.presenceService.isOnline(userId);
    if (!stillOnline) {
      this.server.emit('presence_update', { userId, online: false });
    }
    this.logger.log(`- ${client.id} (user: ${userId})`);
  }

  // ── Events ───────────────────────────────────────────────────

  /** Rejoindre une room de conversation (lazy — au premier scroll) */
  @SubscribeMessage('join_conversation')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody('conversationId') conversationId: string,
  ) {
    await this.chatService.assertParticipant(conversationId, client.data.userId);
    await client.join(`conv:${conversationId}`);
    return { event: 'joined', conversationId };
  }

  /** Envoi d'un message */
  @SubscribeMessage('send_message')
  async handleSendMessage(@ConnectedSocket() client: Socket, @MessageBody() dto: SendMessageDto) {
    const senderId = client.data.userId;
    const { message, recipientIds } = await this.chatService.saveMessage(senderId, dto);

    // Broadcast à tous les membres de la room
    this.server.to(`conv:${dto.conversationId}`).emit('new_message', message);

    // Présence batch — un seul round-trip Redis
    const onlineMap = await this.presenceService.getOnlineMap(recipientIds);
    const offlineIds: string[] = [];

    for (const uid of recipientIds) {
      if (onlineMap[uid]) {
        await this.chatService.markDelivered(message.id, uid);
        this.server.to(`user:${uid}`).emit('message_delivered', {
          messageId: message.id,
          conversationId: dto.conversationId,
        });
      } else {
        offlineIds.push(uid);
      }
    }

    // Enqueue push pour les offline uniquement
    if (offlineIds.length) {
      await this.pushQueue.add(
        'new-message',
        {
          userIds: offlineIds,
          payload: {
            title: client.data.user.name,
            body: dto.type === 'TEXT' ? dto.content : '📎 Fichier reçu',
            data: {
              type: 'new_message',
              conversationId: dto.conversationId,
              messageId: message.id,
            },
          },
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true },
      );
    }

    return { event: 'message_sent', messageId: message.id };
  }

  /** Acquittement de lecture (toute la conversation) */
  @SubscribeMessage('read_conversation')
  async handleRead(@ConnectedSocket() client: Socket, @MessageBody() dto: ReadReceiptDto) {
    const userId = client.data.userId;
    const readAt = await this.chatService.markConversationRead(dto.conversationId, userId);

    // Notifie les autres membres que tout a été lu
    client.to(`conv:${dto.conversationId}`).emit('messages_read', {
      conversationId: dto.conversationId,
      userId,
      readAt,
    });
  }

  /** Indicateur de frappe */
  @SubscribeMessage('typing_start')
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody('conversationId') conversationId: string,
  ) {
    client.to(`conv:${conversationId}`).emit('user_typing', {
      userId: client.data.userId,
      conversationId,
    });
  }

  @SubscribeMessage('typing_stop')
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody('conversationId') conversationId: string,
  ) {
    client.to(`conv:${conversationId}`).emit('user_stopped_typing', {
      userId: client.data.userId,
      conversationId,
    });
  }

  /** Heartbeat — maintient la présence Redis vivante */
  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    await this.presenceService.refreshTtl(client.data.userId);
    return { event: 'pong', ts: Date.now() };
  }
}
