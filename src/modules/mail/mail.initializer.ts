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
      this.logger.debug(`Envoi du lien de vérification email à ${email}`);
      await this.emailService.sendEmailVerificationLink({
        sendTo: email,
        username: name,
        link: url,
      });
    });
    authEmailBridge.updateUserEmailHandler(async ({ name, email, newEmail, url }) => {
      this.logger.debug(`Envoi du lien de changement d'email à ${email}`);

      await this.emailService.updateUserEmailLink({
        sendTo: email,
        username: name,
        newEmail,
        link: url,
      });
    });

    authEmailBridge.registerResetPasswordHandler(async ({ name, email, url }) => {
      this.logger.debug(`Envoi du lien de réinitialisation à ${email}`);
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
