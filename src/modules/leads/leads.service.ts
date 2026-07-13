import { HttpStatus, Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '_root/database/prisma.service';
import { HttpError } from '_root/config/http.error';
import { AssignLeadDto, CreateLeadDto, UpdateLeadStatusDto } from './leads.dto';
import { LeadStatus, NotificationType } from '../../../prisma/generated/enums';
import { AgencyService } from '../agency/agency.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatService } from '_root/modules/chat/chat.service';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agencyService: AgencyService,
    private readonly notificationService: NotificationsService,
    private readonly chatService: ChatService,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  // CRÉER UN LEAD
  // ─────────────────────────────────────────────────────────────────
  async createLead(dto: CreateLeadDto, userId: string) {
    const { message, propertyId } = dto;

    const client = await this.prisma.client.findUnique({ where: { userId } });
    if (!client) {
      throw new HttpError('Profil client introuvable', HttpStatus.NOT_FOUND, 'CLIENT_NOT_FOUND');
    }

    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      include: { agency: true },
    });

    if (!property) {
      throw new HttpError('Propriété introuvable.', HttpStatus.NOT_FOUND, 'PROPERTY_NOT_FOUND');
    }

    if (!property.agencyId) {
      throw new HttpError(
        'Agence liée à la propriété introuvable.',
        HttpStatus.BAD_REQUEST,
        'AGENCY_NOT_FOUND',
      );
    }

    const existingByUser = await this.prisma.lead.findFirst({
      where: {
        propertyId,
        clientId: client.id,
        status: { not: LeadStatus.CONVERTED },
      },
    });

    if (existingByUser) {
      throw new HttpError(
        'Vous avez déjà soumis une demande pour ce bien.',
        HttpStatus.CONFLICT,
        'LEAD_ALREADY_EXISTS',
      );
    }

    await this.prisma.lead.create({
      data: {
        propertyId: propertyId,
        agencyId: property.agencyId,
        message: message,
        clientId: client.id,
        status: LeadStatus.NEW,
      },
    });

    return {
      message:
        'Votre message a été envoyé avec succès. Un agent de l’agence vous contactera bientôt pour discuter de votre demande.',
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // LISTER LES LEADS D'UNE AGENCE
  // Accessible : Owner + Staff actif de l'agence
  // ─────────────────────────────────────────────────────────────────
  async getLeadsByAgency(agencyId: string, userId: string) {
    try {
      await this.agencyService.agencyAccessControl(agencyId, userId);

      return this.prisma.lead.findMany({
        where: { agencyId },
        include: {
          property: { select: { title: true, type: true, city: true, price: true } },
          client: {
            select: {
              phone: true,
              user: { select: { name: true, email: true } },
            },
          },
          assignedTo: { select: { user: { select: { name: true } } } },
          visits: { select: { scheduledAt: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new InternalServerErrorException(
        'Une erreur interne est survenue. Veuillez réessayer plus tard.',
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // LISTER MES LEADS (côté client connecté)
  // Accessible : client connecté uniquement
  // ─────────────────────────────────────────────────────────────────
  async getMyLeads(userId: string) {
    try {
      const client = await this.prisma.client.findUnique({ where: { userId } });
      if (!client) {
        throw new HttpError('Profil client introuvable', HttpStatus.NOT_FOUND, 'CLIENT_NOT_FOUND');
      }

      return this.prisma.lead.findMany({
        where: { clientId: client.id },
        include: {
          property: {
            select: { title: true, type: true, city: true, price: true },
          },
          assignedTo: { select: { user: { select: { name: true } } } },
          visits: {
            select: {
              scheduledAt: true,
              status: true,
              startTime: true,
              endTime: true,
              notes: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new InternalServerErrorException(
        'Une erreur interne est survenue. Veuillez réessayer plus tard.',
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // DÉTAIL D'UN LEAD
  // Accessible : Owner + Staff de l'agence
  // ─────────────────────────────────────────────────────────────────
  async getLeadById(leadId: string, agencyId: string, userId: string) {
    try {
      await this.agencyService.agencyAccessControl(agencyId, userId);

      const lead = await this.prisma.lead.findUnique({
        where: { id: leadId },
        include: {
          property: true,
          client: {
            include: { user: { select: { name: true, email: true } } },
          },
          assignedTo: {
            include: { user: { select: { name: true, email: true } } },
          },
          visits: true,
          tenant: true,
        },
      });

      if (!lead) {
        throw new HttpError('Lead introuvable', HttpStatus.NOT_FOUND, 'LEAD_NOT_FOUND');
      }

      return lead;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new InternalServerErrorException(
        'Une erreur interne est survenue. Veuillez réessayer plus tard.',
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // CHANGER LE STATUT D'UN LEAD (pipeline CRM)
  // Accessible : Owner + Staff actif de l'agence
  // ─────────────────────────────────────────────────────────────────
  async updateLeadStatus(dto: UpdateLeadStatusDto) {
    try {
      await this.agencyService.agencyAccessControl(dto.leadId, dto.userId);
      const lead = await this.prisma.lead.findUnique({ where: { id: dto.leadId } });
      if (!lead) {
        throw new HttpError('Lead introuvable', HttpStatus.NOT_FOUND, 'LEAD_NOT_FOUND');
      }

      const isConverted = (status: LeadStatus) => status === LeadStatus.CONVERTED;

      if (isConverted(lead.status) || isConverted(dto.status)) {
        throw new HttpError(
          'Ce statut ne peut pas être modifié',
          HttpStatus.BAD_REQUEST,
          'FORBIDDEN_STATUS',
        );
      }

      await this.prisma.lead.update({
        where: { id: dto.leadId },
        data: { status: dto.status },
        include: {
          property: { select: { title: true } },
          assignedTo: { select: { user: { select: { name: true } } } },
        },
      });
      return {
        message: 'Demande mise a jour avec succes',
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new InternalServerErrorException(
        'Une erreur interne est survenue. Veuillez réessayer plus tard.',
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // ASSIGNER UN AGENT AU LEAD
  // Accessible : Owner + AGENCY_ADMIN uniquement
  // ─────────────────────────────────────────────────────────────────
  async assignLead(dto: AssignLeadDto) {
    await this.agencyService.agencyAccessControl(dto.agencyId, dto?.userId);
    try {
      const lead = await this.prisma.lead.findUnique({ where: { id: dto.leadId } });
      if (!lead) {
        throw new HttpError('Lead introuvable', HttpStatus.NOT_FOUND, 'LEAD_NOT_FOUND');
      }

      const staff = await this.prisma.staff.findFirst({
        where: { id: dto.staffId, agencyId: lead.agencyId, isActive: true },
      });
      if (!staff) {
        throw new HttpError(
          "impossible d'assigner a cette agence",
          HttpStatus.BAD_REQUEST,
          'STAFF_NOT_FOUND',
        );
      }

      const leadUpdate = await this.prisma.lead.update({
        where: { id: dto.leadId },
        data: { assignedToId: dto.staffId },
        include: {
          assignedTo: {
            select: { user: true },
          },
        },
      });

      await this.chatService.handleLeadReassignment(
        leadUpdate.id,
        leadUpdate.assignedTo?.user?.id ?? null,
      );

      await this.notificationService.notifyStaff({
        staffUserId: staff.userId,
        payload: {
          type: NotificationType.LEAD,
          title: 'Nouvelle tâche',
          content: 'Vous avez été assigné à une tâche',
        },
      });
      return {
        message: 'Tâche assignée avec success',
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new InternalServerErrorException(
        'Une erreur interne est survenue. Veuillez réessayer plus tard.',
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // SUPPRIMER UN LEAD
  // Accessible : Owner + AGENCY_ADMIN uniquement
  async deleteLead(leadId: string, userId: string, agencyId: string) {
    try {
      await this.agencyService.agencyAccessControl(agencyId, userId);
      const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) {
        throw new HttpError('Lead introuvable', HttpStatus.NOT_FOUND, 'LEAD_NOT_FOUND');
      }
      //  Bloquer la suppression d'un lead converti
      if (lead.status === LeadStatus.CONVERTED) {
        throw new HttpError(
          'Impossible de supprimer un lead déjà converti en locataire',
          HttpStatus.BAD_REQUEST,
          'LEAD_ALREADY_CONVERTED',
        );
      }

      await this.prisma.lead.delete({ where: { id: leadId } });

      return { message: 'Lead supprimé avec succès' };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new InternalServerErrorException(
        'Une erreur interne est survenue. Veuillez réessayer plus tard.',
      );
    }
  }
}
