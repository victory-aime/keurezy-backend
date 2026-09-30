import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { IP_HEADERS } from '../config/throttle';

interface TrackedRequest {
  session?: { user?: { id?: string } };
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

/**
 * Limite le débit par utilisateur connecté, sinon par IP cliente. Cette IP est résolue par le
 * middleware de `main.ts` (`resolveClientIp`) : jamais l'entrée de X-Forwarded-For écrite par
 * le client, qui permettrait de changer de compteur à chaque requête.
 */
@Injectable()
export class SessionThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const { session, headers, ip } = req as TrackedRequest;
    const userId = session?.user?.id;
    if (userId) return Promise.resolve(`user:${userId}`);

    return Promise.resolve(`ip:${headers[IP_HEADERS.RESOLVED_IP] ?? ip}`);
  }
}
