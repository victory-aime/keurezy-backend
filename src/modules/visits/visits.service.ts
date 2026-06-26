import { HttpStatus, Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '_root/database/prisma.service';
import { AssignAgentDto, CreateVisitDto, UpdateVisitDto } from './visits.dto';
import { NotificationScope, NotificationType, VisitStatus } from '../../../prisma/generated/enums';
import { HttpError } from '_root/config/http.error';
import { NotificationsService } from '../notifications/notifications.service';
import { AgencyService } from '_root/modules/agency/agency.service';

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly agencyService: AgencyService,
  ) {}

  // CREER UNE VISITE
  async createVisit(dto: CreateVisitDto, agencyId: string, userId: string) {
    const actor = await this.agencyService.agencyAccessControl(agencyId, userId);
    try {
      const lead = await this.prisma.lead.findUnique({
        where: { id: dto.leadId },
        include: { client: { include: { user: true } } },
      });
      if (!lead) {
        throw new HttpError('Demande introuvable', HttpStatus.NOT_FOUND, 'LEAD_NOT_FOUND');
      }

      const property = await this.prisma.property.findUnique({
        where: { id: dto.propertyId },
      });
      if (!property) {
        throw new HttpError('Bien introuvable', HttpStatus.NOT_FOUND, 'PROPERTY_NOT_FOUND');
      }

      if (dto.agentId) {
        const agent = await this.prisma.staff.findFirst({
          where: { id: dto.agentId, agencyId, isActive: true },
        });
        if (!agent) {
          throw new HttpError('Agent introuvable', HttpStatus.NOT_FOUND, 'AGENT_NOT_FOUND');
        }
      }
      const now = new Date();

      const start = new Date(dto.startTime);
      const end = new Date(dto.endTime);
      const scheduled = new Date(dto.scheduledAt);

      // 1. cohérence interne
      if (start >= end) {
        throw new HttpError('Heure de fin invalide', HttpStatus.BAD_REQUEST, 'INVALID_TIME_RANGE');
      }

      // 2. pas dans le passé (optionnel mais recommandé)
      if (start < now) {
        throw new HttpError(
          'Impossible de planifier une visite dans le passé',
          HttpStatus.BAD_REQUEST,
          'PAST_VISIT_NOT_ALLOWED',
        );
      }

      // 3. scheduledAt cohérent
      if (scheduled < new Date(now.toDateString())) {
        throw new HttpError(
          'Date de visite invalide',
          HttpStatus.BAD_REQUEST,
          'INVALID_SCHEDULE_DATE',
        );
      }
      // 4. Creer la visite
      await this.prisma.visit.create({
        data: {
          title: dto.title,
          scheduledAt: dto.scheduledAt,
          startTime: dto.startTime,
          endTime: dto.endTime,
          notes: dto.notes,
          leadId: dto.leadId,
          propertyId: dto.propertyId,
          agentId: dto.agentId ?? null,
          agencyId,
          status: dto.status,
        },
      });

      const clientUserId = lead.client?.user?.id;

      const agencyMemberIds = actor.type === 'OWNER' ? actor.userStaffId : actor.userOwnerId;

      if (clientUserId && agencyMemberIds) {
        const date = new Date(dto.scheduledAt).toLocaleDateString('fr-FR');
        const scope = NotificationScope.USER;
        await Promise.all([
          this.notificationsService.createNotification({
            type: NotificationType.VISIT,
            scope,
            title: 'Visite planifiée',
            content: `Votre visite pour le bien "${property.title}" a été planifiée le ${date}.`,
            recipients: [clientUserId],
          }),

          this.notificationsService.createNotification({
            type: NotificationType.VISIT,
            scope,
            title: 'Nouvelle visite',
            content: `Une visite a été planifiée pour le bien "${property.title}" le ${date}.`,
            recipients: [agencyMemberIds],
          }),
        ]);
      }

      return { message: 'Visite planifiee avec succes' };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error('Erreur createVisit:', error);
      throw new InternalServerErrorException(
        'Une erreur interne est survenue. Veuillez reessayer plus tard.',
      );
    }
  }

  // LISTER LES VISITES D'UNE AGENCE
  async getVisitsByAgency(agencyId: string, userId: string) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    try {
      return await this.prisma.visit.findMany({
        where: { agencyId },
        select: {
          id: true,
          scheduledAt: true,
          startTime: true,
          endTime: true,
          title: true,
          status: true,
          notes: true,
          lead: {
            select: {
              id: true,
              property: {
                select: { id: true, title: true, address: true, city: true, price: true },
              },
              client: { include: { user: { select: { name: true, email: true } } } },
              assignedTo: { select: { user: { select: { id: true, name: true } } } },
            },
          },
        },
        orderBy: { scheduledAt: 'asc' },
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error('Erreur getVisitsByAgency:', error);
      throw new InternalServerErrorException(
        'Une erreur interne est survenue. Veuillez reessayer plus tard.',
      );
    }
  }

  // DETAIL D'UNE VISITE
  async getVisitById(visitId: string) {
    try {
      const visit = await this.prisma.visit.findUnique({
        where: { id: visitId },
        include: {
          property: { select: { title: true, address: true, city: true } },
          agent: { select: { user: { select: { name: true, email: true } } } },
          lead: {
            include: {
              client: { include: { user: { select: { name: true, email: true } } } },
            },
          },
        },
      });

      if (!visit) {
        throw new HttpError('Visite introuvable', HttpStatus.NOT_FOUND, 'VISIT_NOT_FOUND');
      }

      return visit;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error('Erreur getVisitById:', error);
      throw new InternalServerErrorException(
        'Une erreur interne est survenue. Veuillez reessayer plus tard.',
      );
    }
  }

  // MES VISITES (CLIENT)
  async getMyVisits(userId: string) {
    try {
      const client = await this.prisma.client.findUnique({ where: { userId } });
      if (!client) {
        throw new HttpError('Client introuvable', HttpStatus.NOT_FOUND, 'CLIENT_NOT_FOUND');
      }

      return this.prisma.visit.findMany({
        where: { lead: { clientId: client.id } },
        include: {
          property: true,
        },
        orderBy: { scheduledAt: 'asc' },
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error('Erreur getMyVisits:', error);
      throw new InternalServerErrorException(
        'Une erreur interne est survenue. Veuillez reessayer plus tard.',
      );
    }
  }

  async updateVisit(userId: string, agencyId: string, dto: UpdateVisitDto) {
    const actor = await this.agencyService.agencyAccessControl(agencyId, userId);

    try {
      const visit = await this.prisma.visit.findUnique({
        where: { id: dto.visitId },
        include: {
          lead: { include: { client: { include: { user: true } } } },
          property: { select: { title: true } },
          agency: true,
        },
      });

      if (!visit) {
        throw new HttpError('Visite introuvable', HttpStatus.NOT_FOUND, 'VISIT_NOT_FOUND');
      }

      // 🔒 BLOCK if DONE
      if (visit.status === VisitStatus.DONE) {
        throw new HttpError(
          'Une visite terminée ne peut pas être modifiée',
          HttpStatus.BAD_REQUEST,
          'VISIT_LOCKED',
        );
      }

      const now = new Date();

      const start = new Date(dto.startTime);
      const end = new Date(dto.endTime);
      const scheduled = new Date(dto.scheduledAt);

      // 🔥 VALIDATIONS TIME
      if (start >= end) {
        throw new HttpError('Heure de fin invalide', HttpStatus.BAD_REQUEST, 'INVALID_TIME_RANGE');
      }

      if (start < now) {
        throw new HttpError(
          'Impossible de planifier une visite dans le passé',
          HttpStatus.BAD_REQUEST,
          'PAST_VISIT_NOT_ALLOWED',
        );
      }

      if (scheduled < new Date(now.toDateString())) {
        throw new HttpError(
          'Date de visite invalide',
          HttpStatus.BAD_REQUEST,
          'INVALID_SCHEDULE_DATE',
        );
      }

      // 🔥 VALIDATE AGENT
      if (dto.agentId) {
        const agent = await this.prisma.staff.findFirst({
          where: {
            id: dto.agentId,
            agencyId: visit.agencyId,
            isActive: true,
          },
        });

        if (!agent) {
          throw new HttpError('Agent introuvable', HttpStatus.NOT_FOUND, 'AGENT_NOT_FOUND');
        }
      }

      const startChanged =
        new Date(dto.startTime).toISOString() !== new Date(visit?.startTime!).toISOString();

      const endChanged =
        new Date(dto.endTime).toISOString() !== new Date(visit?.endTime!).toISOString();

      const dateChanged =
        new Date(dto.scheduledAt).toISOString() !== new Date(visit?.scheduledAt).toISOString();

      const planningChanged = startChanged || endChanged || dateChanged;

      // 🔥 UPDATE VISIT
      const updated = await this.prisma.visit.update({
        where: { id: dto.visitId },
        data: {
          scheduledAt: dto.scheduledAt,
          startTime: dto.startTime,
          endTime: dto.endTime,
          status: dto.status,
          agentId: dto.agentId ?? null,
          title: dto.title,
          notes: dto.notes,
        },
      });

      // 🔔 NOTIFICATIONS
      if (planningChanged) {
        const date = new Date(dto.scheduledAt).toLocaleDateString('fr-FR');
        const startHour = new Date(dto.startTime).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const endHour = new Date(dto.endTime).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const clientUserId = visit.lead?.client?.user?.id;

        const recipients = [visit.agentId, actor?.userOwnerId].filter((id): id is string =>
          Boolean(id),
        );

        if (clientUserId) {
          await this.notificationsService.createNotification({
            type: NotificationType.VISIT,
            scope: NotificationScope.USER,
            title: 'Visite reprogrammée',
            content: `Votre visite pour le bien "${visit.property?.title}" a été reprogrammée le ${date} de ${startHour} à ${endHour}.`,
            recipients: [clientUserId],
          });

          await this.notificationsService.notifyAgency({
            agencyMembers: recipients,
            payload: {
              type: NotificationType.VISIT,
              title: 'Visite reprogrammée',
              content: `Une visite a été reprogrammée pour le bien "${visit.property?.title}" le ${date} de ${startHour} à ${endHour}.`,
            },
          });
        }
      }

      return {
        message: 'Visite mise à jour avec succès',
        data: updated,
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;

      console.error('Erreur updateVisit:', error);

      throw new InternalServerErrorException(
        'Une erreur interne est survenue. Veuillez réessayer plus tard.',
      );
    }
  }

  // ASSIGNER UN AGENT A UNE VISITE
  async assignAgent(visitId: string, dto: AssignAgentDto) {
    try {
      const visit = await this.prisma.visit.findUnique({ where: { id: visitId } });
      if (!visit) {
        throw new HttpError('Visite introuvable', HttpStatus.NOT_FOUND, 'VISIT_NOT_FOUND');
      }

      if (visit.agentId === dto.agentId) {
        return { message: 'Cet agent est deja assigne a cette visite.' };
      }

      const agent = await this.prisma.staff.findFirst({
        where: { id: dto.agentId, agencyId: visit.agencyId, isActive: true },
        include: { user: true },
      });
      if (!agent) {
        throw new HttpError('Agent introuvable', HttpStatus.NOT_FOUND, 'AGENT_NOT_FOUND');
      }

      await this.prisma.visit.update({
        where: { id: visitId },
        data: { agentId: dto.agentId },
      });

      // 🔔 Notifier l'agent qu'une visite lui a ete assignee
      await this.notificationsService.createNotification({
        type: NotificationType.VISIT,
        recipients: [agent.user.id],
        title: 'Nouvelle visite assignee',
        scope: NotificationScope.USER,
        content: `Une visite vous a ete assignee le ${new Date(visit.scheduledAt).toLocaleDateString('fr-FR')}.`,
      });

      return { message: 'Agent assigne avec succes' };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error('Erreur assignAgent:', error);
      throw new InternalServerErrorException(
        'Une erreur interne est survenue. Veuillez reessayer plus tard.',
      );
    }
  }

  async cancelVisit(visitId: string, agencyId: string, userId: string) {
    try {
      await this.agencyService.agencyAccessControl(agencyId, userId);

      const visit = await this.prisma.visit.findUnique({
        where: { id: visitId },
        include: {
          lead: {
            include: {
              client: {
                include: {
                  user: true,
                },
              },
            },
          },
          property: true,
          agency: {
            include: {
              owner: true,
            },
          },
        },
      });

      if (!visit) {
        throw new HttpError('Visite introuvable', HttpStatus.NOT_FOUND, 'VISIT_NOT_FOUND');
      }

      // 🔒 DONE = locked
      if (visit.status === VisitStatus.DONE) {
        throw new HttpError(
          'Impossible d’annuler une visite déjà effectuée',
          HttpStatus.BAD_REQUEST,
          'VISIT_ALREADY_DONE',
        );
      }

      // already cancelled
      if (visit.status === VisitStatus.CANCELLED) {
        return {
          message: 'La visite est déjà annulée',
        };
      }

      await this.prisma.visit.update({
        where: { id: visitId },
        data: {
          status: VisitStatus.CANCELLED,
        },
      });

      const recipients = [
        visit.lead?.client?.user?.id,
        visit.agency?.owner?.userId,
        visit.agentId,
      ].filter((id): id is string => Boolean(id));

      if (recipients.length) {
        await this.notificationsService.createNotification({
          type: NotificationType.VISIT,
          scope: NotificationScope.USER,
          title: 'Visite annulée',
          content: `La visite pour le bien "${visit.property?.title}" a été annulée.`,
          recipients,
        });
      }

      return {
        message: 'Visite annulée avec succès',
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error('Erreur cancelVisit:', error);
      throw new InternalServerErrorException(
        'Une erreur interne est survenue. Veuillez réessayer plus tard.',
      );
    }
  }
}
