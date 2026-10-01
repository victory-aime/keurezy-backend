import { HttpStatus, Injectable } from '@nestjs/common';
import { PlanFeaturePolicyService } from '../packs/plan-feature-policy.service';
import { PrismaService } from '../../database/prisma.service';
import { AgencyService } from '../agency/agency.service';
import { BuildingFilterDto, CreateBuildingDto, UpdateBuildingDto } from './building.dto';
import { convertToInteger } from '../../config/convert';
import { Prisma } from '../../../prisma/generated/client';
import { FeatureCommercial } from '../../config/enum';
import { HttpError } from '../../config/http.error';
import { BuildingImpact, computeImpact } from '../property/property-impact';
import { assertAssetActive } from '../packs/asset-activation';

@Injectable()
export class BuildingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agencyService: AgencyService,
    private readonly planFeaturePolicy: PlanFeaturePolicyService,
  ) {}

  async getAllBuildingByAgency(query: BuildingFilterDto, userId: string) {
    await this.agencyService.agencyAccessControl(query?.agencyId, userId);

    const pageInitial = convertToInteger(query?.initialPage) || 1;
    const limitPage = convertToInteger(query?.limitPerPage) || 10;

    const skip = (pageInitial - 1) * limitPage;

    const buildingFilterOptions = {
      ...{ agencyId: query?.agencyId },
      ...(query?.name && {
        name: {
          contains: query.name,
          mode: Prisma.QueryMode.insensitive,
        },
      }),
      ...(query.city && { city: query.city }),
      ...(query.status && { status: query.status }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.batiment.findMany({
        where: buildingFilterOptions,
        include: {
          properties: true,
          land: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limitPage,
      }),

      this.prisma.batiment.count({
        where: buildingFilterOptions,
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

  async createBuilding(data: CreateBuildingDto, userId: string): Promise<{ message: string }> {
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
        'Votre capacité maximale de bâtiment est atteinte.',
        HttpStatus.FORBIDDEN,
        'BUILDING_CAPACITY_REACHED',
      );
    }

    const uniqueName = await this.prisma.batiment.findUnique({
      where: { name_agencyId: { name: data?.name, agencyId: data?.agencyId } },
    });

    if (uniqueName) {
      throw new HttpError(
        'Un bâtiment avec ce titre existe déjà pour votre agence',
        HttpStatus.CONFLICT,
        'BATIMENT_ALREADY_EXISTS',
      );
    }

    await this.prisma.batiment.create({
      data: {
        ...data,
        landId: data.landId && data.landId !== '' ? data.landId : undefined,
      },
    });

    return {
      message: 'Bâtiment créé avec succès',
    };
  }

  async updateBuilding(data: UpdateBuildingDto, userId: string): Promise<{ message: string }> {
    await this.agencyService.agencyAccessControl(data.agencyId, userId);

    const building = await this.prisma.batiment.findUnique({
      where: { id: data.id },
    });

    if (!building || building.agencyId !== data.agencyId) {
      throw new HttpError('Aucun bâtiment trouvé', HttpStatus.NOT_FOUND, 'BUILDING_NOT_EXIST');
    }
    assertAssetActive(building);

    if (data.name && data.name !== building.name) {
      const existing = await this.prisma.batiment.findUnique({
        where: {
          name_agencyId: {
            name: data.name,
            agencyId: building.agencyId!,
          },
        },
      });

      if (existing) {
        throw new HttpError(
          'Un bâtiment avec ce nom existe déjà',
          HttpStatus.CONFLICT,
          'BUILDING_ALREADY_EXISTS',
        );
      }
    }

    if (data?.landId && data.landId !== building.landId) {
      const land = await this.prisma.land.findUnique({
        where: { id: data.landId },
      });

      if (!land || land.agencyId !== building.agencyId) {
        throw new HttpError('Terrain introuvable', HttpStatus.NOT_FOUND, 'LAND_NOT_FOUND');
      }
    }

    // 5. Clean payload
    const { id, agencyId, landId, ...values } = data;

    // 6. Update
    await this.prisma.batiment.update({
      where: { id },
      data: {
        ...values,
        agency: { connect: { id: agencyId } },
        ...(landId
          ? {
              land: {
                connect: { id: landId },
              },
            }
          : {
              land: {
                disconnect: true,
              },
            }),
      },
    });

    return {
      message: 'Bâtiment mis à jour avec succès',
    };
  }

  /**
   * Ce que la suppression du bâtiment entraîne : ses biens sont supprimés avec lui (cascade),
   * donc leur historique cumulé décide si c'est permis.
   */
  async getBuildingImpact(id: string, userId: string): Promise<BuildingImpact> {
    const building = await this.prisma.batiment.findUnique({
      where: { id },
      select: { agencyId: true },
    });
    if (!building?.agencyId) {
      throw new HttpError('Aucun bâtiment trouvé', HttpStatus.NOT_FOUND, 'BUILDING_NOT_EXIST');
    }
    await this.agencyService.agencyAccessControl(building.agencyId, userId);

    const [properties, history] = await Promise.all([
      this.prisma.property.findMany({
        where: { batimentId: id },
        select: { id: true, title: true },
        orderBy: { title: 'asc' },
      }),
      computeImpact(this.prisma, { property: { batimentId: id } }),
    ]);
    return { ...history, properties };
  }

  async deleteBuilding(id: string, userId: string) {
    const impact = await this.getBuildingImpact(id, userId);
    if (!impact.canDelete) {
      throw new HttpError(
        'Un bien de ce bâtiment a un historique (réservations, discussions ou visites) : il ne peut pas être supprimé.',
        HttpStatus.CONFLICT,
        'BUILDING_IN_USE',
      );
    }
    await this.prisma.batiment.delete({ where: { id } });
    return { message: 'Bâtiment supprimé avec succès.' };
  }
}
