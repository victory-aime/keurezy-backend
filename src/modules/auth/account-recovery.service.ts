import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { HttpError } from '../../config/http.error';
import { OTP_SETTINGS } from '../../config/otp';
import { consumeOneTimeCode, issueOneTimeCode, sha256 } from '../../config/one-time-code';
import { getAuthInstance } from '../../lib/auth';
import { ResendService } from '../mail/resend.service';

/** Délai de grâce entre la demande de récupération et la désactivation de la 2FA. */
export const RECOVERY_DELAY_HOURS = 48;

const CODE_PREFIX = 'RECOVERY_CODE';
const codeIdentifier = (userId: string) => `recovery-${userId}`;

const formatDateTime = (date: Date) =>
  date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Récupération d'un compte dont la 2FA est perdue (téléphone et codes de secours) :
 * mot de passe, puis code envoyé à l'e-mail du compte, puis délai de 48 h pendant lequel le
 * titulaire peut annuler (lien reçu, ou n'importe quelle connexion réussie). Un cron exécute
 * ensuite la désactivation de la 2FA. Plus lent qu'une connexion : jamais une porte d'entrée.
 */
@Injectable()
export class AccountRecoveryService {
  private readonly logger = new Logger(AccountRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resendService: ResendService,
  ) {}

  /** Compte identifié par e-mail et mot de passe, 2FA active ; erreur identique sinon. */
  private async authenticate(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: {
        id: true,
        name: true,
        email: true,
        twoFactorEnabled: true,
        accounts: { where: { providerId: 'credential' }, select: { password: true } },
      },
    });
    const { password: hasher } = await getAuthInstance().$context;
    const hash = user?.accounts[0]?.password;
    // Même travail avec ou sans compte : le temps de réponse ne révèle pas les inscrits
    const valid = hash ? await hasher.verify({ hash, password }) : !(await hasher.hash(password));
    if (!user || !valid) {
      throw new HttpError(
        'E-mail ou mot de passe incorrect.',
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
      );
    }
    if (!user.twoFactorEnabled) {
      throw new HttpError(
        "La double authentification n'est pas active sur ce compte : connectez-vous normalement.",
        HttpStatus.BAD_REQUEST,
        'TWO_FACTOR_NOT_ENABLED',
      );
    }
    return user;
  }

  /** Étape 1 : identifiants vérifiés, code envoyé à l'adresse du compte. */
  async requestRecovery(email: string, password: string) {
    const user = await this.authenticate(email, password);
    const code = await issueOneTimeCode(
      this.prisma,
      codeIdentifier(user.id),
      CODE_PREFIX,
      OTP_SETTINGS,
    );
    await this.resendService.sendVerificationOTP(user.email, code, 'account-recovery');
    return { expiresIn: OTP_SETTINGS.expiresIn, retryIn: OTP_SETTINGS.resendCooldown };
  }

  /**
   * Étape 2 : code valide → demande programmée dans RECOVERY_DELAY_HOURS. Une demande déjà
   * en cours garde sa date (pas de nouveau lien d'annulation).
   */
  async confirmRecovery(email: string, password: string, code: string) {
    const user = await this.authenticate(email, password);
    await consumeOneTimeCode(this.prisma, codeIdentifier(user.id), code, CODE_PREFIX);

    const pending = await this.prisma.accountRecoveryRequest.findFirst({
      where: { userId: user.id, status: 'PENDING' },
      select: { executeAt: true },
    });
    if (pending) return { executeAt: pending.executeAt };

    const cancelToken = randomBytes(32).toString('base64url');
    const executeAt = new Date(Date.now() + RECOVERY_DELAY_HOURS * 3_600_000);
    await this.prisma.accountRecoveryRequest.create({
      data: { userId: user.id, executeAt, cancelTokenHash: sha256(cancelToken) },
    });
    await this.resendService.sendAccountRecoveryRequested({
      sendTo: user.email,
      username: user.name,
      executeAt: formatDateTime(executeAt),
      cancelLink: `${process.env.WEB_APP_URL}/auth/two-factor-recovery/cancel?token=${cancelToken}`,
    });
    return { executeAt };
  }

  /** Lien « Ce n'est pas moi » : annule la demande en attente. Réponse neutre. */
  async cancelRecovery(token: string) {
    await this.prisma.accountRecoveryRequest.updateMany({
      where: { cancelTokenHash: sha256(token), status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    return { message: 'Si une demande était en cours, elle est annulée.' };
  }

  /** Chaque heure : désactive la 2FA des demandes échues et ferme les sessions. */
  @Cron(CronExpression.EVERY_HOUR)
  async executeDueRecoveries() {
    const due = await this.prisma.accountRecoveryRequest.findMany({
      where: { status: 'PENDING', executeAt: { lte: new Date() } },
      select: { id: true, user: { select: { id: true, name: true, email: true } } },
    });
    for (const request of due) {
      const { user } = request;
      try {
        await this.prisma.$transaction([
          this.prisma.twoFactor.deleteMany({ where: { userId: user.id } }),
          this.prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false } }),
          this.prisma.session.deleteMany({ where: { userId: user.id } }),
          this.prisma.accountRecoveryRequest.update({
            where: { id: request.id },
            data: { status: 'COMPLETED' },
          }),
        ]);
        await this.resendService.sendAccountRecoveryCompleted({
          sendTo: user.email,
          username: user.name,
          loginLink: `${process.env.WEB_APP_URL}/auth/signin`,
        });
      } catch (error) {
        this.logger.error(`Récupération ${request.id} échouée`, error as Error);
      }
    }
  }
}
