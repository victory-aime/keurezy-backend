import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { applyDecorators, SetMetadata } from '@nestjs/common';
import { BaseUserSession } from '@thallesp/nestjs-better-auth';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermission) return true;
    const staffOnly = this.reflector.getAllAndOverride<boolean>(STAFF_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const session = request.session as {
      user?: BaseUserSession['user'] & { role: string };
      session?: { token: string; permissions: any };
    };

    if (!session?.session?.token) throw new ForbiddenException('Non authentifié.');

    if (session.user?.role === 'OWNER') return true;

    // Route partagée avec les clients : la permission ne s'impose qu'au staff de l'agence ; le
    // service limite chacun à ses propres données (ses conversations, ses visites)
    if (staffOnly === true && session.user?.role !== STAFF_ROLE) return true;

    const permissions = (session.session.permissions ?? []) as { name?: string }[];
    const hasPermission = permissions.some((p) => p.name === requiredPermission);

    if (!hasPermission) {
      // Message générique : la permission requise n'est pas exposée au client
      throw new ForbiddenException('Accès non autorisé');
    }

    return true;
  }
}

const PERMISSION_KEY = 'required_permission';
const STAFF_ONLY_KEY = 'required_permission_staff_only';
/** Rôle des collaborateurs d'une agence (Role.AGENT) */
const STAFF_ROLE = 'AGENT';

/**
 * Permission exigée d'un collaborateur (l'owner les a toutes).
 * `staffOnly` : route aussi utilisée par les clients (messagerie, visites) ; seuls les
 * collaborateurs y sont contrôlés, les autres rôles passent et le service les limite.
 */
export const RequirePermission = (permission: string, options: { staffOnly?: boolean } = {}) =>
  applyDecorators(
    SetMetadata(PERMISSION_KEY, permission),
    SetMetadata(STAFF_ONLY_KEY, options.staffOnly === true),
  );
