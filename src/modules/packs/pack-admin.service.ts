import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '_root/database/prisma.service';
import { HttpError } from '_root/config/http.error';
import { Decimal } from '../../../prisma/generated/internal/prismaNamespace';
import { CreatePlanInput, UpdatePlanInput } from './pack.dto';

@Injectable()
export class PackAdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────
  // 1. Liste tous les plans avec features et limites
  // ─────────────────────────────────────────
  async getAllPlans() {
    try {
      return await this.prisma.subscriptionPlan.findMany({
        where: { planCategory: 'SUBSCRIPTION_BASED' },
        include: {
          planFeatures: {
            include: { feature: true },
          },
          pricings: true,
          _count: {
            select: { subscriptions: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        'Une erreur est survenue lors de la récupération des plans.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─────────────────────────────────────────
  // 2. Détail d'un plan par ID
  // ─────────────────────────────────────────
  async getPlanById(planId: string): Promise<any> {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      include: {
        planFeatures: {
          include: { feature: true },
        },
        pricings: true,
        _count: {
          select: { subscriptions: true },
        },
      },
    });

    if (!plan) {
      throw new HttpError(`Plan introuvable`, HttpStatus.NOT_FOUND, 'PLAN_NOT_FOUND');
    }

    return plan;
  }

  // ─────────────────────────────────────────
  // 3. Créer un plan
  // ─────────────────────────────────────────
  async createPlan(data: CreatePlanInput): Promise<any> {
    const existing = await this.prisma.subscriptionPlan.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw new HttpError(
        `Le plan ${data.name} existe déjà.`,
        HttpStatus.BAD_REQUEST,
        'PLAN_ALREADY_EXISTS',
      );
    }

    const featureIds = data.features.map((f) => f.featureId);
    const foundFeatures = await this.prisma.feature.findMany({
      where: { id: { in: featureIds } },
      select: { id: true },
    });

    if (foundFeatures.length !== featureIds.length) {
      const missing = featureIds.filter((id) => !foundFeatures.some((f) => f.id === id));
      throw new HttpError(
        `Features introuvables : ${missing.join(', ')}`,
        HttpStatus.BAD_REQUEST,
        'FEATURES_NOT_FOUND',
      );
    }

    try {
      return await this.prisma.subscriptionPlan.create({
        data: {
          name: data.name,
          commissionRate: new Decimal(data.commissionRate),
          isActive: data.isActive ?? false,
          planFeatures: {
            create: data.features.map((f) => ({
              featureId: f.featureId,
              enabled: f.enabled,
              limit: f.limit ?? null,
            })),
          },
        },
        include: {
          planFeatures: {
            include: { feature: true },
          },
        },
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        'Une erreur est survenue lors de la création du plan.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─────────────────────────────────────────
  // 4. Mettre à jour un plan + ses features/limites
  // ─────────────────────────────────────────
  async updatePlan(planId: string, data: UpdatePlanInput): Promise<any> {
    const existing = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      include: { planFeatures: true },
    });

    if (!existing) {
      throw new HttpError(`Plan introuvable`, HttpStatus.NOT_FOUND, 'PLAN_NOT_FOUND');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.subscriptionPlan.update({
          where: { id: planId },
          data: {
            ...(data.commissionRate !== undefined && {
              commissionRate: new Decimal(data.commissionRate),
            }),
            ...(data.isActive !== undefined && { isActive: data.isActive }),
          },
        });

        if (data.features && data.features.length > 0) {
          const featureIds = data.features.map((f) => f.featureId);
          const foundFeatures = await tx.feature.findMany({
            where: { id: { in: featureIds } },
            select: { id: true },
          });

          if (foundFeatures.length !== featureIds.length) {
            const missing = featureIds.filter((id) => !foundFeatures.some((f) => f.id === id));
            throw new HttpError(
              `Features introuvables : ${missing.join(', ')}`,
              HttpStatus.BAD_REQUEST,
              'FEATURES_NOT_FOUND',
            );
          }

          await Promise.all(
            data.features.map((f) =>
              tx.planFeature.upsert({
                where: {
                  planId_featureId: { planId, featureId: f.featureId },
                },
                update: {
                  enabled: f.enabled,
                  limit: f.limit ?? null,
                },
                create: {
                  planId,
                  featureId: f.featureId,
                  enabled: f.enabled,
                  limit: f.limit ?? null,
                },
              }),
            ),
          );
        }

        return tx.subscriptionPlan.findUnique({
          where: { id: planId },
          include: {
            planFeatures: {
              include: { feature: true },
            },
          },
        });
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        'Une erreur est survenue lors de la mise à jour du plan.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─────────────────────────────────────────
  // 5. Activer / Désactiver un plan
  // ─────────────────────────────────────────
  async togglePlanStatus(planId: string, isActive: boolean): Promise<{ message: string }> {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new HttpError(`Plan introuvable`, HttpStatus.NOT_FOUND, 'PLAN_NOT_FOUND');
    }

    try {
      await this.prisma.subscriptionPlan.update({
        where: { id: planId },
        data: { isActive },
      });

      return {
        message: `Le plan a été ${isActive ? 'activé' : 'désactivé'} avec succès.`,
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        'Une erreur est survenue lors de la mise à jour du statut du plan.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─────────────────────────────────────────
  // 6. Supprimer un plan
  // ─────────────────────────────────────────
  async deletePlan(planId: string): Promise<{ message: string }> {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      include: {
        _count: { select: { subscriptions: true } },
      },
    });

    if (!plan) {
      throw new HttpError(`Plan introuvable`, HttpStatus.NOT_FOUND, 'PLAN_NOT_FOUND');
    }

    // Sécurité — on ne supprime pas un plan qui a des agences abonnées
    if (plan._count.subscriptions > 0) {
      throw new HttpError(
        `Impossible de supprimer ce plan : ${plan._count.subscriptions} agence(s) y sont abonnées.`,
        HttpStatus.BAD_REQUEST,
        'PLAN_HAS_SUBSCRIPTIONS',
      );
    }

    try {
      await this.prisma.subscriptionPlan.delete({
        where: { id: planId },
      });

      return { message: `Le plan a été supprimé avec succès.` };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        'Une erreur est survenue lors de la suppression du plan.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
