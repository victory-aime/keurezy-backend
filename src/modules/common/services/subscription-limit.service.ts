import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '_root/database/prisma.service';

@Injectable()
export class SubscriptionLimitService {
  constructor(private readonly prisma: PrismaService) {}

  // RECUPERER LE PLAN ACTIF DE L'AGENCE

  private async getActivePlan(agencyId: string) {
    return this.prisma.subscription.findUnique({
      where: { agencyId },
      include: {
        plan: {
          include: {
            planFeatures: {
              include: { feature: true },
            },
          },
        },
      },
    });
  }

  // RECUPERER LA LIMITE D'UNE FEATURE DANS LE PLAN

  private getLimitForFeature(subscription: any, featureName: string): number | null {
    const planFeature = subscription.plan.planFeatures.find(
      (pf: any) => pf.feature.name === featureName,
    );

    if (!planFeature || !planFeature.enabled) return 0; // feature non incluse dans le plan
    return planFeature.limit; // null = illimité
  }

  // VERIFIER LA LIMITE DES PROPRIETES

  async checkPropertyLimit(agencyId: string) {
    const subscription = await this.getActivePlan(agencyId);

    if (!subscription) {
      throw new ForbiddenException(
        "Votre agence n'a pas de plan actif. Veuillez souscrire a un plan pour continuer.",
      );
    }

    const limit = this.getLimitForFeature(subscription, 'manage_properties');

    // null = illimite
    if (limit === null) return;

    const currentCount = await this.prisma.property.count({ where: { agencyId } });

    if (currentCount >= limit) {
      const nextPlan = await this.getNextPlan(subscription.plan.name);
      throw new ForbiddenException({
        message: `Vous avez atteint la limite de ${limit} propriete(s) de votre plan "${subscription.plan.name}".`,
        suggestion: nextPlan
          ? `Passez au plan "${nextPlan}" pour avoir plus de proprietes.`
          : 'Vous etes deja sur le plan maximum.',
        currentUsage: currentCount,
        limit,
      });
    }
  }

  // VERIFIER LA LIMITE DES ANNONCES

  async checkAnnonceLimit(agencyId: string) {
    const subscription = await this.getActivePlan(agencyId);

    if (!subscription) {
      throw new ForbiddenException(
        "Votre agence n'a pas de plan actif. Veuillez souscrire a un plan pour continuer.",
      );
    }

    const limit = this.getLimitForFeature(subscription, 'manage_annonces');

    if (limit === null) return;

    const currentCount = await this.prisma.annonce.count({ where: { property: { agencyId } } });

    if (currentCount >= limit) {
      const nextPlan = await this.getNextPlan(subscription.plan.name);
      throw new ForbiddenException({
        message: `Vous avez atteint la limite de ${limit} annonce(s) de votre plan "${subscription.plan.name}".`,
        suggestion: nextPlan
          ? `Passez au plan "${nextPlan}" pour publier plus d'annonces.`
          : 'Vous etes deja sur le plan maximum.',
        currentUsage: currentCount,
        limit,
      });
    }
  }

  // VERIFIER LA LIMITE DU STAFF

  async checkStaffLimit(agencyId: string) {
    const subscription = await this.getActivePlan(agencyId);

    if (!subscription) {
      throw new ForbiddenException(
        "Votre agence n'a pas de plan actif. Veuillez souscrire a un plan pour continuer.",
      );
    }

    const limit = this.getLimitForFeature(subscription, 'manage_users');

    if (limit === null) return;

    const currentCount = await this.prisma.staff.count({
      where: { agencyId, isActive: true },
    });

    if (currentCount >= limit) {
      const nextPlan = await this.getNextPlan(subscription.plan.name);
      throw new ForbiddenException({
        message: `Vous avez atteint la limite de ${limit} membre(s) de votre plan "${subscription.plan.name}".`,
        suggestion: nextPlan
          ? `Passez au plan "${nextPlan}" pour ajouter plus de membres.`
          : 'Vous etes deja sur le plan maximum.',
        currentUsage: currentCount,
        limit,
      });
    }
  }

  // VERIFIER TOUTES LES LIMITES D'UNE AGENCE (pour affichage dashboard)

  async getUsageSummary(agencyId: string) {
    const subscription = await this.getActivePlan(agencyId);

    if (!subscription) {
      return { error: 'Aucun plan actif trouve pour cette agence.' };
    }

    const [propertyCount, annonceCount, staffCount] = await Promise.all([
      this.prisma.property.count({ where: { agencyId } }),
      this.prisma.annonce.count({ where: { property: { agencyId } } }),
      this.prisma.staff.count({ where: { agencyId, isActive: true } }),
    ]);

    const propertyLimit = this.getLimitForFeature(subscription, 'manage_properties');
    const annonceLimit = this.getLimitForFeature(subscription, 'manage_annonces');
    const staffLimit = this.getLimitForFeature(subscription, 'manage_users');

    return {
      plan: subscription.plan.name,
      usage: {
        properties: {
          current: propertyCount,
          limit: propertyLimit ?? 'illimite',
          reached: propertyLimit !== null && propertyCount >= propertyLimit,
        },
        annonces: {
          current: annonceCount,
          limit: annonceLimit ?? 'illimite',
          reached: annonceLimit !== null && annonceCount >= annonceLimit,
        },
        staff: {
          current: staffCount,
          limit: staffLimit ?? 'illimite',
          reached: staffLimit !== null && staffCount >= staffLimit,
        },
      },
    };
  }

  // RECUPERER LE PLAN SUPERIEUR

  private async getNextPlan(currentPlanName: string): Promise<string | null> {
    // Ordre des plans COMMISSION
    const commissionOrder = ['BASIC_COMMISSION', 'STANDARD_COMMISSION', 'PREMIUM_COMMISSION'];

    // Ordre des plans SUBSCRIPTION
    const subscriptionOrder = ['BASIC_SUB', 'STANDARD_SUB', 'PREMIUM_SUB'];

    const allOrders = [...commissionOrder, ...subscriptionOrder];
    const currentIndex = allOrders.indexOf(currentPlanName);

    if (currentIndex === -1 || currentIndex === allOrders.length - 1) return null;

    // Chercher le prochain plan dans la meme categorie
    const isCommission = commissionOrder.includes(currentPlanName);
    const order = isCommission ? commissionOrder : subscriptionOrder;
    const indexInOrder = order.indexOf(currentPlanName);

    if (indexInOrder === order.length - 1) return null;

    return order[indexInOrder + 1];
  }
}
