// auth/guards/ws-better-auth.guard.ts
import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { getAuthInstance } from '../lib/auth'; // ← adapte le chemin vers ton fichier auth.ts

@Injectable()
export class WsBetterAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsBetterAuthGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();

    try {
      const rawHeaders = client.handshake.headers;

      const headers = new Headers();
      Object.entries(rawHeaders).forEach(([key, value]) => {
        if (typeof value === 'string') {
          headers.append(key, value);
        } else if (Array.isArray(value)) {
          value.forEach((v) => headers.append(key, v));
        }
      });

      // Debug temporaire — à retirer une fois confirmé
      this.logger.debug(`Cookie reçu: ${rawHeaders.cookie ? 'présent' : 'ABSENT'}`);

      const auth = getAuthInstance(); // singleton lazy, pas d'export direct `auth`
      const session = await auth.api.getSession({ headers });

      if (!session?.user?.id) {
        this.logger.warn(`Session introuvable — socketId: ${client.id}`);
        client.disconnect();
        return false;
      }

      client.data.userId = session.user.id;
      client.data.user = session.user;

      this.logger.log(`Session résolue — userId: ${session.user.id}`);
      return true;
    } catch (error) {
      this.logger.error(`Erreur résolution session WS: ${error}`);
      client.disconnect();
      return false;
    }
  }
}
