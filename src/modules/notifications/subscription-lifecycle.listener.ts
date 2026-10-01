import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NotificationType } from '../../../prisma/generated/enums';
import { PrismaService } from '../../database/prisma.service';
import {
  DomainEventBus,
  SubscriptionDowngradeAppliedEvent,
  SubscriptionMovedToFreeEvent,
  SubscriptionPaymentAppliedEvent,
  SubscriptionRenewalDueEvent,
} from '../events/domain-events';
import { ResendService } from '../mail/resend.service';
import { NotificationsService } from './notifications.service';

const frDate = (date: Date) => date.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
const frAmount = (xof: number) =>
  `${new Intl.NumberFormat('fr-FR').format(xof).replace(/ | /g, ' ')} F CFA`;

/** Noms affichés des plans (mêmes libellés que le web). */
const PLAN_LABELS: Record<string, string> = {
  FREE_SUB: 'Gratuit',
  BASIC_SUB: 'Débutant',
  STANDARD_SUB: 'Standard',
  PREMIUM_SUB: 'Entreprise',
};
const planLabel = (name: string | undefined) => (name ? (PLAN_LABELS[name] ?? name) : '');

/** Contenu d'un avis : e-mail (modèle générique) et notification in-app. */
interface Notice {
  subject: string;
  headline: string;
  highlight: string;
  body: string;
  ctaLabel: string;
  /** Chemin du tableau de bord */
  ctaPath: string;
  /** Texte court de la notification in-app */
  inApp: string;
}

/** Ce que les avis lisent de l'agence et de son abonnement. */
interface AgencyContext {
  name: string;
  owner: { id: string; name: string; email: string | null };
  plan: string;
  currentPeriodEnd: Date | null;
  scheduledPlan: string | null;
}

const SUBSCRIPTION_PAGE = '/dashboard/subscription';

/**
 * Avis d'abonnement à l'owner, par e-mail et notification in-app : rappel d'échéance, paiement
 * confirmé, passage au plan Gratuit, downgrade appliqué. Messages de facturation, envoyés quelles
 * que soient les préférences de notification.
 */
@Injectable()
export class SubscriptionLifecycleListener implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionLifecycleListener.name);

  constructor(
    private readonly events: DomainEventBus,
    private readonly prisma: PrismaService,
    private readonly resend: ResendService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.events.on('subscription.renewal.due', (event) => this.renewalDue(event));
    this.events.on('subscription.payment.applied', (event) => this.paymentApplied(event));
    this.events.on('subscription.moved.to.free', (event) => this.movedToFree(event));
    this.events.on('subscription.downgrade.applied', (event) => this.downgradeApplied(event));
  }

  /** Échéance à J-7, J-3, J-1 ; le texte dépend d'un downgrade programmé. */
  async renewalDue({ agencyId, daysLeft, periodEnd }: SubscriptionRenewalDueEvent) {
    const date = frDate(periodEnd);
    const delay = daysLeft === 1 ? '1 jour' : `${daysLeft} jours`;
    await this.notify(agencyId, `rappel J-${daysLeft}`, (agency) => {
      const fallback =
        'Sans renouvellement, votre agence passera au plan Gratuit à cette date : ce qui dépasse ses limites sera désactivé, sans rien supprimer (les éléments les plus anciens restent actifs).';
      if (agency.scheduledPlan === 'FREE_SUB') {
        return {
          subject: `Votre agence passe au plan Gratuit le ${date}`,
          headline: `Votre agence passe au plan Gratuit le ${date}`,
          highlight: `Comme vous l’avez demandé, le plan ${planLabel(agency.plan)} laisse place au plan Gratuit le ${date}.`,
          body: '0 F CFA à payer. Les éléments que vous n’avez pas choisi de garder seront désactivés, sans rien supprimer. Vous pouvez encore modifier ou annuler ce changement.',
          ctaLabel: 'Voir mon abonnement',
          ctaPath: SUBSCRIPTION_PAGE,
          inApp: `Votre agence passe au plan Gratuit le ${date}.`,
        };
      }
      if (agency.scheduledPlan) {
        const next = planLabel(agency.scheduledPlan);
        return {
          subject: `Votre abonnement se termine dans ${delay}`,
          headline: `Votre abonnement se termine dans ${delay}`,
          highlight: `Le ${date}, votre agence passe au plan ${next}.`,
          body: `Renouvelez au tarif du plan ${next} pour le garder, par Wave ou Orange Money. ${fallback}`,
          ctaLabel: 'Renouveler mon abonnement',
          ctaPath: SUBSCRIPTION_PAGE,
          inApp: `Le ${date}, votre agence passe au plan ${next}. Renouvelez pour le garder.`,
        };
      }
      return {
        subject: `Votre abonnement se termine dans ${delay}`,
        headline: `Votre abonnement se termine dans ${delay}`,
        highlight: `L’abonnement ${planLabel(agency.plan)} de ${agency.name} se termine le ${date}.`,
        body: `Le renouvellement se fait en quelques secondes par Wave ou Orange Money. Payé avant l’échéance, il démarre à la fin de la période en cours : vous ne perdez aucun jour. ${fallback}`,
        ctaLabel: 'Renouveler mon abonnement',
        ctaPath: SUBSCRIPTION_PAGE,
        inApp: `Votre abonnement se termine le ${date}. Renouvelez-le depuis la page Abonnement.`,
      };
    });
  }

  async paymentApplied({
    agencyId,
    kind,
    amount,
    periodStart,
    periodEnd,
  }: SubscriptionPaymentAppliedEvent) {
    const effect = {
      RENEWAL: 'Votre abonnement est renouvelé.',
      UPGRADE: 'Les nouvelles limites de votre plan sont actives dès maintenant.',
      REACTIVATION: 'Votre nouveau plan est actif dès maintenant.',
    }[kind];
    await this.notify(agencyId, `paiement ${kind}`, (agency) => ({
      subject: `Paiement confirmé : plan ${planLabel(agency.plan)}`,
      headline: 'Votre paiement est confirmé',
      highlight: `${frAmount(amount)} pour le plan ${planLabel(agency.plan)}, du ${frDate(periodStart)} au ${frDate(periodEnd)}.`,
      body: `${effect} Merci de votre confiance. Vos paiements sont listés dans l’historique de facturation de la page Abonnement.`,
      ctaLabel: 'Voir mon abonnement',
      ctaPath: SUBSCRIPTION_PAGE,
      inApp: `Paiement de ${frAmount(amount)} confirmé. ${effect}`,
    }));
  }

  async movedToFree({ agencyId, reason, previousPlan }: SubscriptionMovedToFreeEvent) {
    const previous = planLabel(previousPlan);
    await this.notify(agencyId, `passage au Gratuit (${reason})`, () => ({
      subject: 'Votre agence est passée au plan Gratuit',
      headline: 'Votre agence est passée au plan Gratuit',
      highlight:
        reason === 'SCHEDULED'
          ? `Comme prévu, votre agence a quitté le plan ${previous}.`
          : `Votre abonnement ${previous} s’est terminé sans renouvellement.`,
      body: `Votre agence reste en ligne, sans paiement ni échéance. ${
        reason === 'SCHEDULED'
          ? 'Les éléments que vous n’avez pas gardés ont été désactivés, sans rien supprimer.'
          : 'Ce qui dépassait les limites du plan Gratuit a été désactivé, sans rien supprimer : les éléments les plus anciens restent actifs.'
      } Reprenez un plan payant pour tout réactiver.`,
      ctaLabel: 'Choisir un plan',
      ctaPath: `${SUBSCRIPTION_PAGE}?action=change`,
      inApp:
        'Votre agence est passée au plan Gratuit. Reprenez un plan payant pour lever ses limites.',
    }));
  }

  async downgradeApplied({ agencyId }: SubscriptionDowngradeAppliedEvent) {
    await this.notify(agencyId, 'downgrade appliqué', (agency) => ({
      subject: `Votre agence est passée au plan ${planLabel(agency.plan)}`,
      headline: `Votre agence est passée au plan ${planLabel(agency.plan)}`,
      highlight: agency.currentPeriodEnd
        ? `Votre nouveau plan est actif jusqu’au ${frDate(agency.currentPeriodEnd)}.`
        : 'Votre nouveau plan est actif.',
      body: 'Les éléments que vous n’avez pas gardés ont été désactivés, sans rien supprimer. Vous pourrez les réactiver en revenant à un plan supérieur.',
      ctaLabel: 'Voir mon abonnement',
      ctaPath: SUBSCRIPTION_PAGE,
      inApp: `Votre agence est passée au plan ${planLabel(agency.plan)}.`,
    }));
  }

  /** Lit l'agence, rédige l'avis, puis notification in-app et e-mail. Une erreur est journalisée. */
  private async notify(
    agencyId: string,
    label: string,
    build: (agency: AgencyContext) => Notice,
  ): Promise<void> {
    try {
      const agency = await this.prisma.agency.findUnique({
        where: { id: agencyId },
        select: {
          name: true,
          owner: { select: { user: { select: { id: true, name: true, email: true } } } },
          subscriptions: {
            select: {
              currentPeriodEnd: true,
              plan: { select: { name: true } },
              scheduledPlanId: true,
            },
          },
        },
      });
      const owner = agency?.owner.user;
      const subscription = agency?.subscriptions[0];
      if (!agency || !owner || !subscription) return;
      const scheduledPlan = subscription.scheduledPlanId
        ? await this.prisma.subscriptionPlan.findUnique({
            where: { id: subscription.scheduledPlanId },
            select: { name: true },
          })
        : null;

      const notice = build({
        name: agency.name,
        owner,
        plan: subscription.plan.name,
        currentPeriodEnd: subscription.currentPeriodEnd,
        scheduledPlan: scheduledPlan?.name ?? null,
      });
      await this.notifications.createNotification({
        type: NotificationType.PAYMENT,
        scope: 'USER',
        title: notice.headline,
        content: notice.inApp,
        recipients: [owner.id],
      });
      if (owner.email) {
        await this.resend.sendSubscriptionNotice({
          sendTo: owner.email,
          username: owner.name,
          subject: notice.subject,
          preheader: notice.highlight,
          headline: notice.headline,
          highlight: notice.highlight,
          body: notice.body,
          ctaLabel: notice.ctaLabel,
          ctaLink: `${process.env.WEB_APP_URL}${notice.ctaPath}`,
        });
      }
      this.logger.log(`Avis d'abonnement (${label}) envoyé à l'agence ${agencyId}`);
    } catch (error) {
      this.logger.error(
        `Avis d'abonnement (${label}) non envoyé à l'agence ${agencyId} : ${String(error)}`,
      );
    }
  }
}
