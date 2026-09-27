import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '../../../prisma/generated/client';
import {
  AnnonceStatus,
  AttachmentKind,
  MessageStatus,
  MessageType,
  Role,
} from '../../../prisma/generated/enums';
import { CLOUDINARY_FOLDER_NAME } from '../../config/enum';
import { HttpError } from '../../config/http.error';
import { PrismaService } from '../../database/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { formatCalendarDate } from '../rentals/calendar-date';
import { ChatAccessService, ConversationAccess } from './chat-access.service';
import { CloudinaryResourceType, ValidatedChatFile, validateChatFiles } from './chat-files';
import {
  AttachmentPayload,
  ConversationsQueryDto,
  GetMessagesDto,
  MessagePayload,
  SendMessageDto,
} from './chat.dto';

const DEFAULT_MESSAGES_PAGE = 30;
const DEFAULT_CONVERSATIONS_PAGE = 20;
const SIGNED_URL_TTL_SECONDS = 3600;

const STATUS_RANK: Record<MessageStatus, number> = {
  [MessageStatus.SENT]: 0,
  [MessageStatus.DELIVERED]: 1,
  [MessageStatus.READ]: 2,
};

const CONVERSATION_INCLUDE = {
  client: { select: { id: true, phone: true, userId: true, user: { select: { name: true } } } },
  agency: { select: { id: true, name: true, phone: true, agencyLogo: true } },
  property: {
    select: {
      id: true,
      title: true,
      annonces: {
        where: { status: AnnonceStatus.ACTIVE },
        select: { id: true, galleryImages: true },
        take: 1,
      },
    },
  },
  booking: {
    select: { id: true, status: true, rentalType: true, startDate: true, endDate: true },
  },
  messages: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: {
      id: true,
      senderId: true,
      content: true,
      type: true,
      createdAt: true,
      _count: { select: { attachments: true } },
    },
  },
} satisfies Prisma.ConversationInclude;

type ConversationRecord = Prisma.ConversationGetPayload<{ include: typeof CONVERSATION_INCLUDE }>;

const MESSAGE_INCLUDE = {
  sender: { select: { id: true, name: true } },
  attachments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.MessageInclude;

type MessageRecord = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

interface ConversationContext {
  clientId: string;
  agencyId: string;
  propertyId: string;
}

/** Résultat d'un envoi : le message et les utilisateurs à qui le diffuser. */
export interface SentMessage {
  message: MessagePayload;
  recipientIds: string[];
  conversation: ConversationAccess['conversation'] & { bookingId: string | null };
  /** Nom présenté aux destinataires : l'agence parle d'une seule voix auprès du client */
  senderDisplayName: string | null;
  /** Messages reçus que l'expéditeur a lus en répondant (accusés à diffuser) */
  readMessageIds: string[];
}

const emptyMessage = () =>
  new HttpError(
    'Le message doit contenir du texte ou une pièce jointe',
    HttpStatus.BAD_REQUEST,
    'CHAT_EMPTY_MESSAGE',
  );

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * Chat client ↔ agence. Une conversation est unique par (client, agence, bien) ;
 * la réservation n'est qu'un contexte. Les droits sont vérifiés par ChatAccessService.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChatAccessService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  // OUVERTURE (récupération ou création idempotente)
  // ─────────────────────────────────────────────────────────────────

  /** Le client contacte l'agence depuis une annonce. */
  async openPropertyConversation(userId: string, annonceId: string) {
    const client = await this.prisma.client.findUnique({ where: { userId }, select: { id: true } });
    if (!client) {
      throw new HttpError(
        'Seul un compte client peut contacter une agence',
        HttpStatus.FORBIDDEN,
        'CLIENT_NOT_FOUND',
      );
    }

    const annonce = await this.prisma.annonce.findFirst({
      where: { id: annonceId, status: AnnonceStatus.ACTIVE },
      select: { property: { select: { id: true, agencyId: true } } },
    });
    if (!annonce) {
      throw new HttpError('Annonce introuvable', HttpStatus.NOT_FOUND, 'ANNONCE_NOT_FOUND');
    }

    const conversationId = await this.findOrCreate({
      clientId: client.id,
      agencyId: annonce.property.agencyId,
      propertyId: annonce.property.id,
    });
    return this.getConversationDetail(userId, conversationId);
  }

  /** Conversation d'une réservation : ouverte par son client ou par l'agence. */
  async openBookingConversation(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        agencyId: true,
        propertyId: true,
        clientId: true,
        client: { select: { userId: true } },
      },
    });
    if (!booking) {
      throw new HttpError('Réservation introuvable', HttpStatus.NOT_FOUND, 'BOOKING_NOT_FOUND');
    }
    if (!booking.clientId || !booking.client) {
      throw new HttpError(
        'Le client de cette réservation n’a plus de compte',
        HttpStatus.CONFLICT,
        'CHAT_CLIENT_UNAVAILABLE',
      );
    }
    if (booking.client.userId !== userId) {
      await this.access.assertAgencyAccess(booking.agencyId, userId, 'read');
    }

    const conversationId = await this.findOrCreate(
      { clientId: booking.clientId, agencyId: booking.agencyId, propertyId: booking.propertyId },
      booking.id,
    );
    return this.getConversationDetail(userId, conversationId);
  }

  /**
   * Retourne la conversation existante ou la crée. Deux ouvertures simultanées
   * sont départagées par la contrainte d'unicité : la seconde relit la première.
   */
  private async findOrCreate(context: ConversationContext, bookingId?: string): Promise<string> {
    const where = { clientId_agencyId_propertyId: context };
    let conversation = await this.prisma.conversation.findUnique({
      where,
      select: { id: true, bookingId: true },
    });

    if (!conversation) {
      try {
        conversation = await this.prisma.conversation.create({
          data: { ...context, bookingId: bookingId ?? null },
          select: { id: true, bookingId: true },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        conversation = await this.prisma.conversation.findUniqueOrThrow({
          where,
          select: { id: true, bookingId: true },
        });
      }
    }

    if (bookingId && conversation.bookingId !== bookingId) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { bookingId },
      });
    }

    await this.syncParticipants(conversation.id, context.clientId, context.agencyId);
    return conversation.id;
  }

  // ─────────────────────────────────────────────────────────────────
  // LECTURE
  // ─────────────────────────────────────────────────────────────────

  /**
   * Conversations du client connecté, ou d'une agence (`agencyId`) pour son owner / staff habilité.
   * Seules les conversations ayant au moins un message sont listées.
   */
  async getConversations(userId: string, query: ConversationsQueryDto) {
    const limit = query.limit ?? DEFAULT_CONVERSATIONS_PAGE;

    if (query.agencyId) {
      await this.access.assertAgencyAccess(query.agencyId, userId, 'read');
    }
    const scope: Prisma.ConversationWhereInput = query.agencyId
      ? { agencyId: query.agencyId }
      : { client: { userId } };

    const search = query.search?.trim();
    const where: Prisma.ConversationWhereInput = {
      ...scope,
      lastMessageAt: { not: null },
      ...(query.unreadOnly && {
        participants: { some: { userId, unreadCount: { gt: 0 } } },
      }),
      ...(search && {
        OR: [
          { property: { title: { contains: search, mode: 'insensitive' } } },
          { client: { user: { name: { contains: search, mode: 'insensitive' } } } },
          { agency: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [conversations, unread] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        include: CONVERSATION_INCLUDE,
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
      }),
      this.prisma.conversationParticipant.aggregate({
        where: { userId, conversation: scope },
        _sum: { unreadCount: true },
      }),
    ]);

    const hasMore = conversations.length > limit;
    const page = hasMore ? conversations.slice(0, limit) : conversations;
    const items = await this.toConversationItems(page, userId);

    return {
      items,
      nextCursor: hasMore ? page[page.length - 1].id : null,
      unreadTotal: unread._sum.unreadCount ?? 0,
    };
  }

  async getConversationDetail(userId: string, conversationId: string) {
    await this.access.assertConversationAccess(conversationId, userId, 'read');
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: CONVERSATION_INCLUDE,
    });
    const [item] = await this.toConversationItems([conversation], userId);
    return item;
  }

  async getMessages(userId: string, dto: GetMessagesDto) {
    const { conversationId, cursor } = dto;
    const limit = dto.limit ?? DEFAULT_MESSAGES_PAGE;
    await this.access.assertConversationAccess(conversationId, userId, 'read');

    const cursorMessage = cursor
      ? await this.prisma.message.findFirst({
          where: { id: cursor, conversationId },
          select: { createdAt: true },
        })
      : null;

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        ...(cursorMessage && { createdAt: { lt: cursorMessage.createdAt } }),
      },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;
    const clientUserId = await this.getClientUserId(conversationId);
    const statuses = await this.hydrateMessageStatuses(items, clientUserId);

    return {
      items: items.map((message) =>
        this.toMessagePayload(message, statuses.get(message.id) ?? MessageStatus.SENT),
      ),
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // ENVOI
  // ─────────────────────────────────────────────────────────────────

  /**
   * Enregistre un message (texte, pièces jointes ou note vocale), crée les accusés
   * des destinataires et retourne ce qu'il faut diffuser.
   */
  async sendMessage(
    senderId: string,
    dto: SendMessageDto,
    files: Express.Multer.File[] = [],
  ): Promise<SentMessage> {
    const access = await this.access.assertConversationAccess(
      dto.conversationId,
      senderId,
      'reply',
    );

    const content = dto.content?.trim() ?? '';
    const validated = validateChatFiles(files, dto.durationMs);
    if (!content && !validated.length) throw emptyMessage();

    const uploaded = await this.uploadAttachments(dto.conversationId, validated);

    let message: MessageRecord;
    let bookingId: string | null;
    try {
      const now = new Date();
      [message, { bookingId }] = await this.prisma.$transaction([
        this.prisma.message.create({
          data: {
            conversationId: dto.conversationId,
            senderId,
            content,
            type: this.messageTypeFor(validated),
            attachments: {
              create: uploaded.map((file) => ({
                kind: file.kind,
                mimeType: file.mimeType,
                fileName: file.fileName,
                fileSize: file.fileSize,
                storageKey: file.storageKey,
                resourceType: file.resourceType,
                durationMs: file.kind === AttachmentKind.AUDIO ? (dto.durationMs ?? null) : null,
              })),
            },
          },
          include: MESSAGE_INCLUDE,
        }),
        this.prisma.conversation.update({
          where: { id: dto.conversationId },
          data: { lastMessageAt: now },
          select: { bookingId: true },
        }),
      ]);
    } catch (error) {
      // Pas de fichier orphelin si l'enregistrement échoue
      await Promise.allSettled(
        uploaded.map((file) =>
          this.cloudinary.deletePrivateFile(file.storageKey, file.resourceType),
        ),
      );
      throw error;
    }

    const { clientUserId, agencyReaders } = await this.syncParticipants(
      dto.conversationId,
      access.conversation.clientId,
      access.conversation.agencyId,
      { userId: senderId, role: access.role },
    );
    const recipientIds = [clientUserId, ...agencyReaders.map((reader) => reader.userId)].filter(
      (id, index, all) => id !== senderId && all.indexOf(id) === index,
    );

    if (recipientIds.length) {
      await this.prisma.messageReceipt.createMany({
        data: recipientIds.map((userId) => ({ messageId: message.id, userId })),
        skipDuplicates: true,
      });
    }

    // Répondre vaut lecture : l'expéditeur n'a plus de message non lu dans cette conversation
    const readMessageIds = await this.markAllAsRead(dto.conversationId, senderId);

    const agency =
      access.side === 'AGENCY'
        ? await this.prisma.agency.findUnique({
            where: { id: access.conversation.agencyId },
            select: { name: true },
          })
        : null;

    return {
      message: this.toMessagePayload(message, MessageStatus.SENT),
      recipientIds,
      conversation: { ...access.conversation, bookingId },
      senderDisplayName: agency?.name ?? message.sender?.name ?? null,
      readMessageIds,
    };
  }

  private messageTypeFor(files: ValidatedChatFile[]): MessageType {
    if (!files.length) return MessageType.TEXT;
    if (files.some((file) => file.kind === AttachmentKind.AUDIO)) return MessageType.AUDIO;
    if (files.every((file) => file.kind === AttachmentKind.IMAGE)) return MessageType.IMAGE;
    return MessageType.FILE;
  }

  private async uploadAttachments(conversationId: string, files: ValidatedChatFile[]) {
    const folder = `${CLOUDINARY_FOLDER_NAME.CHAT}/${conversationId}`;
    const results = await Promise.allSettled(
      files.map(async (file) => {
        // Cloudinary ajoute l'extension des images et de l'audio, pas celle des fichiers « raw »
        const publicId =
          file.resourceType === 'raw' ? `${randomUUID()}.${file.extension}` : randomUUID();
        const result = await this.cloudinary.uploadPrivateFile(
          file.buffer,
          publicId,
          folder,
          file.resourceType,
        );
        return { ...file, storageKey: result.public_id };
      }),
    );

    const failed = results.some((result) => result.status === 'rejected');
    const uploaded = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    if (failed) {
      await Promise.allSettled(
        uploaded.map((file) =>
          this.cloudinary.deletePrivateFile(file.storageKey, file.resourceType),
        ),
      );
      throw new HttpError(
        'Envoi des pièces jointes impossible, réessayez',
        HttpStatus.BAD_GATEWAY,
        'CHAT_UPLOAD_FAILED',
      );
    }
    return uploaded;
  }

  // ─────────────────────────────────────────────────────────────────
  // PARTICIPANTS, ACCUSÉS ET NON-LUS
  // ─────────────────────────────────────────────────────────────────

  /**
   * Garantit une ligne participant (compteur de non-lus) pour le client et chaque membre
   * habilité de l'agence. Les droits restent vérifiés à chaque accès.
   */
  private async syncParticipants(
    conversationId: string,
    clientId: string,
    agencyId: string,
    sender?: { userId: string; role: Role },
  ) {
    const [client, agencyReaders] = await Promise.all([
      this.prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { userId: true } }),
      this.access.getAgencyReaderIds(agencyId),
    ]);

    const rows = [{ userId: client.userId, role: Role.USER }, ...agencyReaders];
    if (sender && !rows.some((row) => row.userId === sender.userId)) rows.push(sender);

    await this.prisma.conversationParticipant.createMany({
      data: rows.map((row) => ({ conversationId, userId: row.userId, role: row.role })),
      skipDuplicates: true,
    });

    return { clientUserId: client.userId, agencyReaders };
  }

  /** Utilisateurs concernés par la conversation (client + membres habilités de l'agence). */
  async getConversationUserIds(conversationId: string): Promise<string[]> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { agencyId: true, client: { select: { userId: true } } },
    });
    if (!conversation) return [];
    const readers = await this.access.getAgencyReaderIds(conversation.agencyId);
    return [...new Set([conversation.client.userId, ...readers.map((reader) => reader.userId)])];
  }

  /** Interlocuteurs d'un utilisateur, pour lui diffuser les changements de présence. */
  async getContactUserIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.conversationParticipant.findMany({
      where: { userId: { not: userId }, conversation: { participants: { some: { userId } } } },
      distinct: ['userId'],
      select: { userId: true },
      take: 500,
    });
    return rows.map((row) => row.userId);
  }

  async updateReceiptStatus(messageId: string, userId: string, status: MessageStatus) {
    await this.prisma.messageReceipt.updateMany({
      // Un accusé ne régresse jamais (READ reste READ)
      where: { messageId, userId, status: { not: MessageStatus.READ } },
      data: {
        status,
        ...(status === MessageStatus.DELIVERED && { deliveredAt: new Date() }),
        ...(status === MessageStatus.READ && { readAt: new Date() }),
      },
    });
  }

  async incrementUnreadCount(conversationId: string, userIds: string[]) {
    if (!userIds.length) return;
    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId: { in: userIds } },
      data: { unreadCount: { increment: 1 } },
    });
  }

  /**
   * Marque les messages reçus comme lus pour cet utilisateur et remet son compteur à zéro.
   * Retourne les messages passés à READ.
   */
  async markAllAsRead(conversationId: string, userId: string): Promise<string[]> {
    const access = await this.access.assertConversationAccess(conversationId, userId, 'read');

    const unreadReceipts = await this.prisma.messageReceipt.findMany({
      where: { userId, status: { not: MessageStatus.READ }, message: { conversationId } },
      select: { id: true, messageId: true },
    });

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.messageReceipt.updateMany({
        where: { id: { in: unreadReceipts.map((receipt) => receipt.id) } },
        data: { status: MessageStatus.READ, readAt: now },
      }),
      this.prisma.conversationParticipant.upsert({
        where: { conversationId_userId: { conversationId, userId } },
        update: { unreadCount: 0, lastReadAt: now },
        create: { conversationId, userId, role: access.role, lastReadAt: now },
      }),
    ]);

    return unreadReceipts.map((receipt) => receipt.messageId);
  }

  async getConsolidatedStatus(messageId: string): Promise<MessageStatus> {
    const message = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      select: { id: true, senderId: true, conversationId: true },
    });
    const clientUserId = await this.getClientUserId(message.conversationId);
    const statuses = await this.hydrateMessageStatuses([message], clientUserId);
    return statuses.get(messageId) ?? MessageStatus.SENT;
  }

  /**
   * Statut affiché à l'expéditeur : meilleur accusé du côté opposé.
   * Message du client → lu dès qu'un membre de l'agence l'a lu ; message de l'agence → lu par le client.
   */
  private async hydrateMessageStatuses(
    messages: { id: string; senderId: string }[],
    clientUserId: string | null,
  ): Promise<Map<string, MessageStatus>> {
    if (!messages.length) return new Map();

    const receipts = await this.prisma.messageReceipt.findMany({
      where: { messageId: { in: messages.map((message) => message.id) } },
      select: { messageId: true, userId: true, status: true },
    });
    const senderOf = new Map(messages.map((message) => [message.id, message.senderId]));

    const result = new Map<string, MessageStatus>();
    for (const receipt of receipts) {
      const fromClient = senderOf.get(receipt.messageId) === clientUserId;
      const isOppositeSide = fromClient
        ? receipt.userId !== clientUserId
        : receipt.userId === clientUserId;
      if (!isOppositeSide) continue;

      const current = result.get(receipt.messageId) ?? MessageStatus.SENT;
      if (STATUS_RANK[receipt.status] > STATUS_RANK[current]) {
        result.set(receipt.messageId, receipt.status);
      }
    }
    return result;
  }

  private async getClientUserId(conversationId: string): Promise<string | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { client: { select: { userId: true } } },
    });
    return conversation?.client.userId ?? null;
  }

  // ─────────────────────────────────────────────────────────────────
  // MAPPERS
  // ─────────────────────────────────────────────────────────────────

  private async toConversationItems(conversations: ConversationRecord[], viewerId: string) {
    const ids = conversations.map((conversation) => conversation.id);
    const [participants, statuses] = await Promise.all([
      this.prisma.conversationParticipant.findMany({
        where: { conversationId: { in: ids }, userId: viewerId },
        select: { conversationId: true, unreadCount: true },
      }),
      Promise.all(
        conversations.map(async (conversation) => {
          const [last] = conversation.messages;
          if (!last || last.senderId !== viewerId) return null;
          const map = await this.hydrateMessageStatuses([last], conversation.client.userId);
          return [last.id, map.get(last.id) ?? MessageStatus.SENT] as const;
        }),
      ),
    ]);
    const unreadBy = new Map(participants.map((row) => [row.conversationId, row.unreadCount]));
    const statusBy = new Map(statuses.filter((entry) => entry !== null));

    return conversations.map((conversation) => {
      const [annonce] = conversation.property.annonces;
      const [last] = conversation.messages;
      return {
        id: conversation.id,
        createdAt: conversation.createdAt,
        lastMessageAt: conversation.lastMessageAt,
        unreadCount: unreadBy.get(conversation.id) ?? 0,
        agency: {
          id: conversation.agency.id,
          name: conversation.agency.name,
          phone: conversation.agency.phone,
          logo: conversation.agency.agencyLogo,
        },
        client: {
          id: conversation.client.id,
          userId: conversation.client.userId,
          name: conversation.client.user.name,
          phone: conversation.client.phone,
        },
        property: {
          id: conversation.property.id,
          title: conversation.property.title,
          annonceId: annonce?.id ?? null,
          coverImage: annonce?.galleryImages[0] ?? null,
        },
        booking: conversation.booking
          ? {
              id: conversation.booking.id,
              status: conversation.booking.status,
              rentalType: conversation.booking.rentalType,
              startDate: formatCalendarDate(conversation.booking.startDate),
              endDate: formatCalendarDate(conversation.booking.endDate),
            }
          : null,
        lastMessage: last
          ? {
              id: last.id,
              senderId: last.senderId,
              content: last.content,
              type: last.type,
              attachmentsCount: last._count.attachments,
              createdAt: last.createdAt,
              status: statusBy.get(last.id) ?? null,
            }
          : null,
      };
    });
  }

  private toMessagePayload(message: MessageRecord, status: MessageStatus): MessagePayload {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      sender: message.sender,
      content: message.content,
      type: message.type,
      attachments: message.attachments.map((attachment) => this.toAttachmentPayload(attachment)),
      status,
      createdAt: message.createdAt,
    };
  }

  private toAttachmentPayload(attachment: MessageRecord['attachments'][number]): AttachmentPayload {
    const resourceType = attachment.resourceType as CloudinaryResourceType;
    const format = attachment.fileName.split('.').pop()?.toLowerCase() ?? '';
    return {
      id: attachment.id,
      kind: attachment.kind,
      mimeType: attachment.mimeType,
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      durationMs: attachment.durationMs,
      // URL temporaire : générée uniquement pour un utilisateur déjà autorisé
      url: this.cloudinary.getSignedUrl(
        attachment.storageKey,
        resourceType,
        this.formatFor(attachment.mimeType, format),
        SIGNED_URL_TTL_SECONDS,
      ),
    };
  }

  private formatFor(mimeType: string, fallback: string): string {
    switch (mimeType) {
      case 'image/png':
        return 'png';
      case 'image/jpeg':
      case 'image/jpg':
        return 'jpg';
      case 'audio/aac':
        return 'aac';
      case 'audio/mp4':
      case 'audio/m4a':
      case 'audio/x-m4a':
        return 'm4a';
      default:
        return fallback;
    }
  }
}
