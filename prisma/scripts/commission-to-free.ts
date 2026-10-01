import { prisma } from '../seed/client';
import {
  AnnonceStatus,
  InvitationStatus,
  Plan,
  PlanCategory,
  SubscriptionStatus,
} from '../generated/enums';

/**
 * Fin du modèle à la commission (décisions du 2026-10-01), à lancer après la migration
 * `16_free_plan` et le seed du plan Gratuit, avant la migration `17` qui retire la commission.
 *
 * Chaque agence encore sur un plan commission passe au plan Gratuit (sans échéance). Ce qui
 * dépasse ses limites est désactivé, jamais supprimé : les éléments **les plus anciens** restent
 * actifs. Puis les plans commission, devenus inutilisés, sont supprimés.
 *
 * Aperçu par défaut ; `--apply` pour écrire. Idempotent (une agence passée au Gratuit n'est plus
 * sur un plan commission).
 */
const FEATURES = {
  properties: 'manage_properties',
  annonces: 'publish_properties',
  users: 'manage_users',
};

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Identifiants au-delà des `limit` plus anciens (null = illimité, rien à couper). */
const beyond = <T extends { id: string; createdAt: Date }>(items: T[], limit: number | null) =>
  limit === null
    ? []
    : [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).slice(limit);

async function moveToFree(
  tx: Tx,
  agencyId: string,
  freePlanId: string,
  limits: Map<string, number | null>,
) {
  const limitOf = (feature: string) => (limits.has(feature) ? limits.get(feature)! : 0);
  const active = { agencyId, isActive: true };
  const select = { id: true, createdAt: true };

  // Biens : propriétés, terrains et bâtiments partagent une seule limite
  const [properties, lands, buildings] = await Promise.all([
    tx.property.findMany({ where: active, select }),
    tx.land.findMany({ where: active, select }),
    tx.batiment.findMany({ where: active, select }),
  ]);
  const cutAssets = beyond(
    [
      ...properties.map((p) => ({ ...p, model: 'property' as const })),
      ...lands.map((l) => ({ ...l, model: 'land' as const })),
      ...buildings.map((b) => ({ ...b, model: 'batiment' as const })),
    ],
    limitOf(FEATURES.properties),
  );
  const idsOf = (model: string) => cutAssets.filter((a) => a.model === model).map((a) => a.id);
  await tx.property.updateMany({
    where: { id: { in: idsOf('property') } },
    data: { isActive: false },
  });
  await tx.land.updateMany({ where: { id: { in: idsOf('land') } }, data: { isActive: false } });
  await tx.batiment.updateMany({
    where: { id: { in: idsOf('batiment') } },
    data: { isActive: false },
  });
  await tx.annonce.updateMany({
    where: { propertyId: { in: idsOf('property') }, status: AnnonceStatus.ACTIVE },
    data: { status: AnnonceStatus.INACTIVE },
  });

  // Annonces en ligne restantes
  const annonces = await tx.annonce.findMany({
    where: { status: AnnonceStatus.ACTIVE, property: { agencyId } },
    select,
  });
  const cutAnnonces = beyond(annonces, limitOf(FEATURES.annonces)).map((a) => a.id);
  await tx.annonce.updateMany({
    where: { id: { in: cutAnnonces } },
    data: { status: AnnonceStatus.INACTIVE },
  });

  // Collaborateurs puis invitations en attente (même ordre que le compteur de places)
  const staff = await tx.staff.findMany({ where: active, select: { ...select, userId: true } });
  const invitations = await tx.invitation.findMany({
    where: { agencyId, status: InvitationStatus.PENDING, expiresAt: { gt: new Date() } },
    select,
  });
  const cutSeats = beyond(
    [
      ...staff.map((s) => ({ ...s, kind: 'staff' as const })),
      ...invitations.map((i) => ({ ...i, kind: 'invitation' as const, userId: null })),
    ],
    limitOf(FEATURES.users),
  );
  const cutStaff = cutSeats.filter((s) => s.kind === 'staff');
  const userIds = cutStaff.map((s) => s.userId!);
  await tx.staff.updateMany({
    where: { id: { in: cutStaff.map((s) => s.id) } },
    data: { isActive: false },
  });
  await tx.user.updateMany({ where: { id: { in: userIds } }, data: { status: 'INACTIVE' } });
  await tx.session.deleteMany({ where: { userId: { in: userIds } } });
  await tx.invitation.updateMany({
    where: { id: { in: cutSeats.filter((s) => s.kind === 'invitation').map((s) => s.id) } },
    data: { status: InvitationStatus.CANCELLED },
  });

  const now = new Date();
  await tx.subscription.update({
    where: { agencyId },
    data: {
      planId: freePlanId,
      status: SubscriptionStatus.ACTIVE,
      price: 0,
      currency: 'XOF',
      commissionRate: null,
      billingCycle: null,
      currentPeriodStart: now,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      lastRenewalReminder: null,
      scheduledPlanId: null,
      scheduledBillingCycle: null,
      scheduledAt: null,
    },
  });
  return { assets: cutAssets.length, annonces: cutAnnonces.length, seats: cutSeats.length };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const free = await prisma.subscriptionPlan.findUnique({
    where: { name: Plan.FREE_SUB },
    select: {
      id: true,
      planFeatures: { select: { limit: true, feature: { select: { name: true } } } },
    },
  });
  if (!free) throw new Error('Plan Gratuit absent : lancer le seed (db:seed:*-feature) avant.');
  const limits = new Map(free.planFeatures.map((pf) => [pf.feature.name, pf.limit]));

  const commissionPlans = await prisma.subscriptionPlan.findMany({
    where: { planCategory: PlanCategory.COMMISSION_BASED },
    select: { id: true, name: true, _count: { select: { paymentTransaction: true } } },
  });
  const subscriptions = await prisma.subscription.findMany({
    where: { planId: { in: commissionPlans.map((p) => p.id) } },
    select: {
      agencyId: true,
      agency: { select: { name: true } },
      plan: { select: { name: true } },
    },
  });

  console.log(`${subscriptions.length} agence(s) sur un plan commission :`);
  for (const s of subscriptions) console.log(`  - ${s.agency.name} (${s.plan.name})`);
  const withPayments = commissionPlans.filter((p) => p._count.paymentTransaction > 0);
  for (const p of withPayments) {
    console.log(
      `  ! ${p.name} : ${p._count.paymentTransaction} paiement(s) rattaché(s), plan gardé`,
    );
  }

  if (!apply) {
    console.log('\nAperçu seulement. Relancer avec --apply pour passer ces agences au Gratuit.');
    return;
  }

  for (const s of subscriptions) {
    const cut = await prisma.$transaction((tx) => moveToFree(tx, s.agencyId, free.id, limits));
    console.log(
      `  ✓ ${s.agency.name} : ${cut.assets} bien(s), ${cut.annonces} annonce(s), ${cut.seats} place(s) désactivé(s)`,
    );
  }
  const { count } = await prisma.subscriptionPlan.deleteMany({
    where: {
      id: { in: commissionPlans.filter((p) => !withPayments.includes(p)).map((p) => p.id) },
    },
  });
  console.log(`\n${count} plan(s) commission supprimé(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
