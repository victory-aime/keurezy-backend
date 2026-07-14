/** modules/mail/auth-mail.initializer.ts
 * Enregistre les handlers email dans le bridge
 * au démarrage de NestJS (OnModuleInit)
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EmailService } from './mail.service';
import { authEmailBridge } from '../auth/auth-email.bridge';

@Injectable()
export class AuthMailInitializer implements OnModuleInit {
  private logger = new Logger(AuthMailInitializer.name);
  constructor(private readonly emailService: EmailService) {}

  onModuleInit() {
    authEmailBridge.registerVerificationHandler(async ({ name, email, url }) => {
      this.logger.debug(`verify email link ${url}`);
      await this.emailService.sendEmailVerificationLink({
        sendTo: email,
        username: name,
        link: url,
      });
    });
    authEmailBridge.updateUserEmailHandler(async ({ name, email, newEmail, url }) => {
      this.logger.debug(`update email link ${url}`);

      await this.emailService.updateUserEmailLink({
        sendTo: email,
        username: name,
        newEmail,
        link: url,
      });
    });

    authEmailBridge.registerResetPasswordHandler(async ({ name, email, url }) => {
      this.logger.debug(`Reset password link ${url}`);
      await this.emailService.sendResetPasswordEmailLink({
        sendTo: email,
        username: name,
        link: url,
      });
    });

    authEmailBridge.sendVerificationOTPHandler(async ({ email, otp }) => {
      await this.emailService.sendVerificationOTP({
        sendTo: email,
        otp,
      });
    });
  }
}
