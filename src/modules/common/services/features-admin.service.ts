import { HttpStatus, Injectable } from '@nestjs/common';
import { FeatureCategory } from '../../../../prisma/generated/enums';
import { PrismaService } from '../../../database/prisma.service';
import { HttpError } from '../../../config/http.error';

@Injectable()
export class FeaturesAdminService {
  constructor(private readonly prismaService: PrismaService) {}

  // ─────────────────────────────────────────
  // 1. Liste toutes les features avec leurs permissions
  // ─────────────────────────────────────────
  async getAllFeatures(category?: FeatureCategory) {
    const where = category ? { category } : {};

    try {
      const features = await this.prismaService.feature.findMany({
        where,
        include: {
          permissions: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
          _count: {
            select: {
              planFeatures: true,
              permissions: true,
            },
          },
        },
        orderBy: { category: 'asc' },
      });

      return features.map((feature) => ({
        id: feature.id,
        name: feature.name,
        description: feature.description,
        category: feature.category,
        isCommercial: feature.isCommercial,
        permissions: feature.permissions,
        planCount: feature._count.planFeatures,
        permissionCount: feature._count.permissions,
      }));
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        'Une erreur est survenue lors de la récupération des fonctionnalités.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─────────────────────────────────────────
  // 2. Détail d'une feature par ID
  // ─────────────────────────────────────────
  async getFeatureById(featureId: string) {
    const feature = await this.prismaService.feature.findUnique({
      where: { id: featureId },
      include: {
        permissions: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        planFeatures: {
          include: {
            plan: {
              select: {
                id: true,
                name: true,
                pricingType: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!feature) {
      throw new HttpError(`Fonctionnalité introuvable`, HttpStatus.NOT_FOUND, 'FEATURE_NOT_FOUND');
    }

    return {
      id: feature.id,
      name: feature.name,
      description: feature.description,
      category: feature.category,
      isCommercial: feature.isCommercial,
      permissions: feature.permissions,
      plans: feature.planFeatures.map((pf) => ({
        id: pf.plan.id,
        name: pf.plan.name,
        pricingType: pf.plan.pricingType,
        isActive: pf.plan.isActive,
        enabled: pf.enabled,
        limit: pf.limit,
      })),
    };
  }
}
