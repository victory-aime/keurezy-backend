import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../../../prisma/generated/client';
import { PrismaService } from '../../database/prisma.service';
import { AgencyService } from '../agency/agency.service';
import { PlanFeaturePolicyService } from '../packs/plan-feature-policy.service';
import { CreateLandDto, LandFilterDto, UpdateLandDto } from './land.dto';
import { convertToInteger } from '../../config/convert';
import { FeatureCommercial } from '../../config/enum';
import { HttpError } from '../../config/http.error';
import { LandImpact } from '../property/property-impact';
import { assertAssetActive } from '../packs/asset-activation';

@Injectable()
export class LandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agencyService: AgencyService,
    private readonly planFeaturePolicy: PlanFeaturePolicyService,
  ) {}

  async getAllLandByAgency(query: LandFilterDto, userId: string) {
    await this.agencyService.agencyAccessControl(query?.agencyId, userId);

    const pageInitial = convertToInteger(query?.initialPage) || 1;
    const limitPage = convertToInteger(query?.limitPerPage) || 10;

    const skip = (pageInitial - 1) * limitPage;

    const landFilterOptions = {
      agencyId: query?.agencyId,
      ...(query?.title && {
        title: {
          contains: query.title,
          mode: Prisma.QueryMode.insensitive,
        },
      }),
      ...(query?.status && { status: query?.status }),
      ...(query?.city && { city: query?.city }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.land.findMany({
        where: landFilterOptions,
        include: { batiments: true },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limitPage,
      }),

      this.prisma.land.count({
        where: landFilterOptions,
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

  async createLand(data: CreateLandDto, userId: string): Promise<{ message: string }> {
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
        'LAND_CAPACITY_REACHED',
      );
    }

    const uniqueName = await this.prisma.land.findUnique({
      where: {
        title_agencyId: { title: data?.title, agencyId: data?.agencyId },
      },
    });

    if (uniqueName) {
      throw new HttpError(
        'Un Terrain avec ce titre existe déjà pour votre agence',
        HttpStatus.CONFLICT,
        'LAND_ALREADY_EXISTS',
      );
    }

    await this.prisma.land.create({ data });

    return {
      message: 'Terrain créée avec succès',
    };
  }

  async updateLand(data: UpdateLandDto, userId: string): Promise<{ message: string }> {
    await this.agencyService.agencyAccessControl(data.agencyId, userId);

    const { agencyId, ...safeValues } = data;

    const land = await this.prisma.land.findUnique({
      where: { id: data?.id },
    });

    if (!land || land.agencyId !== data.agencyId) {
      throw new HttpError('Terrain introuvable', HttpStatus.NOT_FOUND, 'LAND_NOT_FOUND');
    }
    assertAssetActive(land);

    if (data.title && data.title !== land.title) {
      const existing = await this.prisma.land.findUnique({
        where: {
          title_agencyId: {
            agencyId: land.agencyId!,
            title: data.title,
          },
        },
      });

      if (existing) {
        throw new HttpError(
          'Un terrain avec ce titre existe déjà',
          HttpStatus.CONFLICT,
          'LAND_ALREADY_EXISTS',
        );
      }
    }

    await this.prisma.land.update({
      where: { id: data?.id },
      data: {
        ...safeValues,
      },
    });

    return {
      message: 'Terrain créé avec succès',
    };
  }

  /** Bâtiments et villas portés par le terrain, affichés avant sa suppression. */
  async getLandImpact(id: string, userId: string): Promise<LandImpact> {
    const land = await this.prisma.land.findUnique({
      where: { id },
      select: {
        agencyId: true,
        batiments: { select: { id: true, name: true } },
        _count: { select: { villa: true } },
      },
    });
    if (!land) {
      throw new HttpError('Terrain introuvable', HttpStatus.NOT_FOUND, 'LAND_NOT_FOUND');
    }
    await this.agencyService.agencyAccessControl(land.agencyId, userId);
    return {
      batiments: land.batiments,
      villas: land._count.villa,
      canDelete: land.batiments.length === 0 && land._count.villa === 0,
    };
  }

  async deleteLand(id: string, userId: string) {
    // Même règle que l'impact affiché : bâtiments et villas partiraient en cascade
    const impact = await this.getLandImpact(id, userId);
    if (!impact.canDelete) {
      throw new HttpError(
        'Ce terrain porte des bâtiments ou des villas : supprimez-les d’abord.',
        HttpStatus.CONFLICT,
        'LAND_HAS_BUILDINGS',
      );
    }
    await this.prisma.land.delete({ where: { id } });
    return { message: 'Terrain supprimé avec succès.' };
  }
}
