import { HttpStatus, Injectable } from '@nestjs/common';
import { Role } from '../../../prisma/generated/enums';
import { HttpError } from '../../config/http.error';
import { PrismaService } from '../../database/prisma.service';

/** Permissions staff du chat (feature `manage_conversations`). L'owner n'en a pas besoin. */
export const CHAT_PERMISSIONS = {
  VIEW: 'view_conversations',
  REPLY: 'reply_conversations',
} as const;

export type ChatAccessLevel = 'read' | 'reply';
export type ChatSide = 'CLIENT' | 'AGENCY';

export interface ConversationAccess {
  side: ChatSide;
  role: Role;
  conversation: { id: string; clientId: string; agencyId: string; propertyId: string };
}

const PERMISSIONS_FOR: Record<ChatAccessLevel, string[]> = {
  // Répondre implique de pouvoir lire
  read: [CHAT_PERMISSIONS.VIEW, CHAT_PERMISSIONS.REPLY],
  reply: [CHAT_PERMISSIONS.REPLY],
};

const denied = () =>
  new HttpError('Accès à cette conversation refusé', HttpStatus.FORBIDDEN, 'CHAT_ACCESS_DENIED');

/**
 * Source de vérité unique des droits sur les conversations :
 *  - le client de la conversation ;
 *  - l'owner de l'agence ;
 *  - le staff actif de l'agence disposant de la permission requise.
 * Les lignes `ConversationParticipant` ne servent qu'aux compteurs : elles n'ouvrent aucun droit.
 */
@Injectable()
export class ChatAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Rôle de l'utilisateur dans l'agence, ou null s'il n'y a pas (ou plus) accès. */
  async getAgencyRole(
    agencyId: string,
    userId: string,
    level: ChatAccessLevel,
  ): Promise<Role | null> {
    const agency = await this.prisma.agency.findFirst({
      where: { id: agencyId },
      select: {
        owner: { select: { userId: true } },
        staff: {
          where: {
            userId,
            isActive: true,
            permissions: {
              some: { granted: true, permission: { name: { in: PERMISSIONS_FOR[level] } } },
            },
          },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!agency) return null;
    if (agency.owner.userId === userId) return Role.OWNER;
    return agency.staff.length ? Role.AGENT : null;
  }

  async assertAgencyAccess(agencyId: string, userId: string, level: ChatAccessLevel) {
    const role = await this.getAgencyRole(agencyId, userId, level);
    if (!role) throw denied();
    return role;
  }

  /** Vérifie l'accès à une conversation et indique de quel côté se trouve l'utilisateur. */
  async assertConversationAccess(
    conversationId: string,
    userId: string,
    level: ChatAccessLevel,
  ): Promise<ConversationAccess> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        clientId: true,
        agencyId: true,
        propertyId: true,
        client: { select: { userId: true } },
      },
    });
    if (!conversation) throw denied();

    const { client, ...context } = conversation;
    if (client.userId === userId) {
      return { side: 'CLIENT', role: Role.USER, conversation: context };
    }

    const role = await this.getAgencyRole(conversation.agencyId, userId, level);
    if (!role) throw denied();
    return { side: 'AGENCY', role, conversation: context };
  }

  /**
   * Utilisateur d'une session Better Auth valide, à partir de son jeton. Sert au socket
   * du web quand le cookie n'accompagne pas la connexion (frontend et API sur des domaines différents).
   */
  async getUserIdFromSessionToken(token: string): Promise<string | null> {
    if (!token || token.length > 512) return null;
    const session = await this.prisma.session.findUnique({
      where: { token },
      select: { userId: true, expiresAt: true },
    });
    return session && session.expiresAt > new Date() ? session.userId : null;
  }

  /** Membres de l'agence autorisés à lire ses conversations (owner + staff habilité). */
  async getAgencyReaderIds(agencyId: string): Promise<{ userId: string; role: Role }[]> {
    const agency = await this.prisma.agency.findUnique({
      where: { id: agencyId },
      select: {
        owner: { select: { userId: true } },
        staff: {
          where: {
            isActive: true,
            permissions: {
              some: { granted: true, permission: { name: { in: PERMISSIONS_FOR.read } } },
            },
          },
          select: { userId: true },
        },
      },
    });
    if (!agency) return [];
    return [
      { userId: agency.owner.userId, role: Role.OWNER },
      ...agency.staff.map((staff) => ({ userId: staff.userId, role: Role.AGENT })),
    ];
  }
}
