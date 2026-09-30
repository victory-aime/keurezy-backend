import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import type { PrismaClient } from '../../../prisma/generated/client';

/** Cookie posé par le plugin twoFactor entre le mot de passe et le code (Better Auth 1.6.33). */
const TWO_FACTOR_COOKIE_NAME = 'two_factor';
/** Codes faux consécutifs avant verrouillage (`accountLockout` de `lib/auth.ts`). */
export const TWO_FACTOR_MAX_FAILED_ATTEMPTS = 5;

/**
 * `GET /api/auth/two-factor/status` : état de la vérification 2FA en cours, pour l'écran de code.
 *
 * - `lockedUntil` : fin du verrouillage du compte (`TwoFactor.lockedUntil`, posé par
 *   `accountLockout`). La base est la seule référence : le décompte affiché est le même quel que
 *   soit l'appareil, l'onglet ou la page d'où revient l'utilisateur.
 * - `remainingAttempts` : essais avant verrouillage (compteur `failedVerificationCount`).
 * - `recovery` : recours si l'utilisateur n'a plus de code. Un membre récupère son compte seul
 *   (`self`) ; l'owner, dont personne ne peut réinitialiser la 2FA, passe par le support.
 *
 * Accessible uniquement avec le cookie signé du défi 2FA, donc après un mot de passe correct :
 * rien n'est révélé à un anonyme. Sans défi valide (expiré, ou détruit après trop d'essais),
 * la réponse est 401 `INVALID_TWO_FACTOR_COOKIE`, comme les routes de vérification.
 */
export const twoFactorStatus = (prisma: PrismaClient) =>
  ({
    id: 'two-factor-status',
    endpoints: {
      twoFactorStatus: createAuthEndpoint('/two-factor/status', { method: 'GET' }, async (ctx) => {
        const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME);
        const challenge = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
        const verification = challenge
          ? await ctx.context.internalAdapter.findVerificationValue(challenge)
          : null;
        if (!verification || verification.expiresAt < new Date()) {
          throw new APIError('UNAUTHORIZED', {
            code: 'INVALID_TWO_FACTOR_COOKIE',
            message: 'Invalid two factor cookie',
          });
        }

        const user = await prisma.user.findUnique({
          where: { id: verification.value },
          select: {
            role: true,
            twoFactor: { select: { lockedUntil: true, failedVerificationCount: true } },
          },
        });
        const twoFactor = user?.twoFactor[0];
        const locked = twoFactor?.lockedUntil && twoFactor.lockedUntil > new Date();
        // Verrou échu : Better Auth remet le compteur à zéro au prochain essai
        const failed =
          twoFactor?.lockedUntil && !locked ? 0 : (twoFactor?.failedVerificationCount ?? 0);

        return ctx.json({
          lockedUntil: locked ? twoFactor.lockedUntil!.toISOString() : null,
          remainingAttempts: Math.max(0, TWO_FACTOR_MAX_FAILED_ATTEMPTS - failed),
          recovery: user?.role === 'OWNER' ? 'support' : 'self',
        });
      }),
    },
  }) satisfies BetterAuthPlugin;
