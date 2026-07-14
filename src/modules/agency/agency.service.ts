import {
  BadRequestException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { createAgencyOwnerDto, updateAgencyDto } from './agency.dto';
import {
  AgencyStatus,
  LeadStatus,
  PricingType,
  PropertyStatus,
  Role,
  SubscriptionStatus,
  TenantStatus,
  VisitStatus,
} from '../../../prisma/generated/enums';
import * as crypto from 'crypto';
import { UploadsService } from '../cloudinary/uploads.service';
import { getAuthInstance } from '../../lib/auth';
import { UsersService } from '../users/users.service';
import { PaymentService } from '../common/services/payment.service';
import { HttpError } from '../../config/http.error';
import { CLOUDINARY_FOLDER_NAME } from '../../config/enum';

@Injectable()
export class AgencyService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly userService: UsersService,
    private readonly paymentService: PaymentService,
    private readonly uploadsService: UploadsService,
  ) {}

  // ─────────────────────────────────────────
  // HELPERS PRIVÉS
  // ─────────────────────────────────────────

  async findAgency(agencyId: string, userId: string) {
    await this.agencyAccessControl(agencyId, userId);
    const agency = await this.prismaService.agency.findUnique({
      where: { id: agencyId },
      include: { owner: true },
    });
    if (!agency) {
      throw new NotFoundException('Agency not found');
    }
    return agency;
  }

  async getAgencyPlanFeatures(agencyId: string) {
    const subscription = await this.prismaService.subscription.findUnique({
      where: { agencyId },
      include: {
        plan: {
          include: {
            planFeatures: {
              where: { enabled: true },
              include: {
                feature: {
                  select: {
                    id: true,
                    name: true,
                    category: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!subscription) {
      return {
        features: [],
      };
    }

    const features = subscription.plan.planFeatures.map((pf) => ({
      id: pf.feature.id,
      name: pf.feature.name,
      category: pf.feature.category,
      limit: pf.limit,
    }));

    return {
      plan: subscription.plan.name,
      features,
    };
  }

  // Récupère le plan actif en base, lève une erreur explicite s'il est absent
  private async resolveActivePlan(planId: string) {
    const plan = await this.prismaService.subscriptionPlan.findUnique({
      where: { id: planId },
      include: {
        pricings: true,
      },
    });
    if (!plan) {
      return this.prismaService.subscriptionPlan.findUnique({
        where: { name: 'BASIC_COMMISSION' },
        include: {
          pricings: true,
        },
      });
    }
    if (!plan.isActive) {
      throw new HttpError(
        `Le plan ${plan.name} n'est pas disponible actuellement.`,
        HttpStatus.BAD_REQUEST,
        'PLAN_INACTIVE',
      );
    }
    return plan;
  }

  // ─────────────────────────────────────────
  // ONBOARDING
  // ─────────────────────────────────────────

  async createAgency(
    data: createAgencyOwnerDto,
  ): Promise<{ message: string } | { checkout_url: string; order_id: string }> {
    try {
      const existingUser = await this.userService.findUser({
        email: data?.userEmail,
      });
      if (existingUser) {
        throw new HttpError('Impossible de créer un compte avec cet email', HttpStatus.BAD_REQUEST);
      }

      const plan = await this.resolveActivePlan(data.plan?.planId);
      const isCommission = plan?.pricingType === PricingType.COMMISSION;
      const isSubscription = plan?.pricingType === PricingType.SUBSCRIPTION;

      // ─────────────────────────────────────────
      // SUBSCRIPTION PLAN LOGIC
      // ─────────────────────────────────────────
      if (isSubscription) {
        const uploadSessionId = `upload_${crypto.randomUUID()}`;
        return this.paymentService.initiateAgencyPayment(data, uploadSessionId);
      }

      // ─────────────────────────────────────────
      // 5. TRANSACTION ATOMIQUE
      // ─────────────────────────────────────────

      let uploadedDocuments: string[] = [];

      if (isCommission && data.documents?.length) {
        uploadedDocuments = await Promise.all(
          data.documents.map(async (file) => {
            const result = await this.uploadsService.uploadAgencyFile({
              file,
              agencyName: data.name,
              folderName: CLOUDINARY_FOLDER_NAME.DOC,
              isTemp: false,
            });

            return result.secure_url;
          }),
        );
      }

      await this.prismaService.$transaction(async (tx) => {
        const { user } = await getAuthInstance().api.signUpEmail({
          body: {
            name: data?.username,
            email: data?.userEmail,
            password: data?.password,
          },
        });
        await getAuthInstance().api.sendVerificationEmail({
          body: {
            email: data.userEmail,
          },
        });
        // 5a. OWNER
        const owner = await tx.owner.create({
          data: { userId: user.id },
        });

        // 5b. ROLE UPDATE
        await tx.user.update({
          where: { id: user.id },
          data: { role: Role.OWNER },
        });

        // 5c. AGENCY
        const agency = await tx.agency.create({
          data: {
            name: data.name,
            email: data.email,
            ownerId: owner.id,
            address: data.address,
            phone: data.phone,
            description: data.description,
            documents: isCommission ? uploadedDocuments : [],
            acceptTerms: data.acceptTerms,
          },
        });

        // ─────────────────────────────────────────
        // 5. CREATE SUBSCRIPTION
        // ─────────────────────────────────────────
        await tx.subscription.create({
          data: {
            agencyId: agency.id,
            planId: plan?.id!,
            pricingType: plan?.pricingType!,
            commissionRate: plan?.commissionRate,
          },
        });
      });

      return {
        message: 'Votre agence a été créée avec succès et est en attente de validation.',
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof HttpError
      ) {
        throw new HttpError('Une erreur est survenue, veuillez réessayer plus tard');
      }
      await this.prismaService.user.delete({
        where: { email: data.userEmail },
      });
      throw new InternalServerErrorException(
        'Une erreur interne est survenue. Veuillez réessayer plus tard.',
      );
    }
  }

  // ─────────────────────────────────────────
  // MISE À JOUR
  // ─────────────────────────────────────────

  async updateAgency(data: updateAgencyDto): Promise<{ message: string }> {
    await this.agencyAccessControl(data.agencyId, data.userId);
    try {
      const agency = await this.findAgency(data.agencyId, data?.userId);
      await this.prismaService.agency.update({
        where: { id: agency.id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.description && { description: data.description }),
          ...(data.address && { address: data.address }),
          ...(data.phone && { phone: data.phone }),
          ...(data.agencyLogo && { agencyLogo: data.agencyLogo }),
        },
      });
      return { message: 'Informations mises à jour.' };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof HttpError) {
        throw error;
      }
      console.error('Erreur updateAgency:', error);
      throw new InternalServerErrorException('Une erreur est survenue, réessayez plus tard.');
    }
  }

  // ─────────────────────────────────────────
  // FERMETURE
  // ─────────────────────────────────────────

  async closeAgency(data: { agencyId: string; userId: string }) {
    await this.agencyAccessControl(data.agencyId, data.userId);
    const agency = await this.findAgency(data.agencyId, data.userId);

    const owner = await this.prismaService.owner.findUnique({
      where: { id: data.userId },
    });
    if (!owner) {
      throw new BadRequestException('Owner introuvable.');
    }

    await this.prismaService.$transaction(async (tx) => {
      await tx.agency.update({
        where: { id: agency.id },
        data: { status: AgencyStatus.CLOSE },
      });
      await tx.user.update({
        where: { id: owner.userId },
        data: { role: Role.USER },
      });
      // Annuler l'abonnement actif
      await tx.subscription.update({
        where: { agencyId: agency.id },
        data: { status: SubscriptionStatus.INACTIVE },
      });
    });
  }

  // ─────────────────────────────────────────
  // UTILITAIRES
  // ─────────────────────────────────────────

  async checkAgencyName(name: string): Promise<boolean> {
    const agency = await this.prismaService.agency.findUnique({
      where: { name },
    });
    return !agency;
  }

  async agencyAccessControl(agencyId: string, userId: string) {
    if (!userId || !agencyId) {
      throw new HttpError(
        'Accès refusé à cette agence',
        HttpStatus.FORBIDDEN,
        'AGENCY_ACCESS_DENIED',
      );
    }

    const [owner, staff] = await Promise.all([
      this.prismaService.owner.findUnique({
        where: { id: userId },
        select: { agency: true, userId: true },
      }),
      this.prismaService.staff.findFirst({
        where: { id: userId, agencyId, isActive: true },
        select: { id: true, agency: true, userId: true },
      }),
    ]);

    const isOwner = owner?.agency?.id === agencyId;
    const isStaff = !!staff;

    if (!isOwner && !isStaff) {
      throw new HttpError(
        'Accès refusé à cette agence',
        HttpStatus.FORBIDDEN,
        'AGENCY_ACCESS_DENIED',
      );
    }

    if (isOwner) {
      return {
        type: 'OWNER',
        userOwnerId: owner?.userId,
        agencyId,
      };
    }

    return {
      type: 'STAFF',
      userStaffId: staff?.userId,
      agencyId,
    };
  }

  async getAgencyStats(agencyId: string, userId: string) {
    await this.agencyAccessControl(agencyId, userId);
    try {
      // PROPRIETES
      const [totalProperties, availableProperties, rentedProperties] = await Promise.all([
        this.prismaService.property.count({ where: { agencyId } }),
        this.prismaService.property.count({
          where: { agencyId, status: PropertyStatus.AVAILABLE },
        }),
        this.prismaService.property.count({ where: { agencyId, status: PropertyStatus.RENTED } }),
      ]);

      // LEADS
      const [totalLeads, newLeads, contactedLeads, visitPlannedLeads, convertedLeads] =
        await Promise.all([
          this.prismaService.lead.count({ where: { agencyId } }),
          this.prismaService.lead.count({ where: { agencyId, status: LeadStatus.NEW } }),
          this.prismaService.lead.count({ where: { agencyId, status: LeadStatus.CONTACTED } }),
          this.prismaService.lead.count({ where: { agencyId, status: LeadStatus.VISIT_PLANNED } }),
          this.prismaService.lead.count({ where: { agencyId, status: LeadStatus.CONVERTED } }),
        ]);

      // VISITES
      const [totalVisits, plannedVisits, confirmedVisits, doneVisits, cancelledVisits] =
        await Promise.all([
          this.prismaService.visit.count({ where: { agencyId } }),
          this.prismaService.visit.count({ where: { agencyId, status: VisitStatus.PLANNED } }),
          this.prismaService.visit.count({ where: { agencyId, status: VisitStatus.CONFIRMED } }),
          this.prismaService.visit.count({ where: { agencyId, status: VisitStatus.DONE } }),
          this.prismaService.visit.count({ where: { agencyId, status: VisitStatus.CANCELLED } }),
        ]);

      // LOCATAIRES
      const [totalTenants, activeTenants, inactiveTenants] = await Promise.all([
        this.prismaService.tenant.count({ where: { agencyId } }),
        this.prismaService.tenant.count({ where: { agencyId, status: TenantStatus.ACTIVE } }),
        this.prismaService.tenant.count({ where: { agencyId, status: TenantStatus.INACTIVE } }),
      ]);

      //  STAFF
      const [totalStaff, activeStaff] = await Promise.all([
        this.prismaService.staff.count({ where: { agencyId } }),
        this.prismaService.staff.count({ where: { agencyId, isActive: true } }),
      ]);

      // TICKETS
      const [totalTickets, openTickets, inProgressTickets, resolvedTickets] = await Promise.all([
        this.prismaService.ticket.count({ where: { agencyId } }),
        this.prismaService.ticket.count({ where: { agencyId, status: 'OPEN' } }),
        this.prismaService.ticket.count({ where: { agencyId, status: 'IN_PROGRESS' } }),
        this.prismaService.ticket.count({ where: { agencyId, status: 'RESOLVED' } }),
      ]);

      // RETOURNER LES STATS
      return {
        properties: {
          total: totalProperties,
          available: availableProperties,
          rented: rentedProperties,
          occupancyRate:
            totalProperties > 0 ? Math.round((rentedProperties / totalProperties) * 100) : 0, // taux d'occupation en %
        },
        leads: {
          total: totalLeads,
          new: newLeads,
          contacted: contactedLeads,
          visitPlanned: visitPlannedLeads,
          converted: convertedLeads,
          conversionRate: totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0, // taux de conversion en %
        },
        visits: {
          total: totalVisits,
          planned: plannedVisits,
          confirmed: confirmedVisits,
          done: doneVisits,
          cancelled: cancelledVisits,
        },
        tenants: {
          total: totalTenants,
          active: activeTenants,
          inactive: inactiveTenants,
        },
        staff: {
          total: totalStaff,
          active: activeStaff,
          inactive: totalStaff - activeStaff,
        },
        tickets: {
          total: totalTickets,
          open: openTickets,
          inProgress: inProgressTickets,
          resolved: resolvedTickets,
        },
      };
    } catch (error) {
      throw new InternalServerErrorException(
        'Une erreur interne est survenue. Veuillez reessayer plus tard.',
      );
    }
  }
}
