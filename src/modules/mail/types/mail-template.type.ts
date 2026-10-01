import { EMAIL_TEMPLATE_ID } from '../utils/mail';

export type TemplateVariables = {
  [EMAIL_TEMPLATE_ID.OTP]: {
    otp_code: string;
  };
  [EMAIL_TEMPLATE_ID.WELCOME]: {
    username: string;
    app_name: string;
    login_url: string;
  };
  [EMAIL_TEMPLATE_ID.RESET_PASSWORD]: {
    EXPIRE_TIME: string;
    RESET_LINK?: string;
    USERNAME?: string;
    APP_NAME?: string;
  };
  [EMAIL_TEMPLATE_ID.EMAIL_VERIFY]: {
    FROM_CLIENT_EMAIL?: string;
    SUBJECT?: string;
    EXPIRE_TIME: string;
    VERIFY_EMAIL_LINK?: string;
    USERNAME?: string;
    APP_NAME?: string;
  };
  [EMAIL_TEMPLATE_ID.INVITATION_EMAIL]: {
    SUBJECT?: string;
    EXPIRE_TIME: string;
    USERNAME: string;
    REDIRECT_LINK: string;
    USER_EMAIL: string;
    AGENCY_NAME: string;
    APP_NAME?: string;
  };
  [EMAIL_TEMPLATE_ID.UPDATE_EMAIL_VERIFY]: {
    FROM_CLIENT_EMAIL?: string;
    SUBJECT?: string;
    EXPIRE_TIME: string;
    VERIFY_EMAIL_LINK?: string;
    USERNAME?: string;
    NEW_EMAIL?: string;
    APP_NAME?: string;
  };
  [EMAIL_TEMPLATE_ID.OTP_VERIFY]: {
    FROM_CLIENT_EMAIL?: string;
    SUBJECT?: string;
    EXPIRE_TIME: string;
    OTP: string;
    APP_NAME?: string;
  };
  [EMAIL_TEMPLATE_ID.BOOKING_STATUS]: {
    SUBJECT: string;
    USERNAME: string;
    /** « confirmée » ou « refusée » */
    STATUS_LABEL: string;
    PROPERTY_TITLE: string;
    /** « du 05/10/2026 au 12/10/2026 » */
    PERIOD: string;
    /** Motif du refus ou information complémentaire */
    MESSAGE?: string;
    APP_NAME?: string;
  };
  [EMAIL_TEMPLATE_ID.ACCOUNT_RECOVERY_REQUESTED]: {
    SUBJECT: string;
    USERNAME: string;
    /** « 03/10/2026 à 14:30 » */
    EXECUTE_AT: string;
    CANCEL_LINK: string;
    APP_NAME?: string;
  };
  [EMAIL_TEMPLATE_ID.ACCOUNT_RECOVERY_COMPLETED]: {
    SUBJECT: string;
    USERNAME: string;
    LOGIN_LINK: string;
    APP_NAME?: string;
  };
  [EMAIL_TEMPLATE_ID.TWO_FACTOR_RESET]: {
    SUBJECT: string;
    USERNAME: string;
    AGENCY_NAME: string;
    LOGIN_LINK: string;
    APP_NAME?: string;
  };
  [EMAIL_TEMPLATE_ID.AGENCY_CLOSE_SCHEDULED]: {
    SUBJECT: string;
    USERNAME: string;
    AGENCY_NAME: string;
    /** « 15/10/2026 » */
    CLOSE_DATE: string;
    /** Page Sécurité, où la fermeture s'annule */
    CANCEL_LINK: string;
    APP_NAME?: string;
  };
  [EMAIL_TEMPLATE_ID.SUBSCRIPTION_NOTICE]: {
    SUBJECT: string;
    /** Texte d'aperçu de la boîte de réception */
    PREHEADER: string;
    HEADLINE: string;
    USERNAME: string;
    /** Encadré : l'information principale */
    HIGHLIGHT: string;
    BODY: string;
    CTA_LABEL: string;
    CTA_LINK: string;
    APP_NAME?: string;
  };
};

export interface BookingStatusEmailPayload {
  sendTo: string;
  username: string;
  status: 'CONFIRMED' | 'REJECTED' | 'CANCELLED';
  propertyTitle: string;
  period: string;
  message?: string;
}

export class SendTemplateEmailOptions<T extends EMAIL_TEMPLATE_ID> {
  to: string | string[];
  template: T;
  subject: string;
  variables: TemplateVariables[T];
  replyTo?: string;
  tags?: { name: string; value: string }[];
  /** Pièces jointes, ex. un reçu PDF */
  attachments?: { filename: string; content: Buffer }[];
}

export class EmailResult {
  success: boolean;
  messageId?: string;
  error?: {
    code: string;
    message: string;
  };
}

export class EmailTemplatePayload {
  sendTo: string;
  username: string;
  link: string;
  newEmail?: string;
}

export class OTPTemplatePayload {
  sendTo: string;
  otp: string;
  /** Objet du code : vérification d'email (défaut) ou mot de passe oublié */
  purpose?: 'email-verification' | 'forget-password';
}

export class SendInviteEmailPayload {
  sendTo: string;
  username: string;
  token: string;
  email: string;
  agencyName: string;
}
