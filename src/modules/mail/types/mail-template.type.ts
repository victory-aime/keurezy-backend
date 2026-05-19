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
    USER_PASSWORD: string;
    AGENCY_NAME: string;
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
};

export class SendTemplateEmailOptions<T extends EMAIL_TEMPLATE_ID> {
  to: string | string[];
  template: T;
  subject: string;
  variables: TemplateVariables[T];
  replyTo?: string;
  tags?: { name: string; value: string }[];
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
}

export class SendInviteEmailPayload {
  sendTo: string;
  username: string;
  token: string;
  email: string;
  password: string;
  agencyName: string;
}
