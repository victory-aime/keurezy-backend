import { ForbiddenException, Injectable } from '@nestjs/common';
import { CreateConversationDto, SendMessageDto } from './dto/message.dto';
import { PrismaService } from '_root/database/prisma.service';
import { ConversationType, MessageStatus } from '../../../prisma/generated/enums';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Guards ──────────────────────────────────────────────────
  async assertParticipant(conversationId: string, userId: string) {
    const p = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!p) throw new ForbiddenException('Not a conversation participant');
    return p;
  }

  // ── Queries ─────────────────────────────────────────────────
  getConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true } } },
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, content: true, type: true, createdAt: true, senderId: true },
        },
      },
    });
  }

  async getMessages(conversationId: string, userId: string, cursor?: string) {
    await this.assertParticipant(conversationId, userId);
    return this.prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 30,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      include: {
        sender: { select: { id: true, name: true } },
        receipts: { where: { userId }, select: { status: true, readAt: true } },
      },
    });
  }

  async getParticipantIds(conversationId: string, excludeUserId?: string) {
    const rows = await this.prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        ...(excludeUserId && { userId: { not: excludeUserId } }),
      },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  // ── Mutations ────────────────────────────────────────────────
  async saveMessage(senderId: string, dto: SendMessageDto) {
    await this.assertParticipant(dto.conversationId, senderId);

    const recipientIds = await this.getParticipantIds(dto.conversationId, senderId);

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId: dto.conversationId,
          senderId,
          content: dto.content,
          type: dto.type,
          metadata: dto.metadata ?? undefined,
          receipts: {
            create: recipientIds.map((userId) => ({
              userId,
              status: MessageStatus.SENT,
            })),
          },
        },
        include: {
          sender: { select: { id: true, name: true } },
          receipts: true,
        },
      }),
      this.prisma.conversation.update({
        where: { id: dto.conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return { message, recipientIds };
  }

  async markDelivered(messageId: string, userId: string) {
    return this.prisma.messageReceipt.updateMany({
      where: { messageId, userId, status: MessageStatus.SENT },
      data: { status: MessageStatus.DELIVERED, deliveredAt: new Date() },
    });
  }

  async markConversationRead(conversationId: string, userId: string) {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.messageReceipt.updateMany({
        where: {
          userId,
          status: { not: MessageStatus.READ },
          message: { conversationId },
        },
        data: { status: MessageStatus.READ, readAt: now },
      }),
      this.prisma.conversationParticipant.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadAt: now },
      }),
    ]);
    return now;
  }

  async getUnreadCounts(userId: string): Promise<Record<string, number>> {
    const raw = await this.prisma.$queryRaw<{ conversationId: string; count: bigint }[]>`
      SELECT m."conversationId", COUNT(*) as count
      FROM "message_receipt" mr
      JOIN "message" m ON m.id = mr."messageId"
      WHERE mr."userId" = ${userId}
        AND mr.status != 'READ'
      GROUP BY m."conversationId"
    `;
    return Object.fromEntries(raw.map((r) => [r.conversationId, Number(r.count)]));
  }

  // src/chat/chat.service.ts  ← ajouter à la suite
  async createConversation(creatorId: string, dto: CreateConversationDto) {
    // Déduplique et inclut le créateur
    const participantIds = Array.from(new Set([creatorId, ...dto.participantIds]));

    // Conversation DIRECT → retourne l'existante si elle existe déjà
    if (dto.type === ConversationType.DIRECT && participantIds.length === 2) {
      const existing = await this.prisma.conversation.findFirst({
        where: {
          type: ConversationType.DIRECT,
          AND: participantIds.map((uid) => ({
            participants: { some: { userId: uid } },
          })),
        },
        include: {
          participants: { include: { user: { select: { id: true, name: true } } } },
          messages: { take: 0 }, // pas de messages au retour de création
        },
      });
      if (existing) return existing;
    }

    return this.prisma.conversation.create({
      data: {
        type: dto.type,
        title: dto.title,
        participants: {
          create: participantIds.map((userId) => ({ userId })),
        },
      },
      include: {
        participants: { include: { user: { select: { id: true, name: true } } } },
        messages: { take: 0 },
      },
    });
  }
}
