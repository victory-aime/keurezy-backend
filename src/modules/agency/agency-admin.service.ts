import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '_root/database/prisma.service';
import { AgencyStatus } from '../../../prisma/generated/enums';
import { HttpError } from '_root/config/http.error';

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
        // ── Propriétaire ──
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
        // ── Équipe ──
        staff: {
          select: {
            id: true,
          },
        },
        // ── Abonnement ──
        subscriptions: {
          include: {
            plan: true,
          },
        },
        properties: { select: { id: true } },
        batiment: { select: { id: true } },
        villas: { select: { id: true } },
        lands: { select: { id: true } },
        leads: { select: { id: true } },
        visits: { select: { id: true } },
        tenants: { select: { id: true } },
        contracts: { select: { id: true } },
        transactions: { select: { id: true } },
        transactionCommission: { select: { id: true } },
        tickets: { select: { id: true } },
        reports: { select: { id: true } },
        invitations: { select: { id: true } },
      },
    });

    if (!agency) {
      throw new HttpError(`Agence est introuvable`, HttpStatus.NOT_FOUND, 'AGENCY_NOT_FOUND');
    }

    const {
      properties,
      batiment,
      villas,
      lands,
      leads,
      visits,
      tenants,
      contracts,
      transactions,
      transactionCommission,
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
        leads: leads.length,
        visits: visits.length,
        tenants: tenants.length,
        contracts: contracts.length,
        transactions: transactions.length,
        transactionCommissions: transactionCommission.length,
        tickets: tickets.length,
        reports: reports.length,
        invitations: invitations.length,
      },
    };
  }

  // ─────────────────────────────────────────
  // 3. Changer le statut d'une agence
  // ─────────────────────────────────────────
  async updateAgencyStatus(agencyId: string, status: AgencyStatus): Promise<{ message: string }> {
    const agency = await this.prismaService.agency.findUnique({
      where: { id: agencyId },
    });

    if (!agency) {
      throw new HttpError(`Agence est introuvable`, HttpStatus.NOT_FOUND, 'AGENCY_NOT_FOUND');
    }

    try {
      await this.prismaService.agency.update({
        where: { id: agencyId },
        data: { status, isVerified: true },
      });

      return {
        message: `Le statut de l'agence a été modifié avec succès.`,
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
