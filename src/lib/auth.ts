import 'dotenv/config';
import { OTP_SETTINGS } from '../config/otp';
import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { APIError } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { EXPIRE_TIME } from '../config/enum';
import { twoFactor, emailOTP, lastLoginMethod } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { expo } from '@better-auth/expo';
import { authEmailBridge } from '../modules/auth/auth-email.bridge';
import { formatExpiresIn } from '../modules/mail/utils/getExpiresTime';
import { PrismaClient } from '../../prisma/generated/client';
import { customSession } from 'better-auth/plugins/custom-session';
import { i18n } from '@better-auth/i18n';
import { IP_HEADERS } from '../config/throttle';

let authInstance: ReturnType<typeof createAuth> | null = null;

/**
 * Initialise l'unique instance Better Auth avec le client Prisma fourni
 * (PrismaService dans l'application, client dédié dans les scripts de seed).
 */
export const initAuthInstance = (prisma: PrismaClient) => {
  authInstance ??= createAuth(prisma);
  return authInstance;
};

/** Instance Better Auth partagée ; initialisée au démarrage par BetterAuthModule. */
export const getAuthInstance = () => {
  if (!authInstance) {
    throw new Error('Better Auth non initialisé : BetterAuthModule doit être chargé');
  }
  return authInstance;
};

const createAuth = (prisma: PrismaClient) => {
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
      // IP résolue par le middleware de main.ts (non falsifiable) : limites et sessions
      ipAddress: { ipAddressHeaders: [IP_HEADERS.RESOLVED_IP] },
    },
    // Limiteur propre à Better Auth (/api/auth/* n'est pas couvert par le throttler Nest).
    // Actif en production ; en plus des règles par défaut (connexion, inscription), les codes
    // 2FA sont limités à 5 essais par minute et par IP.
    rateLimit: {
      window: 60,
      max: 100,
      customRules: {
        '/two-factor/verify-totp': { window: 60, max: 5 },
        '/two-factor/verify-backup-code': { window: 60, max: 5 },
        '/two-factor/enable': { window: 60, max: 5 },
        '/two-factor/disable': { window: 60, max: 5 },
      },
    },
    appName: process.env.APP_NAME,
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),
    databaseHooks: {
      session: {
        create: {
          // Aucune session pour un compte désactivé (membre désactivé ou retiré, agence fermée,
          // compte banni) : couvre mot de passe, passkey, 2FA et mobile. Sans ce contrôle, le
          // compte se reconnectait et seules les routes métier refusaient ensuite l'accès.
          before: async (session) => {
            const user = await prisma.user.findUnique({
              where: { id: session.userId },
              select: { status: true },
            });
            if (user && user.status !== 'ACTIVE') {
              throw new APIError('FORBIDDEN', {
                message: "Ce compte est désactivé. Contactez l'administrateur de votre agence.",
                code: 'ACCOUNT_DISABLED',
              });
            }
          },
          // Connexion réussie = le titulaire a encore accès à son compte : toute demande de
          // récupération (2FA perdue) en attente est annulée
          after: async (session) => {
            await prisma.accountRecoveryRequest.updateMany({
              where: { userId: session.userId, status: 'PENDING' },
              data: { status: 'CANCELLED' },
            });
          },
        },
      },
    },
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
      // Lien web et codes OTP (web ou mobile) : même validité configurable
      resetPasswordTokenExpiresIn: OTP_SETTINGS.expiresIn,
      sendResetPassword: async ({ user, token }) => {
        await authEmailBridge.sendResetPassword({
          name: user.name,
          email: user.email,
          url: `${process.env.FRONTEND_RESET_PASSWORD_URL}/?token=${token}`,
          expireTime: formatExpiresIn(OTP_SETTINGS.expiresIn),
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
        // Pas de skipVerificationOnEnable : la 2FA ne s'active qu'après un premier code valide
        // (verifyTotp), sinon un QR code mal scanné bloque le compte à la connexion suivante.
        // Verrouillage du compte après 5 codes faux consécutifs (15 min), quelle que soit l'IP :
        // aligné sur la limite de 5 essais par connexion de Better Auth, et complète la limite par
        // IP (5/min). Le web affiche alors le blocage, son décompte et la récupération de compte.
        accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 },
      }),
      passkey(),
      expo(),
      emailOTP({
        // Code à 6 chiffres ; validité configurable (OTP_EXPIRES_IN_SECONDS)
        otpLength: 6,
        expiresIn: OTP_SETTINGS.expiresIn,
        disableSignUp: true,
        allowedAttempts: 5,
        async sendVerificationOTP({ email, otp, type }) {
          if (type === 'email-verification' || type === 'forget-password') {
            await authEmailBridge.sendOTP({ email, otp, purpose: type });
          }
        },
      }),
      // Typé en BetterAuthPlugin : @better-auth/i18n embarque des types better-call non exportés
      // (TS4023 à la génération des .d.ts). Le plugin ne fait que traduire les erreurs, sans endpoint.
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
      }) as BetterAuthPlugin,
      lastLoginMethod({
        storeInDatabase: true,
      }),
    ],
    trustedOrigins: process.env.TRUSTED_ORIGINS ? process.env.TRUSTED_ORIGINS.split(',') : [],
  });
};
