import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { EXPIRE_TIME } from '../config/enum';
import { twoFactor, emailOTP, lastLoginMethod } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { expo } from '@better-auth/expo';
import { authEmailBridge } from '../modules/auth/auth-email.bridge';
import { formatExpiresIn } from '../modules/mail/utils/getExpiresTime';
import { prisma } from '../../prisma/seed/client';
import { customSession } from 'better-auth/plugins/custom-session';
import { i18n } from '@better-auth/i18n';

let authInstance: ReturnType<typeof createAuth> | null = null;

export const getAuthInstance = () => {
  if (!authInstance) {
    authInstance = createAuth();
  }
  return authInstance;
};

export const createAuth = () => {
  const isDev = process.env.NODE_ENV !== 'production';
  return betterAuth({
    advanced: {
      defaultCookieAttributes: isDev
        ? {
            secure: false,
            sameSite: 'lax',
            httpOnly: true,
          }
        : {
            secure: true,
            sameSite: 'none',
            httpOnly: true,
          },
    },
    appName: process.env.APP_NAME,
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),
    user: {
      deleteUser: {
        enabled: true,
      },
      changeEmail: {
        enabled: true,
      },
      additionalFields: {
        role: {
          type: 'string',
          input: false,
        },
        status: {
          type: 'boolean',
          input: false,
        },
      },
    },
    emailVerification: {
      sendOnSignUp: false,
      autoSignInAfterVerification: true,
      expiresIn: EXPIRE_TIME._30_MINUTES,
      sendVerificationEmail: async ({ user, token }) => {
        console.log('link', `${process.env.FRONTEND_EMAIL_VERIFIED_URL}/?token=${token}`);
        await authEmailBridge.sendVerification({
          name: user.name,
          email: user.email,
          url: `${process.env.FRONTEND_EMAIL_VERIFIED_URL}/?token=${token}`,
          expireTime: formatExpiresIn(EXPIRE_TIME._30_MINUTES),
        });
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: EXPIRE_TIME._5_MINUTES,
      sendResetPassword: async ({ user, token }) => {
        await authEmailBridge.sendResetPassword({
          name: user.name,
          email: user.email,
          url: `${process.env.FRONTEND_RESET_PASSWORD_URL}/?token=${token}`,
          expireTime: formatExpiresIn(EXPIRE_TIME._5_MINUTES),
        });
      },
    },
    plugins: [
      customSession(async ({ user, session }) => {
        const staff = await prisma.staff.findFirst({
          where: { userId: user.id },
          include: {
            permissions: {
              where: { granted: true },
              include: {
                permission: {
                  select: {
                    name: true,
                    feature: {
                      select: { name: true, category: true },
                    },
                  },
                },
              },
            },
          },
        });

        const permissions =
          staff?.permissions.map((p) => ({
            name: p.permission?.name,
            feature: p.permission?.feature.name,
            category: p.permission?.feature.category,
          })) || [];

        return {
          user,
          session: {
            ...session,
            permissions,
          },
        };
      }),
      twoFactor({
        issuer: process.env.APP_NAME,
        skipVerificationOnEnable: true,
      }),
      passkey(),
      expo(),
      emailOTP({
        expiresIn: EXPIRE_TIME._60_MINUTES,
        disableSignUp: true,
        allowedAttempts: 5,
        async sendVerificationOTP({ email, otp, type }) {
          if (type === 'email-verification') {
            await authEmailBridge.sendOTP({
              email,
              otp,
            });
          } else if (type === 'forget-password') {
            // Send the OTP for password reset
          } else {
            return;
          }
        },
      }),
      i18n({
        translations: {
          fr: {
            USER_NOT_FOUND: 'Utilisateur non trouvé',
            INVALID_EMAIL_OR_PASSWORD: 'Email ou mot de passe invalide',
            INVALID_PASSWORD: 'Mot de passe invalide',
            CHALLENGE_NOT_FOUND: "La demande d'authentification est introuvable ou a expiré.",
            YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
              "Vous n'êtes pas autorisé à enregistrer cette clé de sécurité.",
            FAILED_TO_VERIFY_REGISTRATION:
              "Impossible de vérifier l'enregistrement de la clé de sécurité.",
            PASSKEY_NOT_FOUND: 'Clé de sécurité introuvable.',
            AUTHENTICATION_FAILED: "L'authentification avec la clé de sécurité a échoué.",
            UNABLE_TO_CREATE_SESSION: 'Impossible de créer la session utilisateur.',
            FAILED_TO_UPDATE_PASSKEY: 'Impossible de mettre à jour la clé de sécurité.',
            PREVIOUSLY_REGISTERED: 'Cette clé de sécurité est déjà enregistrée.',
            REGISTRATION_CANCELLED: "L'enregistrement de la clé de sécurité a été annulé.",
            AUTH_CANCELLED: "L'authentification a été annulée.",
            UNKNOWN_ERROR: 'Une erreur inconnue est survenue.',
            SESSION_REQUIRED: 'Vous devez être connecté pour effectuer cette action.',
            RESOLVE_USER_REQUIRED: "Impossible d'identifier l'utilisateur associé à cette clé.",
            RESOLVED_USER_INVALID: "L'utilisateur associé à cette clé de sécurité est invalide.",
            OTP_NOT_ENABLED: "L'authentification par code OTP n'est pas activée.",
            OTP_HAS_EXPIRED: 'Le code OTP a expiré. Veuillez demander un nouveau code.',
            TOTP_NOT_ENABLED: "L'authentification TOTP n'est pas activée.",
            TWO_FACTOR_NOT_ENABLED: "L'authentification à deux facteurs n'est pas activée.",
            BACKUP_CODES_NOT_ENABLED: 'Les codes de secours ne sont pas activés.',
            INVALID_BACKUP_CODE: 'Le code de secours est invalide.',
            INVALID_CODE: 'Le code saisi est invalide.',
            TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
              'Trop de tentatives échouées. Veuillez demander un nouveau code.',
            INVALID_TWO_FACTOR_COOKIE:
              'La session de vérification à deux facteurs est invalide ou expirée.',
          },
        },
      }),
      lastLoginMethod({
        storeInDatabase: true,
      }),
    ],
    trustedOrigins: process.env.TRUSTED_ORIGINS ? process.env.TRUSTED_ORIGINS.split(',') : [],
  });
};
