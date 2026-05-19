// modules/mail/auth-mail.initializer.ts
// ─────────────────────────────────────────
// Enregistre les handlers email dans le bridge
// au démarrage de NestJS (OnModuleInit)
// ─────────────────────────────────────────
import { Injectable, OnModuleInit } from '@nestjs/common';
import { authEmailBridge } from '_root/modules/auth/auth-email.bridge';
import { EmailService } from './mail.service';

@Injectable()
export class AuthMailInitializer implements OnModuleInit {
  constructor(private readonly emailService: EmailService) {}

  onModuleInit() {
    authEmailBridge.registerVerificationHandler(async ({ name, email, url }) => {
      console.log('verify email link', url);
      await this.emailService.sendEmailVerificationLink({
        sendTo: email,
        username: name,
        link: url,
      });
    });
    authEmailBridge.updateUserEmailHandler(async ({ name, email, newEmail, url }) => {
      console.log('update email link', url);
      await this.emailService.updateUserEmailLink({
        sendTo: email,
        username: name,
        newEmail,
        link: url,
      });
    });

    authEmailBridge.registerResetPasswordHandler(async ({ name, email, url }) => {
      console.log('Reset password reset link', url);
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
