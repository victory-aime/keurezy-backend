import { prisma } from './client';
import { Plan, FeatureCategory, BillingCycle } from '../generated/enums';

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
    // MESSAGERIE (chat client ↔ agence)
    // ─────────────────────────────────────────
    {
      name: 'manage_conversations',
      category: FeatureCategory.MESSAGING,
      isCommercial: false,
      permissions: [
        { name: 'view_conversations', description: 'Voir les discussions avec les clients' },
        { name: 'reply_conversations', description: 'Répondre aux clients' },
      ],
    },

    // ─────────────────────────────────────────
    // RÉSERVATIONS (traitement des demandes des clients)
    // ─────────────────────────────────────────
    {
      name: 'manage_bookings',
      category: FeatureCategory.BOOKINGS,
      isCommercial: false,
      permissions: [
        { name: 'view_bookings', description: 'Voir les réservations de l’agence' },
        { name: 'manage_bookings', description: 'Confirmer, refuser ou annuler une réservation' },
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
    // FACTURATION AUX CLIENTS (quotas : factures émises par mois, modèles de l'agence)
    // ─────────────────────────────────────────
    {
      name: 'manage_invoices',
      category: FeatureCategory.INVOICING,
      isCommercial: true,
      permissions: [
        { name: 'view_invoices', description: 'Voir les factures et les modèles de facture' },
        {
          name: 'manage_invoices',
          description: 'Créer, émettre, marquer payées et annuler les factures',
        },
      ],
    },
    {
      // Les modèles se gèrent par le propriétaire seul : quota sans permission propre
      name: 'invoice_templates',
      category: FeatureCategory.INVOICING,
      isCommercial: true,
      permissions: [],
    },

    // ─────────────────────────────────────────
    // AGENCE
    // ─────────────────────────────────────────
    {
      name: 'manage_agency',
      category: FeatureCategory.AGENCY,
      isCommercial: false,
      permissions: [
        {
          name: 'update_agency',
          description: 'Modifier le profil de l’agence (nom, logo, description, coordonnées)',
        },
      ],
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

  // Fonctionnalités sans quota présentes dans tous les plans : leurs permissions doivent pouvoir
  // être attribuées au staff (une permission n'est attribuable que si son plan l'inclut)
  const everyPlan = () => [
    feature('manage_conversations'),
    feature('manage_bookings'),
    feature('manage_visits'),
    feature('manage_invitations'),
    feature('manage_property_types'),
    feature('manage_agency'),
  ];

  await prisma.$transaction(async (tx) => {
    // =========================================================
    // 💳 SUBSCRIPTION PLANS (3)
    // 👉 AVEC PRICING + RÉDUCTION ICI UNIQUEMENT
    // =========================================================

    // FREE SUB : entrée de gamme, sans cycle ni échéance (prix 0 sur les deux cycles pour que le
    // devis le classe sous les autres plans)
    const freePricings = [
      { billingCycle: BillingCycle.MONTHLY, price: 0, currency: 'XOF' },
      { billingCycle: BillingCycle.YEARLY, price: 0, currency: 'XOF' },
    ];
    const freeFeatures = [
      feature('manage_properties', 2),
      feature('publish_properties', 2),
      feature('manage_users', 0),
      feature('manage_invoices', 5),
      feature('invoice_templates', 0),
      ...everyPlan(),
    ];
    await tx.subscriptionPlan.upsert({
      where: { name: Plan.FREE_SUB },
      update: {
        pricings: { deleteMany: {}, create: freePricings },
        planFeatures: { deleteMany: {}, create: freeFeatures },
      },
      create: {
        name: Plan.FREE_SUB,
        isActive: true,
        pricings: { create: freePricings },
        planFeatures: { create: freeFeatures },
      },
    });

    // BASIC SUB
    await tx.subscriptionPlan.upsert({
      where: { name: Plan.BASIC_SUB },
      update: {
        planFeatures: {
          deleteMany: {},
          create: [
            feature('manage_properties', 6),
            feature('publish_properties', 6),
            feature('manage_users', 1),
            feature('premium_support', 1),
            feature('manage_invoices', 30),
            feature('invoice_templates', 1),
            ...everyPlan(),
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
        isActive: true,
      },
    });

    // STANDARD SUB
    await tx.subscriptionPlan.upsert({
      where: { name: Plan.STANDARD_SUB },
      update: {
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
            feature('manage_users', 5),
            feature('view_reports'),
            feature('premium_support', 5),
            feature('manage_invoices', 150),
            feature('invoice_templates', 3),
            ...everyPlan(),
          ],
        },
      },
      create: {
        name: Plan.STANDARD_SUB,
        isActive: true,
      },
    });

    // PREMIUM SUB
    await tx.subscriptionPlan.upsert({
      where: { name: Plan.PREMIUM_SUB },
      update: {
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
            feature('manage_users'),
            feature('manage_accounting'),
            feature('view_reports'),
            feature('premium_support'),
            feature('manage_invoices'),
            feature('invoice_templates'),
            ...everyPlan(),
          ],
        },
      },
      create: {
        name: Plan.PREMIUM_SUB,
        isActive: true,
      },
    });
  });

  console.log('🚀 Seed terminé proprement');
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
