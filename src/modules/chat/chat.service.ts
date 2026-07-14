import { Injectable, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { SendMessageDto, GetMessagesDto, MessagePayload, CreateConversationDto } from './chat.dto';
import { ConversationType, MessageStatus, Role } from '../../../prisma/generated/enums';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';

const DEFAULT_PAGE_SIZE = 30;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UsersService,
  ) {}

  /**
   * Point d'entrée UNIQUE pour le front (web + client).
   * Détermine en interne s'il s'agit d'un DIRECT (agent ↔ client) ou
   * d'un LEAD (résolution via Lead.assignedToId), sans que le front
   * ait besoin de connaître cette distinction.
   */
  async findOrCreateConversation(currentUserId: string, dto: CreateConversationDto) {
    if (dto.leadId) {
      return this.findOrCreateLeadConversation(dto.leadId, currentUserId);
    }

    if (dto.recipientId) {
      return this.findOrCreateDirectConversation(currentUserId, dto.recipientId);
    }

    throw new ForbiddenException('recipientId ou leadId requis');
  }

  // chat.service.ts — getUserConversations avec statut consolidé du dernier message
  // Plus de receipts bruts (instables) — on calcule le statut une fois, stable.

  async getUserConversations(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: { some: { userId, leftAt: null } },
      },
      include: {
        participants: {
          where: { leftAt: null },
          include: { user: { select: { id: true, name: true } } },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Hydrate le statut consolidé uniquement pour les derniers messages
    // envoyés par l'utilisateur courant (les seuls qui affichent une icône statut)
    const myLastMessageIds = conversations
      .map((conv) => conv.messages[0])
      .filter((msg) => msg?.senderId === userId)
      .map((msg) => msg.id);

    const statusMap =
      myLastMessageIds.length > 0
        ? await this.hydrateMessageStatuses(myLastMessageIds)
        : new Map<string, MessageStatus>();

    return conversations.map((conv) => ({
      ...conv,
      messages: conv.messages.map((msg) => ({
        ...msg,
        metadata: msg.metadata as Record<string, string[]> | null,
        status: msg.senderId === userId ? (statusMap.get(msg.id) ?? MessageStatus.SENT) : null,
      })),
    }));
  }
  async sendMessage(senderId: string, dto: SendMessageDto): Promise<MessagePayload> {
    await this.assertActiveParticipant(senderId, dto.conversationId);

    const message = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId: dto.conversationId,
          senderId,
          content: dto.content,
        },
      });

      await tx.conversation.update({
        where: { id: dto.conversationId },
        data: { updatedAt: new Date(), lastMessageAt: new Date() },
      });

      return msg;
    });

    return this.toMessagePayload({
      ...message,
      status: MessageStatus.SENT,
      metadata: message.metadata as Record<string, string[]> | null,
    });
  }

  async getMessages(userId: string, dto: GetMessagesDto) {
    const { conversationId, cursor, limit = DEFAULT_PAGE_SIZE } = dto;
    await this.assertParticipant(userId, conversationId);

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        ...(cursor && {
          createdAt: {
            lt: (await this.prisma.message.findUnique({ where: { id: cursor } }))?.createdAt,
          },
        }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;

    const statusMap = await this.hydrateMessageStatuses(items.map((m) => m.id));

    console.log('statusMap', statusMap);

    return {
      items: items.map((value) => ({
        ...value,
        metadata: value.metadata as Record<string, string[]> | null,
        status: statusMap.get(value.id) ?? MessageStatus.SENT,
      })),
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  async unreadCount(dto: { conversationId: string; recipientId: string }) {
    await this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId: dto.conversationId,
          userId: dto.recipientId,
        },
      },
      data: {
        unreadCount: { increment: 1 },
      },
    });
  }

  async getActiveRecipientIds(conversationId: string, excludeUserId: string): Promise<string[]> {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, leftAt: null, userId: { not: excludeUserId } },
      select: { userId: true },
    });
    return participants.map((p) => p.userId);
  }

  /**
   * Crée un MessageReceipt SENT pour chaque destinataire actif au moment
   * de la création du message. Appelé juste après message.create.
   */
  async createReceiptsForMessage(
    messageId: string,
    conversationId: string,
    senderId: string,
  ): Promise<void> {
    const recipientIds = await this.getActiveRecipientIds(conversationId, senderId);

    if (!recipientIds.length) return;

    await this.prisma.messageReceipt.createMany({
      data: recipientIds.map((userId) => ({
        messageId,
        userId,
        status: MessageStatus.SENT,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Met à jour le statut d'un receipt — appelé quand on sait que le
   * destinataire est online (DELIVERED) ou qu'il vient d'ouvrir la
   * conversation (READ).
   */
  async updateReceiptStatus(
    messageId: string,
    userId: string,
    status: MessageStatus,
  ): Promise<void> {
    await this.prisma.messageReceipt.updateMany({
      where: {
        messageId,
        userId,
        status: { not: status === 'READ' ? undefined : MessageStatus.READ },
      },
      data: {
        status,
        ...(status === MessageStatus.READ && { readAt: new Date() }),
      },
    });
  }

  /**
   * Marque TOUS les messages non-lus d'une conversation comme READ pour
   * cet utilisateur — appelé à l'ouverture de la conversation (conversation:join)
   * ET au moment de l'envoi si le destinataire a déjà la conv ouverte.
   *
   * Retourne messageIds effectivement passés à READ, pour notifier
   * précisément les expéditeurs concernés (pas un broadcast générique).
   */
  async markAllAsRead(conversationId: string, userId: string): Promise<string[]> {
    const unreadReceipts = await this.prisma.messageReceipt.findMany({
      where: {
        userId,
        status: { not: MessageStatus.READ },
        message: { conversationId },
      },
      select: { id: true, messageId: true },
    });

    await Promise.all([
      unreadReceipts.length > 0
        ? this.prisma.messageReceipt.updateMany({
            where: { id: { in: unreadReceipts.map((r) => r.id) } },
            data: { status: MessageStatus.READ, readAt: new Date() },
          })
        : Promise.resolve(),

      this.prisma.conversationParticipant.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { unreadCount: 0, lastReadAt: new Date() },
      }),
    ]);

    return unreadReceipts.map((r) => r.messageId);
  }

  async incrementUnreadCount(conversationId: string, recipientId: string): Promise<void> {
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: recipientId } },
      data: { unreadCount: { increment: 1 } },
    });
  }
  /**
   * Calcule le statut "consolidé" d'un message pour l'affichage sender —
   * le meilleur statut parmi tous ses receipts (READ > DELIVERED > SENT).
   */
  async getMessageConsolidatedStatus(messageId: string): Promise<MessageStatus> {
    const receipts = await this.prisma.messageReceipt.findMany({
      where: { messageId },
      select: { status: true },
    });

    if (!receipts.length) return MessageStatus.SENT;
    if (receipts.every((r) => r.status === MessageStatus.READ)) return MessageStatus.READ;
    if (receipts.some((r) => r.status !== MessageStatus.SENT)) return MessageStatus.DELIVERED;
    return MessageStatus.SENT;
  }

  /**
   * Hydrate le statut de plusieurs messages d'un coup (pour getMessages,
   * évite N+1 queries).
   */
  async hydrateMessageStatuses(messageIds: string[]): Promise<Map<string, MessageStatus>> {
    if (!messageIds.length) return new Map();

    const receipts = await this.prisma.messageReceipt.findMany({
      where: { messageId: { in: messageIds } },
      select: { messageId: true, status: true },
    });

    const byMessage = new Map<string, MessageStatus[]>();
    for (const r of receipts) {
      const list = byMessage.get(r.messageId) ?? [];
      list.push(r.status);
      byMessage.set(r.messageId, list);
    }

    const result = new Map<string, MessageStatus>();
    for (const [messageId, statuses] of byMessage) {
      const best = statuses.every((s) => s === MessageStatus.READ)
        ? MessageStatus.READ
        : statuses.some((s) => s !== MessageStatus.SENT)
          ? MessageStatus.DELIVERED
          : MessageStatus.SENT;
      result.set(messageId, best);
    }

    return result;
  }

  private async assertParticipant(userId: string, conversationId: string): Promise<void> {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participant) throw new ForbiddenException('Accès à cette conversation refusé');
  }

  private async assertActiveParticipant(userId: string, conversationId: string): Promise<void> {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participant || participant.leftAt) {
      throw new ForbiddenException('Vous ne faites plus partie de cette conversation');
    }
  }

  private toMessagePayload(message: MessagePayload) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      content: message.content,
      type: message.type,
      metadata: message.metadata ?? null,
      status: message.status,
      createdAt: message.createdAt,
    };
  }

  /**
   * Synchronise les participants de la conversation après réassignation d'un Lead.
   *
   * Comportement
   *   - Retire (soft, via leftAt) l'ancien staff/owner responsable
   *   - Ajoute le nouveau responsable (staff assigné, ou owner si désassigné)
   *   Client n'est jamais affecté
   *   - Idempotent : si le nouveau responsable est déjà le bon, ne fait rien
   */
  async handleLeadReassignment(leadId: string, newAssignedToUserId: string | null): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { leadId },
      include: { participants: { where: { leftAt: null } } },
    });

    if (!conversation) {
      this.logger.log(`Pas de conversation pour lead=${leadId} — rien à réassigner`);
      return;
    }

    const currentResponsible = conversation.participants.find(
      (p) => p.role === Role.AGENT || p.role === Role.OWNER,
    );

    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
      include: { agency: { include: { owner: { include: { user: true } } } } },
    });

    const newUserId = newAssignedToUserId ?? lead.agency.owner?.user.id;

    if (!newUserId) {
      this.logger.log(`Réassignation impossible — pas de fallback owner pour lead=${leadId}`);
      return;
    }

    if (currentResponsible?.userId === newUserId) {
      this.logger.log(`Lead=${leadId} déjà assigné à userId=${newUserId} — no-op`);
      return;
    }

    const newRole = newAssignedToUserId ? Role.AGENT : Role.OWNER;

    await this.prisma.$transaction(async (tx) => {
      if (currentResponsible) {
        await tx.conversationParticipant.update({
          where: { id: currentResponsible.id },
          data: { leftAt: new Date() },
        });
      }

      await tx.conversationParticipant.upsert({
        where: {
          conversationId_userId: { conversationId: conversation.id, userId: newUserId },
        },
        update: { leftAt: null, role: newRole },
        create: {
          conversationId: conversation.id,
          userId: newUserId,
          role: newRole,
        },
      });
    });

    this.logger.log(
      `Conversation ${conversation.id} réassignée — lead=${leadId} nouveau responsable=${newUserId} (${newRole})`,
    );
  }

  /**
   * Vérifie que la paire est valide pour une conversation DIRECT :
   * un agent (OWNER ou STAFF) ↔ un CLIENT. Jamais agent-agent, jamais client-client.
   */

  private async findOrCreateDirectConversation(currentUserId: string, recipientId: string) {
    if (currentUserId === recipientId) {
      throw new ForbiddenException('Impossible de créer une conversation avec soi-même');
    }

    const [user, recipient] = await Promise.all([
      this.userService.findUser({ id: currentUserId }),
      this.userService.findUser({ id: recipientId }),
    ]);

    if (!user || !recipient) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    await this.assertValidDirectPair(user, recipient);

    const existing = await this.prisma.conversation.findFirst({
      where: {
        type: ConversationType.DIRECT,
        participants: { every: { userId: { in: [currentUserId, recipientId] } } },
      },
      include: this.conversationInclude(),
    });

    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        type: ConversationType.DIRECT,
        participants: {
          createMany: {
            data: [
              { userId: currentUserId, role: user.role },
              { userId: recipientId, role: recipient.role },
            ],
          },
        },
      },
      include: this.conversationInclude(),
    });
  }

  /**
   * Valide la paire pour une conversation DIRECT. Deux cas autorisés :
   *   1. Agent (OWNER/STAFF) ↔ CLIENT — peu importe l'agence
   *   2. OWNER ↔ STAFF — uniquement s'ils appartiennent à la même agence
   */
  private async assertValidDirectPair(
    user: { id: string; role: string },
    recipient: { id: string; role: string },
  ): Promise<void> {
    const isAgent = (r: string) => r === Role.OWNER || r === Role.AGENT;
    const isClient = (r: string) => r === Role.USER;
    const isOwner = (r: string) => r === Role.OWNER;
    const isStaff = (r: string) => r === Role.AGENT;

    const isAgentClientPair =
      (isAgent(user.role) && isClient(recipient.role)) ||
      (isClient(user.role) && isAgent(recipient.role));

    if (isAgentClientPair) return;

    const isOwnerStaffPair =
      (isOwner(user.role) && isStaff(recipient.role)) ||
      (isStaff(user.role) && isOwner(recipient.role));

    if (isOwnerStaffPair) {
      const sameAgency = await this.assertSameAgency(user.id, recipient.id);
      if (sameAgency) return;

      throw new ForbiddenException(
        "Un owner ne peut discuter qu'avec le staff de sa propre agence",
      );
    }

    throw new ForbiddenException(
      'Une conversation directe est autorisée uniquement entre un agent et un client, ou un owner et son staff',
    );
  }

  /**
   * Vérifie que les deux users appartiennent à la même agence,
   * peu importe lequel est owner et lequel est staff.
   */
  private async assertSameAgency(userIdA: string, userIdB: string): Promise<boolean> {
    const [ownerRecord, staffRecord] = await Promise.all([
      this.prisma.owner.findFirst({
        where: { userId: { in: [userIdA, userIdB] } },
        select: { userId: true, agency: true },
      }),
      this.prisma.staff.findFirst({
        where: { userId: { in: [userIdA, userIdB] } },
        select: { userId: true, agencyId: true },
      }),
    ]);

    if (!ownerRecord || !staffRecord) return false;

    return ownerRecord.agency?.id === staffRecord.agencyId;
  }
  private async findOrCreateLeadConversation(leadId: string, requesterId: string) {
    const existing = await this.prisma.conversation.findUnique({
      where: { leadId },
      include: this.conversationInclude(),
    });
    if (existing) return existing;

    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        client: { include: { user: true } },
        agency: { include: { owner: { include: { user: true } } } },
        assignedTo: { include: { user: true } },
      },
    });
    if (!lead) throw new NotFoundException('Lead introuvable');

    const { staffUserId, role } = this.resolveResponsible(lead);

    // FIX : le requester doit être SOIT le client du lead, SOIT le responsable
    // résolu (staff assigné ou owner fallback) — jamais un tiers.
    const isClientRequester = lead.client.userId === requesterId;
    const isResponsibleRequester = staffUserId === requesterId;

    if (!isClientRequester && !isResponsibleRequester) {
      throw new ForbiddenException("Vous n'êtes pas autorisé à démarrer cette conversation");
    }

    return this.prisma.conversation.create({
      data: {
        type: ConversationType.LEAD,
        leadId,
        participants: {
          createMany: {
            data: [
              { userId: lead.client.userId, role: Role.USER },
              { userId: staffUserId, role },
            ],
          },
        },
      },
      include: this.conversationInclude(),
    });
  }

  private resolveResponsible(lead: {
    assignedTo: { user: { id: string } } | null;
    agency: { owner: { user: { id: string } } | null };
  }): { staffUserId: string; role: Role } {
    if (lead.assignedTo) {
      return { staffUserId: lead.assignedTo.user.id, role: Role.AGENT };
    }
    if (!lead.agency.owner) {
      throw new NotFoundException('Aucun owner trouvé pour cette agence');
    }
    return { staffUserId: lead.agency.owner.user.id, role: Role.OWNER };
  }

  private conversationInclude() {
    return {
      participants: {
        where: { leftAt: null },
        include: { user: { select: { id: true, name: true } } },
      },
      messages: { orderBy: { createdAt: 'desc' as const }, take: 1 },
    };
  }
}
