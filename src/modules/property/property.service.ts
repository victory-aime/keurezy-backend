import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '_root/database/prisma.service';
import { propertyDto, PropertyFilterDto } from '_root/modules/property/property.dto';
import { HttpError } from '_root/config/http.error';
import { AgencyService } from '_root/modules/agency/agency.service';
import { convertToInteger } from '_root/config/convert';
import { Prisma } from '../../../prisma/generated/client';
import { FeatureCommercial } from '_root/config/enum';
import { PlanFeaturePolicyService } from '_root/modules/common/services/plan-feature-policy.service';

@Injectable()
export class PropertyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agencyService: AgencyService,
    private readonly planFeaturePolicy: PlanFeaturePolicyService,
  ) {}

  async getAllPropertyByAgency(query: PropertyFilterDto) {
    if (!query.agencyId) {
      throw new HttpError(
        "L'identifiant de l'agence est requis",
        HttpStatus.BAD_REQUEST,
        'AGENCY_ID_REQUIRED',
      );
    }

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

  async createProperty(data: propertyDto): Promise<{ message: string }> {
    await this.agencyService.agencyAccessControl(data.agencyId, data.userId);
    const context = await this.planFeaturePolicy.getAgencyFeatureContext(data.agencyId!);

    const currentProperties = await this.prisma.annonce.count({
      where: {
        property: {
          agencyId: data.agencyId,
        },
      },
    });

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

    const { userId, ...extractValues } = data;

    await this.prisma.property.create({ data: { ...extractValues } });

    return { message: 'Propriété créée avec succès' };
  }

  async updateProperty(propertyId: string, data: propertyDto): Promise<{ message: string }> {
    await this.agencyService.agencyAccessControl(data.agencyId, data.userId);
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property) {
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

    const { agencyId, batimentId, ...safeValues } = data;

    await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        ...safeValues,
        agency: { connect: { id: agencyId } },
        ...(batimentId
          ? { batiment: { connect: { id: batimentId } } }
          : { batiment: { disconnect: true } }),
      },
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

  // /**
  //  * Stats: Revenus mensuels par maison occupée (fake API pour dev)
  //  */
  // async getMonthlyRevenue(ownerId: string, agencyId: string) {
  //   await this.agencyService.checkAgencyOwnership(ownerId, agencyId);
  //
  //   const properties = await this.prisma.property.findMany({
  //     where: {
  //       agencyId,
  //       status: { not: 'AVAILABLE' },
  //     },
  //     select: { price: true },
  //   });
  //
  //   const expectedAmount = properties.reduce(
  //     (sum, p) => sum + Number(p.price),
  //     0,
  //   );
  //
  //   const months = [
  //     'January',
  //     'February',
  //     'March',
  //     'April',
  //     'May',
  //     'June',
  //     'July',
  //     'August',
  //     'September',
  //     'October',
  //     'November',
  //     'December',
  //   ];
  //
  //   return months.map((month) => {
  //     const remainingAmount = Math.floor(Math.random() * expectedAmount * 0.4);
  //     const receivedAmount = expectedAmount - remainingAmount;
  //
  //     return {
  //       month,
  //       receivedAmount,
  //       remainingAmount,
  //     };
  //   });
  // }
}
