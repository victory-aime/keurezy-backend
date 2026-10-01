import { prisma } from '../seed/client';
import { SubscriptionStatus } from '../generated/enums';

/**
 * Délai de grâce, à lancer une fois juste avant d'activer `SUBSCRIPTION_EXPIRY_ENABLED=true`.
 *
 * Jusqu'ici, une période échue n'expirait pas (pas de renouvellement en ligne). Sans ce script,
 * toutes ces agences passeraient en lecture seule, annonces masquées, dans l'heure qui suit
 * l'activation, sans avoir été prévenues. Le script repousse leur échéance à J+7 : elles reçoivent
 * les rappels (J-7, J-3, J-1) et peuvent renouveler en ligne.
 *
 * Concernés : abonnements ACTIVE, non résiliés, dont l'échéance est passée ou absente.
 * Aperçu par défaut ; `--apply` pour écrire. Idempotent (une échéance déjà repoussée n'est plus
 * passée).
 */
const GRACE_DAYS = 7;

async function main() {
  const apply = process.argv.includes('--apply');
  const now = new Date();
  const graceEnd = new Date(now.getTime() + GRACE_DAYS * 86_400_000);
  const where = {
    status: SubscriptionStatus.ACTIVE,
    cancelAtPeriodEnd: false,
    OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { lt: now } }],
  };

  const due = await prisma.subscription.findMany({
    where,
    select: { currentPeriodEnd: true, agency: { select: { name: true } } },
    orderBy: { currentPeriodEnd: 'asc' },
  });
  console.log(`${due.length} abonnement(s) sans période en cours :`);
  for (const s of due) {
    console.log(
      `  - ${s.agency.name} : échéance ${s.currentPeriodEnd?.toISOString() ?? 'absente'}`,
    );
  }

  if (!apply) {
    console.log(
      `\nAperçu seulement. Relancer avec --apply pour fixer l'échéance au ${graceEnd.toISOString()}.`,
    );
    return;
  }
  const { count } = await prisma.subscription.updateMany({
    where,
    data: { currentPeriodEnd: graceEnd, lastRenewalReminder: null },
  });
  console.log(`\n${count} échéance(s) fixée(s) au ${graceEnd.toISOString()}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
