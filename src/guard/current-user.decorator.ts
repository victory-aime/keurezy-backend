import {
  createParamDecorator,
  ExecutionContext,
  HttpStatus,
  Injectable,
  PipeTransform,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { HttpError } from '../config/http.error';

/**
 * Identité de l'appelant, lue exclusivement depuis la session Better Auth.
 * Tout `userId` envoyé par le client (query / body) doit être ignoré au profit de celui-ci.
 */
export const CurrentUserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<{ session?: { user?: { id?: string } } }>();
  const userId = request.session?.user?.id;

  if (!userId) {
    throw new UnauthorizedException('Session invalide ou expirée.');
  }

  return userId;
});

/**
 * Résout l'identifiant du profil agence (Owner.id ou Staff.id actif) de l'utilisateur connecté.
 * C'est l'identifiant attendu par AgencyService.agencyAccessControl.
 */
@Injectable()
export class AgencyProfileIdPipe implements PipeTransform<string, Promise<string>> {
  constructor(private readonly prisma: PrismaService) {}

  async transform(userId: string): Promise<string> {
    const [owner, staff] = await Promise.all([
      this.prisma.owner.findUnique({ where: { userId }, select: { id: true } }),
      this.prisma.staff.findUnique({ where: { userId }, select: { id: true, isActive: true } }),
    ]);

    const profileId = owner?.id ?? (staff?.isActive ? staff.id : undefined);

    if (!profileId) {
      throw new HttpError(
        'Accès refusé à cette agence',
        HttpStatus.FORBIDDEN,
        'AGENCY_ACCESS_DENIED',
      );
    }

    return profileId;
  }
}

/** Identifiant du profil agence (Owner ou Staff actif) de l'utilisateur connecté. */
export const AgencyProfileId = () => CurrentUserId(AgencyProfileIdPipe);
