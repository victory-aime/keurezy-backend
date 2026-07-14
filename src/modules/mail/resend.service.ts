import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { EMAIL_TEMPLATE_ID, EMAIL_TEMPLATE_RUNTIME_ID } from './utils/mail';
import {
  EmailResult,
  SendInviteEmailPayload,
  SendTemplateEmailOptions,
} from './types/mail-template.type';
import { formatExpiresIn } from './utils/getExpiresTime';
import { EXPIRE_TIME } from '../../config/enum';

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
          variables,
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
        EXPIRE_TIME: formatExpiresIn(EXPIRE_TIME._5_MINUTES),
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
    password,
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
        USER_PASSWORD: password,
        AGENCY_NAME: agencyName,
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

  async sendVerificationOTP(to: string, otp: string): Promise<EmailResult> {
    return this.sendTemplateEmail({
      to,
      subject: 'Verification Email',
      template: EMAIL_TEMPLATE_ID.OTP_VERIFY,
      variables: {
        FROM_CLIENT_EMAIL: this.fromAddress,
        SUBJECT: 'Verification Email',
        EXPIRE_TIME: formatExpiresIn(EXPIRE_TIME._5_MINUTES),
        OTP: otp,
        APP_NAME: process.env.APP_NAME,
      },
    });
  }
}
