import { Injectable, Logger } from '@nestjs/common';
import { OTP_SETTINGS } from '../../config/otp';
import { Resend } from 'resend';
import { EMAIL_TEMPLATE_ID, EMAIL_TEMPLATE_RUNTIME_ID } from './utils/mail';
import {
  BookingStatusEmailPayload,
  EmailResult,
  SendInviteEmailPayload,
  SendTemplateEmailOptions,
} from './types/mail-template.type';
import { formatExpiresIn } from './utils/getExpiresTime';
import { EXPIRE_TIME } from '../../config/enum';

const BOOKING_STATUS_LABELS = {
  CONFIRMED: 'confirmée',
  REJECTED: 'refusée',
  CANCELLED: 'annulée',
} as const;

/** Échappe une valeur insérée telle quelle (`{{{…}}}`) dans un modèle HTML Resend. */
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Variables d'un modèle, prêtes à insérer : Resend insère `{{{…}}}` sans échappement, et
 * plusieurs valeurs viennent des utilisateurs (nom d'agence, titre de bien, message). Toute
 * valeur texte est échappée, sauf les liens (`*_LINK`), construits par le backend et insérés
 * aussi dans un `href`.
 */
export function escapeTemplateVariables<T extends Record<string, unknown>>(variables: T): T {
  return Object.fromEntries(
    Object.entries(variables).map(([key, value]) => [
      key,
      typeof value === 'string' && !key.endsWith('_LINK') ? escapeHtml(value) : value,
    ]),
  ) as T;
}

@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);
  private readonly resend: Resend;
  private readonly fromAddress: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY!;
    const fromAddress = process.env.RESEND_CLIENT_EMAIL;

    if (!apiKey) throw new Error('RESEND_API_KEY is not defined');
    if (!fromAddress) throw new Error('RESEND_FROM_EMAIL is not defined');

    this.resend = new Resend(apiKey);
    this.fromAddress = fromAddress;
  }

  private handleResendResponse(
    data: { id: string } | null,
    error: { name: string; message: string } | null,
    recipient: string,
  ): EmailResult {
    if (error) {
      this.logger.error(`Failed to send email to ${recipient} — [${error.name}] ${error.message}`);
      return {
        success: false,
        error: { code: error.name, message: error.message },
      };
    }

    if (data?.id) {
      this.logger.log(`Email sent ✓ id=${data.id}`);
      return { success: true, messageId: data.id };
    }

    // Cas inattendu : ni data ni error
    this.logger.warn('Resend returned neither data nor error');
    return {
      success: false,
      error: { code: 'UNKNOWN', message: 'No response from Resend' },
    };
  }

  private handleUnexpectedError(err: unknown, recipient: string): EmailResult {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`Unexpected error sending to ${recipient}: ${message}`);
    return {
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    };
  }

  async sendTemplateEmail<T extends EMAIL_TEMPLATE_ID>(
    options: SendTemplateEmailOptions<T>,
  ): Promise<EmailResult> {
    const { to, template, variables, subject, replyTo, tags } = options;
    const recipients = Array.isArray(to) ? to : [to];
    const templateId = EMAIL_TEMPLATE_RUNTIME_ID[template];
    // Modèle pas encore créé dans Resend : l'action métier continue, l'envoi est ignoré
    if (!templateId) {
      this.logger.warn(`Modèle Resend ${template} non configuré : e-mail ignoré`);
      return null as unknown as EmailResult;
    }

    this.logger.log(`Variables [${variables}]`);
    this.logger.log(`Sending [${template}] → ${recipients.join(', ')}`);

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromAddress,
        to: recipients,
        replyTo: replyTo,
        subject,
        template: {
          id: templateId,
          variables: escapeTemplateVariables(variables),
        },
        tags,
      });
      return this.handleResendResponse(data, error, recipients[0]);
    } catch (err) {
      return this.handleUnexpectedError(err, recipients[0]);
    }
  }

  async sendResetPassword(to: string, username: string, resetLink: string) {
    return this.sendTemplateEmail({
      to,
      subject: 'Réinitialisation de votre mot de passe',
      template: EMAIL_TEMPLATE_ID.RESET_PASSWORD,
      variables: {
        USERNAME: username,
        RESET_LINK: resetLink,
        EXPIRE_TIME: formatExpiresIn(OTP_SETTINGS.expiresIn),
        APP_NAME: process.env.APP_NAME,
      },
    });
  }

  async sendEmailVerification(to: string, username: string, link: string): Promise<EmailResult> {
    return this.sendTemplateEmail({
      to,
      subject: 'Verification Email',
      template: EMAIL_TEMPLATE_ID.EMAIL_VERIFY,
      variables: {
        FROM_CLIENT_EMAIL: this.fromAddress,
        SUBJECT: 'Verify Email',
        EXPIRE_TIME: formatExpiresIn(EXPIRE_TIME._30_MINUTES),
        VERIFY_EMAIL_LINK: link,
        USERNAME: username,
        APP_NAME: process.env.APP_NAME,
      },
    });
  }

  async sendInvitationEmail({
    sendTo,
    email,
    username,
    agencyName,
    token,
  }: SendInviteEmailPayload): Promise<EmailResult> {
    return this.sendTemplateEmail({
      to: sendTo,
      subject: 'Invitation Email',
      template: EMAIL_TEMPLATE_ID.INVITATION_EMAIL,
      variables: {
        SUBJECT: 'Invitation Email',
        EXPIRE_TIME: formatExpiresIn(EXPIRE_TIME._7_DAYS),
        REDIRECT_LINK: `${process.env.FRONTEND_VERIFY_INVITATION_URL}/?token=${token}`,
        USERNAME: username,
        USER_EMAIL: email,
        AGENCY_NAME: agencyName,
        APP_NAME: process.env.APP_NAME,
      },
    });
  }

  async sendUpdateEmailVerification(
    to: string,
    username: string,
    link: string,
    newEmail?: string,
  ): Promise<EmailResult> {
    return this.sendTemplateEmail({
      to,
      subject: 'Changement d’adresse email',
      template: EMAIL_TEMPLATE_ID.UPDATE_EMAIL_VERIFY,
      variables: {
        FROM_CLIENT_EMAIL: this.fromAddress,
        SUBJECT: 'Changement d’adresse email',
        EXPIRE_TIME: formatExpiresIn(EXPIRE_TIME._15_MINUTES),
        VERIFY_EMAIL_LINK: link,
        USERNAME: username,
        NEW_EMAIL: newEmail,
        APP_NAME: process.env.APP_NAME,
      },
    });
  }

  async sendVerificationOTP(
    to: string,
    otp: string,
    purpose:
      | 'email-verification'
      | 'forget-password'
      | 'invitation'
      | 'account-recovery' = 'email-verification',
  ): Promise<EmailResult> {
    const subject = {
      'forget-password': 'Code de réinitialisation de votre mot de passe',
      'email-verification': 'Code de vérification de votre adresse email',
      invitation: 'Code de confirmation de votre invitation',
      'account-recovery': 'Code de récupération de votre compte',
    }[purpose];

    return this.sendTemplateEmail({
      to,
      subject,
      template: EMAIL_TEMPLATE_ID.OTP_VERIFY,
      variables: {
        FROM_CLIENT_EMAIL: this.fromAddress,
        SUBJECT: subject,
        // Durée identique à la configuration emailOTP de Better Auth
        EXPIRE_TIME: formatExpiresIn(OTP_SETTINGS.expiresIn),
        OTP: otp,
        APP_NAME: process.env.APP_NAME,
      },
    });
  }

  /** Demande de récupération enregistrée : date d'exécution et lien d'annulation. */
  async sendAccountRecoveryRequested(p: {
    sendTo: string;
    username: string;
    executeAt: string;
    cancelLink: string;
  }) {
    const subject = 'Demande de récupération de votre compte';
    return this.sendTemplateEmail({
      to: p.sendTo,
      subject,
      template: EMAIL_TEMPLATE_ID.ACCOUNT_RECOVERY_REQUESTED,
      variables: {
        SUBJECT: subject,
        USERNAME: p.username,
        EXECUTE_AT: p.executeAt,
        CANCEL_LINK: p.cancelLink,
        APP_NAME: process.env.APP_NAME,
      },
    });
  }

  /** Récupération exécutée : 2FA désactivée, à reconfigurer. */
  async sendAccountRecoveryCompleted(p: { sendTo: string; username: string; loginLink: string }) {
    const subject = 'Double authentification désactivée sur votre compte';
    return this.sendTemplateEmail({
      to: p.sendTo,
      subject,
      template: EMAIL_TEMPLATE_ID.ACCOUNT_RECOVERY_COMPLETED,
      variables: {
        SUBJECT: subject,
        USERNAME: p.username,
        LOGIN_LINK: p.loginLink,
        APP_NAME: process.env.APP_NAME,
      },
    });
  }

  /** L'owner a réinitialisé la 2FA d'un membre. */
  async sendTwoFactorReset(p: {
    sendTo: string;
    username: string;
    agencyName: string;
    loginLink: string;
  }) {
    const subject = 'Votre double authentification a été réinitialisée';
    return this.sendTemplateEmail({
      to: p.sendTo,
      subject,
      template: EMAIL_TEMPLATE_ID.TWO_FACTOR_RESET,
      variables: {
        SUBJECT: subject,
        USERNAME: p.username,
        AGENCY_NAME: p.agencyName,
        LOGIN_LINK: p.loginLink,
        APP_NAME: process.env.APP_NAME,
      },
    });
  }

  /** Fermeture de l'agence programmée : date et lien pour l'annuler. */
  async sendAgencyCloseScheduled(p: {
    sendTo: string;
    username: string;
    agencyName: string;
    closeDate: string;
    cancelLink: string;
  }) {
    const subject = `Fermeture de ${p.agencyName} programmée`;
    return this.sendTemplateEmail({
      to: p.sendTo,
      subject,
      template: EMAIL_TEMPLATE_ID.AGENCY_CLOSE_SCHEDULED,
      variables: {
        SUBJECT: subject,
        USERNAME: p.username,
        AGENCY_NAME: p.agencyName,
        CLOSE_DATE: p.closeDate,
        CANCEL_LINK: p.cancelLink,
        APP_NAME: process.env.APP_NAME,
      },
    });
  }

  /**
   * Avis d'abonnement à l'owner (rappel, paiement confirmé, passage au Gratuit, downgrade) : un
   * modèle générique, le texte est rédigé par l'appelant (variables échappées à l'envoi).
   */
  async sendSubscriptionNotice(p: {
    sendTo: string;
    username: string;
    subject: string;
    preheader: string;
    headline: string;
    highlight: string;
    body: string;
    ctaLabel: string;
    ctaLink: string;
  }) {
    return this.sendTemplateEmail({
      to: p.sendTo,
      subject: p.subject,
      template: EMAIL_TEMPLATE_ID.SUBSCRIPTION_NOTICE,
      variables: {
        SUBJECT: p.subject,
        PREHEADER: p.preheader,
        HEADLINE: p.headline,
        USERNAME: p.username,
        HIGHLIGHT: p.highlight,
        BODY: p.body,
        CTA_LABEL: p.ctaLabel,
        CTA_LINK: p.ctaLink,
        APP_NAME: process.env.APP_NAME,
      },
    });
  }

  /** Réservation confirmée, refusée ou annulée. Sans modèle configuré, l'envoi est ignoré. */
  async sendBookingStatus(payload: BookingStatusEmailPayload): Promise<EmailResult | null> {
    if (!EMAIL_TEMPLATE_RUNTIME_ID[EMAIL_TEMPLATE_ID.BOOKING_STATUS]) {
      this.logger.warn('RESEND_TEMPLATE_BOOKING_STATUS_ID absent : e-mail de réservation ignoré');
      return null;
    }
    const statusLabel = BOOKING_STATUS_LABELS[payload.status];
    const subject = `Votre réservation est ${statusLabel}`;
    return this.sendTemplateEmail({
      to: payload.sendTo,
      subject,
      template: EMAIL_TEMPLATE_ID.BOOKING_STATUS,
      variables: {
        SUBJECT: subject,
        USERNAME: payload.username,
        STATUS_LABEL: statusLabel,
        PROPERTY_TITLE: payload.propertyTitle,
        PERIOD: payload.period,
        MESSAGE: payload.message,
        APP_NAME: process.env.APP_NAME,
      },
    });
  }
}
