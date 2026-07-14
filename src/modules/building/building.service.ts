import { HttpStatus, Injectable } from '@nestjs/common';
import { PlanFeaturePolicyService } from '../common/services/plan-feature-policy.service';
import { PrismaService } from '../../database/prisma.service';
import { AgencyService } from '../agency/agency.service';
import { BuildingFilterDto, CreateBuildingDto, UpdateBuildingDto } from './building.dto';
import { convertToInteger } from '../../config/convert';
import { Prisma } from '../../../prisma/generated/client';
import { FeatureCommercial } from '../../config/enum';
import { HttpError } from '../../config/http.error';

@Injectable()
export class BuildingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agencyService: AgencyService,
    private readonly planFeaturePolicy: PlanFeaturePolicyService,
  ) {}

  async getAllBuildingByAgency(query: BuildingFilterDto) {
    await this.agencyService.agencyAccessControl(query?.agencyId, query.userId);

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

  async createBuilding(data: CreateBuildingDto): Promise<{ message: string }> {
    await this.agencyService.agencyAccessControl(data.agencyId, data.userId);

    const context = await this.planFeaturePolicy.getAgencyFeatureContext(data.agencyId!);

    const currentProperties = await this.prisma.batiment.count({
      where: {
        agencyId: data.agencyId,
      },
    });

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

    const { userId, ...values } = data;

    await this.prisma.batiment.create({
      data: {
        ...values,
        landId: values.landId && values.landId !== '' ? values.landId : undefined,
      },
    });

    return {
      message: 'Bâtiment créé avec succès',
    };
  }

  async updateBuilding(data: UpdateBuildingDto): Promise<{ message: string }> {
    await this.agencyService.agencyAccessControl(data.agencyId, data.userId);

    const building = await this.prisma.batiment.findUnique({
      where: { id: data.id },
    });

    if (!building) {
      throw new HttpError('Aucun bâtiment trouvé', HttpStatus.NOT_FOUND, 'BUILDING_NOT_EXIST');
    }

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

      if (!land) {
        throw new HttpError('Terrain introuvable', HttpStatus.NOT_FOUND, 'LAND_NOT_FOUND');
      }
    }

    // 5. Clean payload
    const { id, agencyId, userId, landId, ...values } = data;

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

  async deleteBuilding(id: string, agencyId: string, userId: string) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    await this.prisma.batiment.delete({
      where: { id },
    });
  }
}
