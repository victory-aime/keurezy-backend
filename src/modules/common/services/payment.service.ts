import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { NabooService } from './naboo.service';
import { InitiateAgencyPaymentDto } from '../payment.dto';
import { BillingCycle, PaymentStatus, PricingType, Role } from '../../../../prisma/generated/enums';
import { PrismaService } from '_root/database/prisma.service';
import { decryptPassword, encryptPassword } from '_root/config/crypto';
import { getAuthInstance } from '_root/lib/auth';
import { UploadsService } from '_root/modules/cloudinary/uploads.service';
import { CLOUDINARY_FOLDER_NAME } from '_root/config/enum';
import { CloudinaryService } from '_root/modules/cloudinary/cloudinary.service';

interface NabooWebhookPayload {
  order_id: string;
  transaction_status: string;
  amount: number;
  currency: string;
  selected_payment_method: string;
  customer?: { first_name: string; last_name: string; phone: string };
  fees: number;
  fees_customer_side: boolean;
  paid_at: string;
}

interface AgencyOnboardingMetadata {
  userId?: string; // ID BetterAuth créé à l'initiation
  username: string;
  uploadSessionId: string;
  userEmail: string;
  password: string;
  agencyName: string;
  agencyEmail: string;
  description: string;
  address: string;
  phone: string;
  acceptTerms: boolean;
  documents: string[];
  planId: string;
  billingCycle: BillingCycle | null;
  pricingType: PricingType;
  commissionRate: string | null; // Decimal sérialisé en string pour le JSON
  pricingId: string | null; // ID du PlanPricing sélectionné
  priceXOF: number;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly naboo: NabooService,
    private readonly uploadsService: UploadsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // ── 1. Initier le paiement d'onboarding ───────────────────────────────────
  /**
   * Remplace createAgency() pour les plans SUBSCRIPTION.
   * Pour COMMISSION : l'agence peut être créée directement sans paiement.
   *
   * Étapes :
   *  a. Vérifier que l'email n'existe pas
   *  b. Créer le compte utilisateur BetterAuth
   *  c. Résoudre le plan + tarif
   *  d. Créer la transaction NabooPay
   *  e. Persister paymentTransaction  avec metadata complet
   *  f. Retourner checkout_url
   */
  async initiateAgencyPayment(
    dto: InitiateAgencyPaymentDto,
    uploadSessionId: string,
  ): Promise<{
    checkout_url: string;
    order_id: string;
  }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.userEmail },
    });
    if (existingUser) {
      throw new BadRequestException('Impossible de créer un compte avec cet email');
    }

    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: dto.plan.planId },
      include: { pricings: true },
    });

    if (!plan || !plan.isActive) {
      throw new NotFoundException('Plan introuvable ou inactif');
    }

    const isSubscription = plan.pricingType === PricingType.SUBSCRIPTION;

    let selectedPricing: (typeof plan.pricings)[0] | undefined;
    let priceXOF = 0;

    if (isSubscription) {
      selectedPricing = plan.pricings.find(
        (p) => p.billingCycle === (dto.plan.billingCycle ?? BillingCycle.MONTHLY),
      );
      if (!selectedPricing) {
        throw new BadRequestException('Cycle de facturation invalide pour ce plan');
      }
      priceXOF = Number(selectedPricing.price);
    }

    let uploadedDocuments: string[] = [];

    if (dto.documents?.length) {
      uploadedDocuments = await Promise.all(
        dto.documents.map(async (file) => {
          const result = await this.uploadsService.uploadAgencyFile({
            file,
            agencyName: dto.name,
            folderName: CLOUDINARY_FOLDER_NAME.TEMP,
            isTemp: true,
            uploadSessionId,
          });

          return result.secure_url;
        }),
      );
    }

    try {
      const nabooTx = await this.naboo.createTransaction({
        products: [
          {
            name: `Abonnement ${plan.name}`,
            price: priceXOF,
            quantity: 1,
            description: `Souscription de l'agence ${dto.name} — sur l'offre ${plan.name}`,
          },
        ],
        successUrl: `${process.env.NABOOPAY_FRONT_URL}/auth/onboarding?payment=success`,
        errorUrl: `${process.env.NABOOPAY_FRONT_URL}/auth/onboarding?payment=error`,
      });

      const encryptedPassword = encryptPassword(dto.password);
      const metadata: AgencyOnboardingMetadata = {
        username: dto.username,
        userEmail: dto.userEmail,
        password: encryptedPassword,
        uploadSessionId,
        agencyName: dto.name,
        agencyEmail: dto.email,
        description: dto.description,
        address: dto.address,
        phone: dto.phone,
        acceptTerms: dto.acceptTerms,
        documents: uploadedDocuments,
        planId: plan.id,
        billingCycle: selectedPricing?.billingCycle ?? null,
        pricingType: plan.pricingType,
        commissionRate: plan.commissionRate?.toString() ?? null,
        pricingId: selectedPricing?.id ?? null,
        priceXOF,
      };

      const paymentTransaction = await this.prisma.paymentTransaction.create({
        data: {
          naboo_order_id: nabooTx.order_id,
          checkout_url: nabooTx.checkout_url,
          amount_to_pay: priceXOF,
          planId: plan.id,
          status: PaymentStatus.PENDING,
          metadata: metadata as object,
        },
      });

      this.logger.log(
        `paymentTransaction  créé — id: ${paymentTransaction.id}, naboo_order_id: ${nabooTx.order_id}`,
      );

      return {
        checkout_url: nabooTx.checkout_url,
        order_id: nabooTx.order_id,
      };
    } catch (err) {
      this.logger.error(`Échec de création de la transaction`, err);
      throw err;
    }
  }

  // ── 2. Traiter le webhook NabooPay ────────────────────────────────────────
  /**
   * NabooSignatureGuard a déjà vérifié la signature avant d'arriver ici.
   * Le controller répond 200 immédiatement — ce handler tourne en fire-and-forget.
   */
  // payment.service.ts — méthodes handleWebhook + getPaymentStatus corrigées

  // ── 2. Traiter le webhook NabooPay ────────────────────────────────────────
  async handleWebhook(payload: NabooWebhookPayload): Promise<void> {
    const { order_id } = payload;

    this.logger.log(`Webhook reçu — order_id: ${order_id}, status: ${payload.transaction_status}`);

    const paymentTransaction = await this.prisma.paymentTransaction.findUnique({
      where: { naboo_order_id: order_id },
    });

    if (!paymentTransaction) {
      this.logger.warn(`order_id inconnu en base: ${order_id} — ignoré`);
      return;
    }

    if (paymentTransaction.status !== PaymentStatus.PENDING) {
      this.logger.log(`order_id ${order_id} déjà traité (${paymentTransaction.status}) — ignoré`);
      return;
    }

    const nabooTx = await this.naboo.getTransactionById(order_id);

    if (nabooTx.transaction_status !== 'paid') {
      await this.prisma.paymentTransaction.update({
        where: { naboo_order_id: order_id },
        data: {
          status: this.mapStatus(nabooTx.transaction_status),
          raw_webhook: payload as object,
        },
      });
      this.logger.log(
        `Paiement non confirmé (${nabooTx.transaction_status}) — order_id: ${order_id}`,
      );
      return;
    }

    const meta = paymentTransaction.metadata as unknown as AgencyOnboardingMetadata;

    // ── BetterAuth HORS de la transaction Prisma ─────────────────────────
    // signUpEmail est un appel HTTP externe — Prisma ne peut pas le rollback.
    // On le fait AVANT le $transaction pour pouvoir gérer les erreurs proprement.
    let createdUser: { id: string };
    try {
      const { user } = await getAuthInstance().api.signUpEmail({
        body: {
          name: meta.username,
          email: meta.userEmail,
          password: meta.password,
        },
      });
      await getAuthInstance().api.sendVerificationEmail({
        body: {
          email: meta.userEmail,
        },
      });
      createdUser = user;
    } catch (err) {
      this.logger.error(`[Webhook] Échec signUpEmail — order_id: ${order_id}`, err);
      // Ne pas mettre à jour le status → le prochain retry du webhook retentera
      throw err;
    }

    // 2e. Transaction Prisma atomique — tout ou rien
    //     Si elle échoue, on supprime le compte BetterAuth pour éviter l'orphelin.
    try {
      await this.prisma.$transaction(async (tx) => {
        // Marquer le paymentTransaction comme traité en premier
        // → si le reste échoue et rollback, le status repasse à PENDING
        // → le prochain retry webhook pourra retraiter
        await tx.paymentTransaction.update({
          where: { naboo_order_id: order_id },
          data: {
            status: PaymentStatus.PAID,
            confirmed_at: new Date(payload.paid_at),
            raw_webhook: payload as object,
          },
        });

        const owner = await tx.owner.create({
          data: { userId: createdUser.id },
        });

        await tx.user.update({
          where: { id: createdUser.id },
          data: { role: Role.OWNER },
        });

        const agency = await tx.agency.create({
          data: {
            name: meta.agencyName,
            email: meta.agencyEmail,
            ownerId: owner.id,
            address: meta.address,
            phone: meta.phone,
            description: meta.description,
            documents: meta.documents,
            acceptTerms: meta.acceptTerms,
          },
        });

        if (meta.pricingType === PricingType.COMMISSION) {
          throw new Error('Plan COMMISSION non éligible au flux de paiement NabooPay');
        }

        const now = new Date(payload.paid_at);
        const endDate = new Date(now);
        if (meta.billingCycle === BillingCycle.MONTHLY) endDate.setMonth(endDate.getMonth() + 1);
        if (meta.billingCycle === BillingCycle.YEARLY)
          endDate.setFullYear(endDate.getFullYear() + 1);

        await tx.subscription.create({
          data: {
            agencyId: agency.id,
            planId: meta.planId,
            pricingType: meta.pricingType,
            billingCycle: meta.billingCycle!,
            price: meta.priceXOF,
            currency: 'XOF',
            currentPeriodStart: now,
            currentPeriodEnd: endDate,
          },
        });
      });
      if (meta.uploadSessionId) {
        try {
          const moveResult = await this.uploadsService.moveTempToFinal(
            meta.uploadSessionId,
            meta.agencyName,
          );

          this.logger.log(
            `Fichiers déplacés depuis temp vers dossier final — session: ${meta.uploadSessionId}, total ${moveResult.moved}, destination ${moveResult.destination}`,
          );

          const finalFiles = await this.cloudinaryService.listFiles(
            `${CLOUDINARY_FOLDER_NAME.AGENCY}/${meta.agencyName.replace(/\s+/g, '-').toLowerCase()}/${CLOUDINARY_FOLDER_NAME.DOC}`,
          );
          const finalUrls = finalFiles.map((f) => f.secure_url);
          await this.prisma.agency.update({
            where: { email: meta.agencyEmail },
            data: {
              documents: finalUrls,
            },
          });
        } catch (err) {
          this.logger.error(
            `Erreur lors du move des fichiers — session: ${meta.uploadSessionId}`,
            err,
          );
        }
      }
    } catch (txErr) {
      // La transaction a échoué → supprimer le compte BetterAuth créé juste avant
      // pour ne pas laisser un utilisateur sans agence dans le système.
      this.logger.error(
        `[Webhook] Transaction Prisma échouée — suppression BetterAuth user ${createdUser.id}`,
        txErr,
      );
      await this.prisma.user
        .delete({
          where: { id: createdUser.id },
        })
        .catch(() => {});
      throw txErr;
    }
    this.logger.log(
      `✅ Agence créée et abonnement activé — order_id: ${order_id}, userId: ${createdUser.id}`,
    );
  }

  // ── 3. Polling de statut — double confiance NabooPay + local ─────────────
  /**
   * Stratégie de confiance :
   *
   *  local=PAID → agence créée, tout est bon ✅
   *  local=PENDING + naboo=paid → webhook pas encore arrivé, on déclenche manuellement
   *  local=PENDING + naboo=pending → paiement réellement en attente
   *  local=FAILED/CANCELLED → paiement échoué
   */
  async getPaymentStatus(orderId: string) {
    const paymentTransaction = await this.prisma.paymentTransaction.findUnique({
      where: { naboo_order_id: orderId },
      select: { status: true, amount_to_pay: true, metadata: true },
    });

    if (!paymentTransaction) throw new NotFoundException('Paiement introuvable');

    const nabooTx = await this.naboo.getTransactionById(orderId);

    // ── Cas de rattrapage : NabooPay dit paid mais, le webhook n'est pas arrivé ──
    // On déclenche le même traitement que handleWebhook pour ne pas bloquer le client.
    if (
      paymentTransaction.status === PaymentStatus.PENDING &&
      nabooTx.transaction_status === 'paid'
    ) {
      this.logger.warn(
        `[Polling] Webhook non reçu pour order_id: ${orderId} — déclenchement manuel du traitement`,
      );

      // Fire-and-forget identique au webhook — le polling suivant verra local=PAID
      setImmediate(() => {
        this.handleWebhook({
          order_id: orderId,
          transaction_status: nabooTx.transaction_status,
          amount: Number(paymentTransaction.amount_to_pay),
          currency: 'XOF',
          selected_payment_method: nabooTx.selected_payment_method ?? 'unknown',
          fees: 0,
          fees_customer_side: true,
          // paid_at non fourni par getTransaction → fallback sur maintenant
          paid_at: nabooTx.paid_at ?? new Date().toISOString(),
        }).catch((err) =>
          this.logger.error('[Polling] Erreur déclenchement manuel webhook:', err.message),
        );
      });
    }
    const extractJsonValues = paymentTransaction?.metadata as unknown as AgencyOnboardingMetadata;

    return {
      order_id: orderId,
      data: {
        ...extractJsonValues,
        password: decryptPassword(extractJsonValues?.password),
      },
      local_status: paymentTransaction.status,
      naboo_status: nabooTx.transaction_status,
    };
  }

  // ── Utilitaire ────────────────────────────────────────────────────────────
  private mapStatus(nabooStatus: string): PaymentStatus {
    const map: Record<string, PaymentStatus> = {
      paid: PaymentStatus.PAID,
      paid_and_blocked: PaymentStatus.PAID,
      cancelled: PaymentStatus.CANCELLED,
    };
    return map[nabooStatus] ?? PaymentStatus.FAILED;
  }
}
