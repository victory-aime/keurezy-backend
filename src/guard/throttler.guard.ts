import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

interface TrackedRequest {
  session?: { user?: { id?: string } };
  ips?: string[];
  ip?: string;
}

/**
 * Limite le débit par utilisateur connecté plutôt que par IP.
 * Derrière le load balancer Render et le rewrite Next.js, de nombreux utilisateurs partagent
 * la même IP apparente : un suivi par IP seule les ferait tous tomber sous le même quota.
 * Les requêtes anonymes restent suivies par IP (X-Forwarded-For via `trust proxy`).
 */
@Injectable()
export class SessionThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const { session, ips, ip } = req as TrackedRequest;
    const userId = session?.user?.id;
    if (userId) return Promise.resolve(`user:${userId}`);

    return Promise.resolve(`ip:${ips?.length ? ips[0] : ip}`);
  }
}
