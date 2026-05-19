import { Injectable } from '@nestjs/common';
import { EmailTemplatePayload, OTPTemplatePayload } from './types/mail-template.type';
import { ResendService } from './resend.service';

@Injectable()
export class EmailService {
  /**
   * Service to send emails using the ResendService.
   * It used email templates in resend config and sends them to specified recipients.
   */
  constructor(private readonly resendService: ResendService) {}

  async sendEmailVerificationLink(data: EmailTemplatePayload): Promise<void> {
    const { sendTo, link, username } = data;
    try {
      await this.resendService.sendEmailVerification(sendTo, username, link);
    } catch (error) {
      throw new Error(`Error sending email: ${error}`);
    }
  }

  async sendResetPasswordEmailLink(data: EmailTemplatePayload): Promise<void> {
    const { sendTo, link, username } = data;
    try {
      await this.resendService.sendResetPassword(sendTo, username, link);
    } catch (error) {
      throw new Error(`Error sending email: ${error}`);
    }
  }

  async updateUserEmailLink(data: EmailTemplatePayload): Promise<void> {
    const { sendTo, link, username, newEmail } = data;
    try {
      await this.resendService.sendUpdateEmailVerification(sendTo, username, link, newEmail);
    } catch (error) {
      throw new Error(`Error sending email: ${error}`);
    }
  }

  async sendVerificationOTP(data: OTPTemplatePayload): Promise<void> {
    const { sendTo, otp } = data;
    console.log('otp send', sendTo, 'otp', otp);
    try {
      await this.resendService.sendVerificationOTP(sendTo, otp);
    } catch (error) {
      throw new Error(`Error sending email: ${error}`);
    }
  }
}
