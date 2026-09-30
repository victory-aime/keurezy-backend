import { CanActivate, ExecutionContext, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service';
import { HttpError } from '../config/http.error';
import { Role, SubscriptionStatus } from '../../prisma/generated/enums';

const ALLOW_WHEN_INACTIVE_KEY = 'allow_when_inactive';

/**
 * Route d'écriture autorisée quand l'abonnement de l'agence a expiré : on peut encore clôturer,
 * sécuriser et communiquer (répondre aux clients, annuler, retirer un accès), pas produire.
 */
export const AllowWhenInactive = () => SetMetadata(ALLOW_WHEN_INACTIVE_KEY, true);

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const AGENCY_ROLES = new Set<string>([Role.OWNER, Role.AGENT]);

/**
 * Tableau de bord en lecture seule quand l'abonnement de l'agence est INACTIVE (expiré ou résilié).
 *
 * Refus par défaut : toute écriture d'un owner ou d'un membre du staff est bloquée
 * (`403 SUBSCRIPTION_INACTIVE`), sauf sur les routes marquées `@AllowWhenInactive()`.
 * Les clients mobiles, le super admin et les routes anonymes ne sont pas concernés.
 * Une agence sans souscription n'est pas bloquée ici (les quotas la refusent déjà).
 */
@Injectable()
export class ActiveSubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      session?: { user?: { id?: string; role?: string } };
    }>();
    const user = request.session?.user;

    if (!WRITE_METHODS.has(request.method) || !user?.id || !AGENCY_ROLES.has(user.role ?? '')) {
      return true;
    }

    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_WHEN_INACTIVE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed) return true;

    // ponytail: une requête par écriture d'un utilisateur d'agence ; cache court si ça se voit
    const agency = { select: { subscriptions: { select: { status: true } } } };
    const profile =
      user.role === Role.OWNER
        ? await this.prisma.owner.findUnique({ where: { userId: user.id }, select: { agency } })
        : await this.prisma.staff.findUnique({ where: { userId: user.id }, select: { agency } });

    const subscription = profile?.agency?.subscriptions[0];
    if (subscription?.status === SubscriptionStatus.INACTIVE) {
      throw new HttpError(
        'Votre abonnement a expiré : le tableau de bord est en lecture seule.',
        HttpStatus.FORBIDDEN,
        'SUBSCRIPTION_INACTIVE',
      );
    }
    return true;
  }
}
