import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { getAuthInstance } from '_root/lib/auth';
import { HttpError } from '_root/config/http.error';
import { UsersService } from '_root/modules/users/users.service';
import {
  CreateUserDto,
  ForgotPasswordDto,
  LoginDto,
  ResendVerificationDto,
  ResetPasswordDto,
} from '_root/modules/auth/auth.dto';
import { PrismaService } from '_root/database/prisma.service';
import { EXPIRE_TIME } from '_root/config/enum';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  // ─────────────────────────────────────────
  // CONNEXION — retourne le token JWT
  // ─────────────────────────────────────────

  async loginUser(data: LoginDto) {
    try {
      const auth = getAuthInstance();

      const response = await auth.api.signInEmail({
        body: {
          email: data.email,
          password: data.password,
        },
      });

      if (!response?.token) {
        throw new HttpError(
          'Erreur lors de la connexion.',
          HttpStatus.UNAUTHORIZED,
          'LOGIN_FAILED',
        );
      }

      return {
        message: 'Connexion réussie',
        session: response,
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error('Erreur loginUser:', error);
      throw new HttpError(
        'Email ou mot de passe incorrect.',
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
      );
    }
  }

  // ─────────────────────────────────────────
  // CRÉATION USER VIA BETTER-AUTH (backend)
  // ─────────────────────────────────────────

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

      await auth.api.sendVerificationOTP({
        body: {
          email: response.user.email,
          type: 'email-verification',
        },
      });

      await this.prisma.client.create({
        data: {
          user: {
            connect: { id: response?.user?.id },
          },
        },
      });

      return {
        message: 'Bienvenue ! Votre compte a été créé avec succès.',
        email: response.user.email,
        otp: {
          expireOtp: EXPIRE_TIME._5_MINUTES,
          retryIn: EXPIRE_TIME._2_MINUTES,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof HttpError) {
        throw error;
      }
      throw new HttpError('Une erreur interne est survenue. Veuillez réessayer plus tard.');
    }
  }

  // ─────────────────────────────────────────
  // RENVOI EMAIL DE VÉRIFICATION
  // ─────────────────────────────────────────

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
      const COOLDOWN_MS = 120_000;
      const elapsed = Date.now() - verification.createdAt.getTime();
      const remainingMs = COOLDOWN_MS - elapsed;

      if (remainingMs > 0) {
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        return {
          success: false,
          cooldown: {
            active: true,
            remainingSeconds: Math.ceil(remainingSeconds / 1000),
            retryAt: new Date(Date.now() + remainingSeconds),
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

  async verifyMobileEmail(data: ResendVerificationDto & { otp: string }) {
    if (!data.email || !data.otp) {
      throw new HttpError('Service indisponible', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const response = await getAuthInstance().api.verifyEmailOTP({
      body: {
        email: data.email,
        otp: data.otp,
      },
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
  // ─────────────────────────────────────────
  // FORGOT PASSWORD
  // ─────────────────────────────────────────

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

  // ─────────────────────────────────────────
  // RESET PASSWORD
  // ─────────────────────────────────────────

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

  async checkUserEmail(email: string): Promise<boolean> {
    const user = await this.usersService.findUser({ email });
    return !!user;
  }
}
