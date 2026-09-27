import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { OTP_SETTINGS } from '../../config/otp';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateUserDto,
  ForgotPasswordDto,
  ResendVerificationDto,
  ResetPasswordDto,
  ResetPasswordOtpDto,
  VerifyOtpDto,
} from './auth.dto';
import { getAuthInstance } from '../../lib/auth';
import { HttpError } from '../../config/http.error';

// Délai minimal entre deux envois de code (vérification d'email ou mot de passe oublié)
const OTP_RESEND_COOLDOWN_MS = OTP_SETTINGS.resendCooldown * 1000;

// Refus du plugin emailOTP traduits pour les clients
const OTP_ERROR_MESSAGES: Record<string, string> = {
  INVALID_OTP: 'Code incorrect.',
  OTP_EXPIRED: 'Ce code a expiré. Demandez-en un nouveau.',
  TOO_MANY_ATTEMPTS: 'Trop de tentatives. Demandez un nouveau code.',
  // Email inconnu : même réponse qu'un code faux, pour ne pas révéler l'existence du compte
  USER_NOT_FOUND: 'Code incorrect.',
};

/** Convertit une erreur Better Auth liée à un code OTP en erreur métier lisible. */
const toOtpHttpError = (error: unknown): HttpError | null => {
  const code = (error as { body?: { code?: string } })?.body?.code;
  if (!code || !(code in OTP_ERROR_MESSAGES)) return null;
  return new HttpError(
    OTP_ERROR_MESSAGES[code],
    HttpStatus.BAD_REQUEST,
    code === 'USER_NOT_FOUND' ? 'INVALID_OTP' : code,
  );
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  async registerUser(data: CreateUserDto) {
    try {
      const existing = await this.usersService.findUser({ email: data.email });
      if (existing) {
        throw new HttpError(
          'Impossible de créer un compte avec ses informations veuillez changer svp !.',
          HttpStatus.BAD_REQUEST,
          'BAD_REQUEST',
        );
      }
      const auth = getAuthInstance();

      const response = await auth.api.signUpEmail({
        body: {
          email: data.email,
          password: data.password,
          name: data.name,
        },
      });

      if (!response?.user) {
        throw new HttpError('Erreur lors de la création du compte.');
      }

      // Profil client créé avant l'envoi du code : un échec d'envoi se rattrape par un renvoi
      await this.prisma.client.create({
        data: {
          user: {
            connect: { id: response?.user?.id },
          },
        },
      });

      await auth.api.sendVerificationOTP({
        body: {
          email: response.user.email,
          type: 'email-verification',
        },
      });

      return {
        message: 'Bienvenue ! Votre compte a été créé avec succès.',
        email: response.user.email,
        // Durées en secondes, alignées sur la configuration emailOTP
        otp: {
          expireOtp: OTP_SETTINGS.expiresIn,
          retryIn: OTP_SETTINGS.resendCooldown,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof HttpError) {
        throw error;
      }
      throw new HttpError('Une erreur interne est survenue. Veuillez réessayer plus tard.');
    }
  }

  async sendVerificationEmail(data: ResendVerificationDto): Promise<{ message: string }> {
    const user = await this.usersService.findUser({ email: data?.email });
    if (!user) return { message: 'Si ce compte existe, un email a été envoyé.' };
    if (user.emailVerified) throw new BadRequestException('Email déjà vérifié.');

    const auth = getAuthInstance();

    await auth.api.sendVerificationEmail({
      body: {
        email: data?.email,
      },
    });

    return { message: 'Email de vérification renvoyé.' };
  }

  async resendVerificationOtpEmail(data: ResendVerificationDto) {
    const verification = await this.prisma.verification.findFirst({
      where: {
        identifier: `email-verification-otp-${data.email}`,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    if (verification) {
      const COOLDOWN_MS = OTP_RESEND_COOLDOWN_MS;
      const elapsed = Date.now() - verification.createdAt.getTime();
      const remainingMs = COOLDOWN_MS - elapsed;

      if (remainingMs > 0) {
        return {
          success: false,
          cooldown: {
            active: true,
            remainingSeconds: Math.ceil(remainingMs / 1000),
            retryAt: new Date(Date.now() + remainingMs),
          },
        };
      }
    }

    await getAuthInstance().api.sendVerificationOTP({
      body: {
        email: data.email,
        type: 'email-verification',
      },
    });

    return {
      success: true,
      message: 'Code renvoyé',
      cooldown: {
        active: false,
      },
    };
  }

  async verifyMobileEmail(data: VerifyOtpDto) {
    if (!data.email || !data.otp) {
      throw new HttpError('Service indisponible', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const response = await getAuthInstance()
      .api.verifyEmailOTP({
        body: {
          email: data.email,
          otp: data.otp,
        },
      })
      .catch((error: unknown) => {
        throw toOtpHttpError(error) ?? error;
      });

    if (!response?.user) {
      throw new HttpError(
        'Un problème est survenu lors de la vérification',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (response.user.email !== data.email) {
      throw new HttpError('Email invalide', HttpStatus.BAD_REQUEST);
    }

    await this.prisma.user.update({
      where: { id: response.user.id },
      data: {
        emailVerified: true,
      },
    });

    return {
      success: true,
      message: 'Verification success.',
    };
  }

  async forgotPassword(data: ForgotPasswordDto): Promise<{ message: string }> {
    try {
      const auth = getAuthInstance();

      const user = await this.usersService.findUser({ email: data.email });
      if (!user) {
        return {
          message: 'Si ce compte existe, un lien de réinitialisation a été envoyé.',
        };
      }

      const response = await auth.api.requestPasswordReset({
        body: { email: data.email },
      });

      if (!response?.status) {
        throw new HttpError('Impossible de générer le lien de réinitialisation.');
      }

      return {
        message: 'Si ce compte existe, un lien de réinitialisation a été envoyé.',
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error('Erreur forgotPassword:', error);
      throw new HttpError('Une erreur interne est survenue. Veuillez réessayer plus tard.');
    }
  }

  async resetPassword(data: ResetPasswordDto): Promise<{ message: string }> {
    try {
      const auth = getAuthInstance();

      const response = await auth.api.resetPassword({
        body: {
          token: data.token,
          newPassword: data.newPassword,
        },
      });

      if (!response?.status) {
        throw new HttpError(
          'Lien invalide ou expiré.',
          HttpStatus.BAD_REQUEST,
          'INVALID_RESET_TOKEN',
        );
      }

      return { message: 'Mot de passe réinitialisé avec succès.' };
    } catch (error) {
      if (error instanceof HttpError || error instanceof BadRequestException) {
        throw error;
      }
      console.error('Erreur resetPassword:', error);
      throw new HttpError('Lien invalide ou expiré.', HttpStatus.BAD_REQUEST, 'INVALID_TOKEN');
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // MOT DE PASSE OUBLIÉ PAR CODE OTP (mobile) — le web garde le lien par email
  // ─────────────────────────────────────────────────────────────────

  /**
   * Envoie un code de réinitialisation. La réponse ne dépend jamais de l'existence du compte
   * (Better Auth n'envoie rien pour un email inconnu) ; un envoi récent n'est pas répété.
   */
  async requestPasswordResetOtp(email: string) {
    const normalizedEmail = email.toLowerCase();
    const lastCode = await this.prisma.verification.findFirst({
      where: { identifier: `forget-password-otp-${normalizedEmail}` },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const inCooldown =
      !!lastCode && Date.now() - lastCode.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS;

    if (!inCooldown) {
      await getAuthInstance().api.requestPasswordResetEmailOTP({
        body: { email: normalizedEmail },
      });
    }

    return {
      message: 'Si un compte existe pour cet email, un code de réinitialisation a été envoyé.',
      otp: { expireOtp: OTP_SETTINGS.expiresIn, retryIn: OTP_SETTINGS.resendCooldown },
    };
  }

  /** Vérifie le code sans le consommer : l'app peut ensuite demander le nouveau mot de passe. */
  async verifyPasswordResetOtp(data: VerifyOtpDto) {
    await getAuthInstance()
      .api.checkVerificationOTP({
        body: { email: data.email.toLowerCase(), otp: data.otp, type: 'forget-password' },
      })
      .catch((error: unknown) => {
        throw toOtpHttpError(error) ?? error;
      });

    return { success: true };
  }

  /** Change le mot de passe ; Better Auth ferme alors toutes les sessions de l'utilisateur. */
  async resetPasswordWithOtp(data: ResetPasswordOtpDto) {
    await getAuthInstance()
      .api.resetPasswordEmailOTP({
        body: { email: data.email.toLowerCase(), otp: data.otp, password: data.newPassword },
      })
      .catch((error: unknown) => {
        throw toOtpHttpError(error) ?? error;
      });

    return { message: 'Votre mot de passe a été modifié. Vous pouvez vous connecter.' };
  }

  async checkUserEmail(email: string): Promise<boolean> {
    const user = await this.usersService.findUser({ email });
    return !!user;
  }
}
