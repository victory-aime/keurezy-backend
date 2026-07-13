import { prisma } from './client';
import {
  Plan,
  FeatureCategory,
  PricingType,
  BillingCycle,
  PlanCategory,
} from '../generated/client';

async function seed() {
  console.log('🌱 Seeding Features, Permissions & Plans...');

  const featuresWithPermissions = [
    // ─────────────────────────────────────────
    // PROPERTIES (biens)
    // ─────────────────────────────────────────
    {
      name: 'manage_properties',
      category: FeatureCategory.PROPERTIES,
      isCommercial: true,
      permissions: [
        { name: 'view_properties', description: 'Voir les propriétés' },
        { name: 'create_property', description: 'Créer une propriété' },
        { name: 'update_property', description: 'Modifier une propriété' },
        { name: 'delete_property', description: 'Supprimer une propriété' },
      ],
    },
    {
      name: 'manage_property_types',
      category: FeatureCategory.PROPERTY_TYPES,
      permissions: [
        { name: 'manage_land', description: 'Gérer les terrains' },
        { name: 'manage_batiment', description: 'Gérer les bâtiments' },
        { name: 'manage_villa', description: 'Gérer les villas' },
      ],
    },

    // ─────────────────────────────────────────
    // ANNONCES
    // ─────────────────────────────────────────
    {
      name: 'publish_properties',
      category: FeatureCategory.ANNONCES,
      isCommercial: true,
      permissions: [
        { name: 'publish_property', description: 'Publier une propriété' },
        { name: 'publish_land', description: 'Publier un terrain' },
        { name: 'unpublish_property', description: 'Dépublier une propriété' },
      ],
    },
    {
      name: 'boost_annonces',
      category: FeatureCategory.BOOST_ANNOUNCES,
      isCommercial: true,
      permissions: [
        { name: 'boost_property', description: 'Booster une annonce' },
        { name: 'highlight_property', description: 'Mettre en avant une annonce' },
      ],
    },
    {
      name: 'annonce_stats',
      category: FeatureCategory.ANNONCES,
      permissions: [{ name: 'view_annonce_stats', description: 'Voir les stats des annonces' }],
    },

    // ─────────────────────────────────────────
    // LEADS
    // ─────────────────────────────────────────
    {
      name: 'manage_leads',
      category: FeatureCategory.LEADS,
      isCommercial: false,
      permissions: [
        { name: 'view_leads', description: 'Voir les leads' },
        { name: 'create_lead', description: 'Créer un lead' },
        { name: 'update_lead', description: 'Modifier un lead' },
        { name: 'delete_lead', description: 'Supprimer un lead' },
        { name: 'assign_lead', description: 'Assigner un lead' },
      ],
    },

    // ─────────────────────────────────────────
    // USERS / STAFF
    // ─────────────────────────────────────────
    {
      name: 'manage_users',
      category: FeatureCategory.USERS,
      isCommercial: true,
      permissions: [
        { name: 'view_users', description: 'Voir les collaborateurs' },
        { name: 'invite_users', description: 'Inviter un collaborateur' },
        { name: 'update_users', description: 'Modifier un collaborateur' },
        { name: 'delete_users', description: 'Supprimer un collaborateur' },
      ],
    },
    {
      name: 'manage_roles_permissions',
      category: FeatureCategory.ROLES_PERMISSIONS,
      permissions: [
        { name: 'assign_permissions', description: 'Attribuer des permissions' },
        { name: 'revoke_permissions', description: 'Retirer des permissions' },
      ],
    },

    // ─────────────────────────────────────────
    // VISITS
    // ─────────────────────────────────────────
    {
      name: 'manage_visits',
      category: FeatureCategory.VISITS,
      permissions: [
        { name: 'schedule_visit', description: 'Planifier une visite' },
        { name: 'update_visit', description: 'Modifier une visite' },
        { name: 'cancel_visit', description: 'Annuler une visite' },
        { name: 'view_visits', description: 'Voir les visites' },
      ],
    },

    // ─────────────────────────────────────────
    // CONTRACTS
    // ─────────────────────────────────────────
    {
      name: 'manage_contracts',
      category: FeatureCategory.CONTRACTS,
      permissions: [
        { name: 'create_contract', description: 'Créer un contrat' },
        { name: 'view_contracts', description: 'Voir les contrats' },
        { name: 'update_contract', description: 'Modifier un contrat' },
        { name: 'delete_contract', description: 'Supprimer un contrat' },
      ],
    },

    // ─────────────────────────────────────────
    // ACCOUNTING
    // ─────────────────────────────────────────
    {
      name: 'manage_accounting',
      category: FeatureCategory.ACCOUNTING,
      permissions: [
        { name: 'view_accounting', description: 'Voir la comptabilité' },
        { name: 'create_transaction', description: 'Créer une transaction' },
        { name: 'update_transaction', description: 'Modifier une transaction' },
        { name: 'delete_transaction', description: 'Supprimer une transaction' },
      ],
    },

    // ─────────────────────────────────────────
    // REPORTS
    // ─────────────────────────────────────────
    {
      name: 'view_reports',
      category: FeatureCategory.REPORTS,
      permissions: [
        { name: 'view_reports', description: 'Voir les rapports' },
        { name: 'export_reports', description: 'Exporter les rapports' },
      ],
    },

    // ─────────────────────────────────────────
    // SUBSCRIPTION / BILLING
    // ─────────────────────────────────────────
    {
      name: 'manage_subscription',
      category: FeatureCategory.SUBSCRIPTIONS,
      permissions: [
        { name: 'view_subscription', description: 'Voir abonnement' },
        { name: 'change_plan', description: 'Changer de plan' },
        { name: 'cancel_subscription', description: 'Annuler abonnement' },
      ],
    },

    // ─────────────────────────────────────────
    // NOTIFICATIONS
    // ─────────────────────────────────────────
    {
      name: 'manage_notifications',
      category: FeatureCategory.NOTIFICATIONS,
      permissions: [
        { name: 'view_notifications', description: 'Voir notifications' },
        { name: 'mark_notifications', description: 'Marquer comme lu' },
      ],
    },

    // ─────────────────────────────────────────
    // TICKETS
    // ─────────────────────────────────────────
    {
      name: 'manage_tickets',
      category: FeatureCategory.TICKETS,
      permissions: [
        { name: 'create_ticket', description: 'Créer un ticket support' },
        { name: 'view_tickets', description: 'Voir les tickets' },
        { name: 'close_ticket', description: 'Fermer un ticket' },
      ],
    },

    {
      name: 'premium_support',
      category: FeatureCategory.SUPPORT,
      isCommercial: true,
      permissions: [{ name: 'priority_support', description: 'Support prioritaire' }],
    },

    // ─────────────────────────────────────────
    // INVITATIONS
    // ─────────────────────────────────────────
    {
      name: 'manage_invitations',
      category: FeatureCategory.USERS,
      permissions: [
        { name: 'send_invitation', description: 'Envoyer une invitation' },
        { name: 'resend_invitation', description: 'Renvoyer une invitation' },
        { name: 'cancel_invitation', description: 'Annuler une invitation' },
      ],
    },
  ];

  for (const { permissions, ...featureData } of featuresWithPermissions) {
    const feature = await prisma.feature.upsert({
      where: { name: featureData.name },
      update: { category: featureData.category, isCommercial: featureData.isCommercial },
      create: { ...featureData },
    });

    await prisma.permission.createMany({
      data: permissions.map((p) => ({
        ...p,
        featureId: feature.id,
      })),
      skipDuplicates: true,
    });
  }

  console.log('✅ Features & Permissions créées');

  // ─────────────────────────────────────────
  // 2. PLANS
  // RULES IMPORTANTES :
  // - COMMISSION => PAS DE PRICING TABLE
  // - SUBSCRIPTION => PRICING + DISCOUNT ICI UNIQUEMENT
  // - FEATURES TOUJOURS APPLIQUÉES
  // ─────────────────────────────────────────

  const allFeatures = await prisma.feature.findMany();
  const getFeatureId = (name: string) => allFeatures.find((f) => f.name === name)?.id!;

  const feature = (name: string, limit: number | null = null) => ({
    featureId: getFeatureId(name),
    enabled: true,
    limit,
  });

  await prisma.$transaction(async (tx) => {
    // =========================================================
    // 💰 COMMISSION PLANS (3)
    // =========================================================

    // BASIC COMMISSION
    await tx.subscriptionPlan.upsert({
      where: { name: Plan.BASIC_COMMISSION },
      update: {
        pricingType: PricingType.COMMISSION,
        commissionRate: 8,
        planCategory: PlanCategory.COMMISSION_BASED,
        planFeatures: {
          deleteMany: {},
          create: [
            feature('manage_properties', 6),
            feature('publish_properties', 6),
            feature('manage_users', 1),
            feature('premium_support', 1),
          ],
        },
      },
      create: {
        name: Plan.BASIC_COMMISSION,
        pricingType: PricingType.COMMISSION,
        commissionRate: 8,
        planCategory: PlanCategory.COMMISSION_BASED,
        isActive: true,
      },
    });

    // STANDARD COMMISSION
    await tx.subscriptionPlan.upsert({
      where: { name: Plan.STANDARD_COMMISSION },
      update: {
        pricingType: PricingType.COMMISSION,
        commissionRate: 12,
        planCategory: PlanCategory.COMMISSION_BASED,

        planFeatures: {
          deleteMany: {},
          create: [
            feature('manage_properties', 20),
            feature('publish_properties', 20),
            feature('boost_annonces', 3),
            feature('annonce_stats'),
            feature('manage_leads'),
            feature('manage_users', 5),
            feature('view_reports'),
            feature('premium_support', 5),
          ],
        },
      },
      create: {
        name: Plan.STANDARD_COMMISSION,
        pricingType: PricingType.COMMISSION,
        commissionRate: 12,
        planCategory: PlanCategory.COMMISSION_BASED,
        isActive: true,
      },
    });

    // PREMIUM COMMISSION
    await tx.subscriptionPlan.upsert({
      where: { name: Plan.PREMIUM_COMMISSION },
      update: {
        pricingType: PricingType.COMMISSION,
        commissionRate: 15,
        planCategory: PlanCategory.COMMISSION_BASED,
        planFeatures: {
          deleteMany: {},
          create: [
            feature('manage_properties'),
            feature('publish_properties'),
            feature('boost_annonces'),
            feature('annonce_stats'),
            feature('manage_leads'),
            feature('manage_users'),
            feature('manage_accounting'),
            feature('view_reports'),
            feature('premium_support'),
          ],
        },
      },
      create: {
        name: Plan.PREMIUM_COMMISSION,
        pricingType: PricingType.COMMISSION,
        commissionRate: 15,
        planCategory: PlanCategory.COMMISSION_BASED,
        isActive: true,
      },
    });

    // =========================================================
    // 💳 SUBSCRIPTION PLANS (3)
    // 👉 AVEC PRICING + RÉDUCTION ICI UNIQUEMENT
    // =========================================================

    // BASIC SUB
    await tx.subscriptionPlan.upsert({
      where: { name: Plan.BASIC_SUB },
      update: {
        pricingType: PricingType.SUBSCRIPTION,
        planCategory: PlanCategory.SUBSCRIPTION_BASED,
        commissionRate: 0,
        planFeatures: {
          deleteMany: {},
          create: [
            feature('manage_properties', 6),
            feature('publish_properties', 6),
            feature('manage_users', 1),
            feature('premium_support', 1),
          ],
        },
        pricings: {
          deleteMany: {},
          create: [
            {
              billingCycle: BillingCycle.MONTHLY,
              price: 5000,
              currency: 'XOF',
            },
            {
              billingCycle: BillingCycle.YEARLY,
              price: 50000,
              currency: 'XOF',
              discountPercentage: 16,
            },
          ],
        },
      },
      create: {
        name: Plan.BASIC_SUB,
        pricingType: PricingType.SUBSCRIPTION,
        planCategory: PlanCategory.SUBSCRIPTION_BASED,
        commissionRate: 0,
        isActive: true,
      },
    });

    // STANDARD SUB
    await tx.subscriptionPlan.upsert({
      where: { name: Plan.STANDARD_SUB },
      update: {
        pricingType: PricingType.SUBSCRIPTION,
        planCategory: PlanCategory.SUBSCRIPTION_BASED,
        pricings: {
          deleteMany: {},
          create: [
            {
              billingCycle: BillingCycle.MONTHLY,
              price: 10000,
              currency: 'XOF',
            },
            {
              billingCycle: BillingCycle.YEARLY,
              price: 100000,
              currency: 'XOF',
              discountPercentage: 16,
            },
          ],
        },
        planFeatures: {
          deleteMany: {},
          create: [
            feature('manage_properties', 20),
            feature('publish_properties', 20),
            feature('boost_annonces', 3),
            feature('annonce_stats'),
            feature('manage_leads'),
            feature('manage_users', 5),
            feature('view_reports'),
            feature('premium_support', 5),
          ],
        },
      },
      create: {
        name: Plan.STANDARD_SUB,
        pricingType: PricingType.SUBSCRIPTION,
        planCategory: PlanCategory.SUBSCRIPTION_BASED,
        commissionRate: 0,
        isActive: true,
      },
    });

    // PREMIUM SUB
    await tx.subscriptionPlan.upsert({
      where: { name: Plan.PREMIUM_SUB },
      update: {
        pricingType: PricingType.SUBSCRIPTION,
        planCategory: PlanCategory.SUBSCRIPTION_BASED,
        pricings: {
          deleteMany: {},
          create: [
            {
              billingCycle: BillingCycle.MONTHLY,
              price: 18000,
              currency: 'XOF',
            },
            {
              billingCycle: BillingCycle.YEARLY,
              price: 180000,
              currency: 'XOF',
              discountPercentage: 16,
            },
          ],
        },
        planFeatures: {
          deleteMany: {},
          create: [
            feature('manage_properties'),
            feature('publish_properties'),
            feature('boost_annonces'),
            feature('annonce_stats'),
            feature('manage_leads'),
            feature('manage_users'),
            feature('manage_accounting'),
            feature('view_reports'),
            feature('premium_support'),
          ],
        },
      },
      create: {
        name: Plan.PREMIUM_SUB,
        pricingType: PricingType.SUBSCRIPTION,
        planCategory: PlanCategory.SUBSCRIPTION_BASED,
        commissionRate: 0,
        isActive: true,
      },
    });
  });

  console.log('🚀 Seed terminé proprement');
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
