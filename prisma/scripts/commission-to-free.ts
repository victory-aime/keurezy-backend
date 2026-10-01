import { prisma } from '../seed/client';
import { SubscriptionBillingService } from '../../src/modules/packs/subscription-billing.service';

/**
 * Fin du modèle à la commission (décisions du 2026-10-01), à lancer après la migration
 * `16_free_plan` et le seed du plan Gratuit, avant la migration `17_drop_commission`, qui refuse
 * de passer tant qu'un plan commission existe.
 *
 * Chaque agence encore sur un plan commission passe au plan Gratuit (sans échéance). Ce qui
 * dépasse ses limites est désactivé, jamais supprimé : les éléments **les plus anciens** restent
 * actifs. Puis les plans commission, devenus inutilisés, sont supprimés.
 *
 * Aperçu par défaut ; `--apply` pour écrire. Idempotent (une agence passée au Gratuit n'est plus
 * sur un plan commission).
 */
async function main() {
  const apply = process.argv.includes('--apply');
  // Par le nom en SQL : les valeurs `*_COMMISSION` ne sont plus dans le client généré (migration 17)
  const commissionIds = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM subscription_plan WHERE name::text LIKE '%\_COMMISSION'`;
  const commissionPlans = await prisma.subscriptionPlan.findMany({
    where: { id: { in: commissionIds.map((p) => p.id) } },
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

  // Même bascule que l'expiration d'un abonnement (les plus anciens gardés dans les limites)
  const billing = new SubscriptionBillingService(prisma as never, {} as never);
  const now = new Date();
  for (const s of subscriptions) {
    await prisma.$transaction((tx) => billing.moveToFree(tx as never, s.agencyId, now));
    console.log(`  ✓ ${s.agency.name}`);
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
