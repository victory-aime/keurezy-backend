import { legalMissing } from './agency-legal';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AgencyStatus } from '../../../prisma/generated/enums';
import { PrismaService } from '../../database/prisma.service';
import { HttpError } from '../../config/http.error';

@Injectable()
export class AgencyAdminService {
  constructor(private readonly prismaService: PrismaService) {}

  // ─────────────────────────────────────────
  // 1. Liste de toutes les agences + owners
  // ─────────────────────────────────────────
  async getAllAgencies() {
    try {
      return await this.prismaService.agency.findMany({
        include: {
          owner: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  status: true,
                  createdAt: true,
                },
              },
            },
          },
          subscriptions: {
            include: {
              plan: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        'Une erreur est survenue lors de la récupération des agences.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─────────────────────────────────────────
  // 2. Détail complet d'une agence par ID
  // ─────────────────────────────────────────
  async getAgencyById(agencyId: string) {
    const agency = await this.prismaService.agency.findUnique({
      where: { id: agencyId },
      include: {
        owner: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                status: true,
                createdAt: true,
              },
            },
          },
        },
        staff: {
          select: {
            id: true,
          },
        },
        subscriptions: {
          include: {
            plan: true,
          },
        },
        properties: { select: { id: true } },
        batiment: { select: { id: true } },
        villas: { select: { id: true } },
        lands: { select: { id: true } },
        visits: { select: { id: true } },
        tenants: { select: { id: true } },
        contracts: { select: { id: true } },
        transactions: { select: { id: true } },
        tickets: { select: { id: true } },
        reports: { select: { id: true } },
        invitations: { select: { id: true } },
      },
    });

    if (!agency) {
      throw new HttpError(`Agence est introuvable`, HttpStatus.NOT_FOUND, 'AGENCY_NOT_FOUND');
    }
    const missing = legalMissing(agency);

    const {
      properties,
      batiment,
      villas,
      lands,
      visits,
      tenants,
      contracts,
      transactions,
      tickets,
      reports,
      invitations,
      staff,
      ...agencyDetails
    } = agency;

    return {
      ...agencyDetails,
      stats: {
        staff: staff.length,
        properties: properties.length,
        batiments: batiment.length,
        villas: villas.length,
        lands: lands.length,
        visits: visits.length,
        tenants: tenants.length,
        contracts: contracts.length,
        transactions: transactions.length,
        tickets: tickets.length,
        reports: reports.length,
        invitations: invitations.length,
      },
    };
  }

  // ─────────────────────────────────────────
  // 3. Changer le statut d'une agence
  // ─────────────────────────────────────────
  /**
   * Statut d'une agence (SUPER_ADMIN). La vérification suit la complétude des informations
   * légales : une agence incomplète peut être ouverte, mais reste non vérifiée.
   */
  async updateAgencyStatus(
    agencyId: string,
    status: AgencyStatus,
  ): Promise<{ message: string; isVerified: boolean; legalMissing: string[] }> {
    const agency = await this.prismaService.agency.findUnique({
      where: { id: agencyId },
    });

    if (!agency) {
      throw new HttpError(`Agence est introuvable`, HttpStatus.NOT_FOUND, 'AGENCY_NOT_FOUND');
    }
    const missing = legalMissing(agency);

    try {
      await this.prismaService.agency.update({
        where: { id: agencyId },
        data: { status, isVerified: missing.length === 0 },
      });

      return {
        message:
          missing.length === 0
            ? `Le statut de l'agence a été modifié avec succès.`
            : `Statut modifié. Agence non vérifiée : informations légales incomplètes.`,
        isVerified: missing.length === 0,
        legalMissing: missing,
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        'Une erreur est survenue lors de la mise à jour du statut.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
