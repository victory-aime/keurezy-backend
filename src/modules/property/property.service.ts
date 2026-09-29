import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MonthlyRevenueQueryDto, PropertyDto, PropertyFilterDto } from './property.dto';
import { HttpError } from '../../config/http.error';
import { AgencyService } from '../agency/agency.service';
import { convertToInteger } from '../../config/convert';
import { Prisma } from '../../../prisma/generated/client';
import { AnnonceStatus, BookingStatus, VisitStatus } from '../../../prisma/generated/enums';
import { todayCalendarDate } from '../rentals/calendar-date';
import { PropertyImpact } from './property-impact';
import { FeatureCommercial } from '../../config/enum';
import { PlanFeaturePolicyService } from '../packs/plan-feature-policy.service';
import { RENTAL_INCLUDE, RentalConfigService } from '../rentals/rental-config.service';

@Injectable()
export class PropertyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agencyService: AgencyService,
    private readonly planFeaturePolicy: PlanFeaturePolicyService,
    private readonly rentalConfigService: RentalConfigService,
  ) {}

  async getAllPropertyByAgency(query: PropertyFilterDto, userId: string) {
    if (!query.agencyId) {
      throw new HttpError(
        "L'identifiant de l'agence est requis",
        HttpStatus.BAD_REQUEST,
        'AGENCY_ID_REQUIRED',
      );
    }
    await this.agencyService.agencyAccessControl(query.agencyId, userId);

    const pageInitial = convertToInteger(query?.initialPage) || 1;
    const limitPage = convertToInteger(query?.limitPerPage) || 10;
    const skip = (pageInitial - 1) * limitPage;

    const propertyFilterOptions = {
      ...{ agencyId: query?.agencyId },
      ...(query?.title && {
        title: {
          contains: query.title,
          mode: Prisma.QueryMode.insensitive,
        },
      }),
      ...(query.type && { type: query.type }),
      ...(query.status && { status: query.status }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where: propertyFilterOptions,
        include: RENTAL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitPage,
      }),
      this.prisma.property.count({
        where: propertyFilterOptions,
      }),
    ]);

    return {
      content: data,
      totalDataPerPage: limitPage,
      totalItems: total,
      currentPage: pageInitial,
      totalPages: Math.ceil(total / limitPage),
    };
  }

  async getAllPublicProperties() {
    return this.prisma.property.findMany({
      where: { status: 'AVAILABLE' },
      include: {
        agency: {
          select: {
            name: true,
            phone: true,
            isVerified: true,
          },
        },
      },
    });
  }

  async createProperty(data: PropertyDto, userId: string): Promise<{ message: string }> {
    await this.agencyService.agencyAccessControl(data.agencyId, userId);
    const context = await this.planFeaturePolicy.getAgencyFeatureContext(data.agencyId!);

    const currentProperties = await this.planFeaturePolicy.countPropertyAssets(data.agencyId!);

    const check = this.planFeaturePolicy.checkCapacity(
      context,
      FeatureCommercial.PROPERTIES,
      currentProperties,
    );

    if (!check.allowed) {
      throw new HttpError(
        'Votre capacité maximale de biens est atteinte.',
        HttpStatus.FORBIDDEN,
        'PROPERTY_CAPACITY_REACHED',
      );
    }

    const agency = await this.prisma.agency.findUnique({ where: { id: data.agencyId } });
    if (!agency) {
      throw new HttpError('Agence introuvable', HttpStatus.NOT_FOUND, 'AGENCY_NOT_FOUND');
    }

    const uniqueName = await this.prisma.property.findUnique({
      where: {
        agencyId_title: {
          agencyId: data.agencyId,
          title: data.title,
        },
      },
    });

    if (uniqueName) {
      throw new HttpError(
        'Une propriété avec ce titre existe déjà pour votre agence',
        HttpStatus.CONFLICT,
        'PROPERTY_ALREADY_EXISTS',
      );
    }

    if (data.batimentId) {
      const batiment = await this.prisma.batiment.findUnique({
        where: { id: data.batimentId },
      });

      if (!batiment) {
        throw new HttpError('Bâtiment introuvable', HttpStatus.NOT_FOUND, 'BATIMENT_NOT_FOUND');
      }

      if (batiment.agencyId !== data.agencyId) {
        throw new HttpError(
          "Le bâtiment n'appartient pas à votre agence",
          HttpStatus.FORBIDDEN,
          'INVALID_BATIMENT',
        );
      }

      // 👉 On ignore les champs adresse si bâtiment fourni
      data.address = null;
      data.city = null;
      data.district = null;
    } else {
      if (!data.address || !data.city || !data?.district || !data?.propertyOwner) {
        throw new HttpError(
          'Adresse, ville, quartier et propriétaire requis si aucun bâtiment',
          HttpStatus.BAD_REQUEST,
          'ADDRESS_REQUIRED',
        );
      }
    }

    const { rentalConfigs = [], ...propertyValues } = data;
    this.rentalConfigService.validate(rentalConfigs);

    await this.prisma.$transaction(async (tx) => {
      const property = await tx.property.create({
        data: { ...propertyValues, ...this.rentalConfigService.referencePricing(rentalConfigs) },
      });
      await this.rentalConfigService.replaceForProperty(tx, property.id, rentalConfigs);
    });

    return { message: 'Propriété créée avec succès' };
  }

  async updateProperty(
    propertyId: string,
    data: PropertyDto,
    userId: string,
  ): Promise<{ message: string }> {
    await this.agencyService.agencyAccessControl(data.agencyId, userId);
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property || property.agencyId !== data.agencyId) {
      throw new HttpError('Propriété introuvable', HttpStatus.NOT_FOUND, 'PROPERTY_NOT_FOUND');
    }

    // ✅ Vérification que l'agence existe
    const agency = await this.prisma.agency.findUnique({ where: { id: property.agencyId } });
    if (!agency) {
      throw new HttpError('Agence introuvable', HttpStatus.NOT_FOUND, 'AGENCY_NOT_FOUND');
    }

    // 🧠 Cas où on change le bâtiment
    if (data.batimentId) {
      const batiment = await this.prisma.batiment.findUnique({
        where: { id: data.batimentId },
      });

      if (!batiment) {
        throw new HttpError('Bâtiment introuvable', HttpStatus.NOT_FOUND, 'BATIMENT_NOT_FOUND');
      }

      if (batiment.agencyId !== property.agencyId) {
        throw new HttpError(
          "Le bâtiment n'appartient pas à votre agence",
          HttpStatus.FORBIDDEN,
          'INVALID_BATIMENT',
        );
      }

      // 👉 reset adresse si bâtiment
      data.address = null;
      data.city = null;
      data.district = null;
      data.propertyOwner = null;
    }

    if (data.batimentId === null) {
      if (!data.address && !property.address) {
        throw new HttpError(
          'Adresse requise si aucun bâtiment',
          HttpStatus.BAD_REQUEST,
          'ADDRESS_REQUIRED',
        );
      }
    }

    if (data.title && data.title !== property.title) {
      const existing = await this.prisma.property.findUnique({
        where: {
          agencyId_title: {
            agencyId: property.agencyId,
            title: data.title,
          },
        },
      });

      if (existing) {
        throw new HttpError(
          'Une propriété avec ce titre existe déjà',
          HttpStatus.CONFLICT,
          'PROPERTY_ALREADY_EXISTS',
        );
      }
    }

    const { agencyId, batimentId, rentalConfigs, ...safeValues } = data;
    // Modalités absentes (anciens clients) : elles restent inchangées
    if (rentalConfigs) this.rentalConfigService.validate(rentalConfigs);

    await this.prisma.$transaction(async (tx) => {
      await tx.property.update({
        where: { id: propertyId },
        data: {
          ...safeValues,
          ...(rentalConfigs && this.rentalConfigService.referencePricing(rentalConfigs)),
          agency: { connect: { id: agencyId } },
          ...(batimentId
            ? { batiment: { connect: { id: batimentId } } }
            : { batiment: { disconnect: true } }),
        },
      });
      if (rentalConfigs) {
        await this.rentalConfigService.replaceForProperty(tx, propertyId, rentalConfigs);
      }
    });

    return { message: 'Propriété mis a jour avec succès' };
  }

  async getOccupationRateByType1(ownerId: string, agencyId: string) {
    await this.agencyService.agencyAccessControl(agencyId, ownerId);

    const properties = await this.prisma.property.findMany({
      where: { agencyId },
      select: {
        type: true,
        status: true,
      },
    });

    const stats = properties.reduce(
      (acc, property) => {
        const type = property.type;

        if (!acc[type]) {
          acc[type] = { total: 0, occupied: 0 };
        }

        acc[type].total++;

        if (property.status !== 'AVAILABLE') {
          acc[type].occupied++;
        }

        return acc;
      },
      {} as Record<string, { total: number; occupied: number }>,
    );

    return Object.entries(stats).map(([type, value]) => ({
      type,
      total: value.total,
      occupied: value.occupied,
      occupationRate: value.total === 0 ? 0 : Math.round((value.occupied / value.total) * 100),
    }));
  }

  /**
   * Stats: Taux d'occupation par type de propriété
   */
  async getOccupationRateByType(userId: string, agencyId: string) {
    await this.agencyService.agencyAccessControl(agencyId, userId);

    const properties = await this.prisma.property.findMany({
      where: { agencyId },
      select: {
        type: true,
        status: true,
      },
    });

    const grouped: Record<string, { total: number; occupied: number }> = {};

    properties.forEach((p) => {
      if (!grouped[p.type]) grouped[p.type] = { total: 0, occupied: 0 };
      grouped[p.type].total += 1;
      if (p.status !== 'AVAILABLE') grouped[p.type].occupied += 1;
    });

    return Object.entries(grouped).map(([type, { total, occupied }]) => ({
      propertyType: type,
      occupationRate: Math.round((occupied / total) * 100),
    }));
  }

  /**
   * Revenus mensuels d'une année, d'après les réservations (pas encore de paiement en ligne) :
   * « reçu » = séjours terminés, « restant » = séjours confirmés à venir, par mois de début.
   */
  async getMonthlyRevenue({ agencyId, year }: MonthlyRevenueQueryDto, userId: string) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    const targetYear = year ?? new Date().getUTCFullYear();

    // ponytail: agrégation en mémoire sur une année d'une agence ; groupBy SQL si le volume grossit
    const bookings = await this.prisma.booking.findMany({
      where: {
        agencyId,
        status: { in: [BookingStatus.COMPLETED, BookingStatus.CONFIRMED] },
        startDate: {
          gte: new Date(Date.UTC(targetYear, 0, 1)),
          lt: new Date(Date.UTC(targetYear + 1, 0, 1)),
        },
      },
      select: { startDate: true, status: true, totalAmount: true },
    });

    const months = Array.from({ length: 12 }, (_, index) => ({
      month: `${targetYear}-${String(index + 1).padStart(2, '0')}`,
      receivedAmount: 0,
      remainingAmount: 0,
    }));
    for (const booking of bookings) {
      const row = months[booking.startDate.getUTCMonth()];
      const amount = Number(booking.totalAmount);
      if (booking.status === BookingStatus.COMPLETED) row.receivedAmount += amount;
      else row.remainingAmount += amount;
    }
    return months;
  }

  /** Bien de l'agence de l'appelant (contrôle d'accès sur l'agence du bien). */
  private async findAgencyProperty(id: string, userId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      select: { id: true, agencyId: true },
    });
    if (!property) {
      throw new HttpError('Bien introuvable', HttpStatus.NOT_FOUND, 'PROPERTY_NOT_FOUND');
    }
    await this.agencyService.agencyAccessControl(property.agencyId, userId);
    return property;
  }

  /**
   * Ce qui est lié au bien, affiché avant une fermeture ou une suppression (l'utilisateur
   * voit ce que son action entraîne). `canDelete` est la règle unique de suppression.
   */
  async getPropertyImpact(id: string, userId: string): Promise<PropertyImpact> {
    await this.findAgencyProperty(id, userId);
    return this.computePropertyImpact(id);
  }

  private async computePropertyImpact(propertyId: string): Promise<PropertyImpact> {
    const where = { propertyId };
    const [annonces, online, bookings, upcoming, pending, conversations, visits, upcomingVisits] =
      await Promise.all([
        this.prisma.annonce.count({ where }),
        this.prisma.annonce.count({ where: { ...where, status: AnnonceStatus.ACTIVE } }),
        this.prisma.booking.count({ where }),
        this.prisma.booking.count({
          where: {
            ...where,
            status: BookingStatus.CONFIRMED,
            endDate: { gte: todayCalendarDate() },
          },
        }),
        this.prisma.booking.count({ where: { ...where, status: BookingStatus.PENDING } }),
        this.prisma.conversation.count({ where }),
        this.prisma.visit.count({ where }),
        this.prisma.visit.count({
          where: {
            ...where,
            status: { in: [VisitStatus.PLANNED, VisitStatus.CONFIRMED] },
            scheduledAt: { gte: new Date() },
          },
        }),
      ]);
    return {
      annonces: { total: annonces, online },
      bookings: { total: bookings, upcoming, pending },
      conversations,
      visits: { total: visits, upcoming: upcomingVisits },
      // Réservations conservées, discussions supprimées en cascade, visites bloquées par la base
      canDelete: bookings === 0 && conversations === 0 && visits === 0,
    };
  }

  async getPropertyDetail(id: string, userId: string) {
    await this.findAgencyProperty(id, userId);
    return this.prisma.property.findUnique({
      where: { id },
      include: { annonces: true, ...RENTAL_INCLUDE },
    });
  }

  /** Fermer : le bien reste (historique), ses annonces en ligne sont retirées. */
  async closeProperty(id: string, userId: string) {
    await this.findAgencyProperty(id, userId);
    await this.prisma.annonce.updateMany({
      where: { propertyId: id, status: AnnonceStatus.ACTIVE },
      data: { status: AnnonceStatus.INACTIVE },
    });
    return { message: 'Le bien a été fermé : ses annonces ne sont plus en ligne.' };
  }

  /**
   * Supprimer : uniquement un bien sans historique (`canDelete` de l'impact). Contrats et
   * locataires éventuels restent bloqués par la base (P2003).
   */
  async deleteProperty(id: string, userId: string) {
    await this.findAgencyProperty(id, userId);
    const impact = await this.computePropertyImpact(id);
    if (impact.bookings.total > 0) {
      throw new HttpError(
        'Ce bien a des réservations : fermez-le plutôt que de le supprimer.',
        HttpStatus.CONFLICT,
        'PROPERTY_HAS_BOOKINGS',
      );
    }
    if (!impact.canDelete) {
      throw new HttpError(
        'Ce bien a des discussions ou des visites : fermez-le plutôt que de le supprimer.',
        HttpStatus.CONFLICT,
        'PROPERTY_IN_USE',
      );
    }
    try {
      await this.prisma.property.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new HttpError(
          'Ce bien a des visites ou un historique : fermez-le plutôt que de le supprimer.',
          HttpStatus.CONFLICT,
          'PROPERTY_IN_USE',
        );
      }
      throw error;
    }
    return { message: 'Bien supprimé avec succès.' };
  }
}
