import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SetMetadata } from '@nestjs/common';
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

    const request = context.switchToHttp().getRequest();
    const session = request.session as {
      user?: BaseUserSession['user'] & { role: string };
      session?: { token: string; permissions: any };
    };

    if (!session?.session?.token) throw new ForbiddenException('Non authentifié.');

    if (session.user?.role === 'OWNER') return true;

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

export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);
