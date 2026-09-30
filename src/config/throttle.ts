import { timingSafeEqual } from 'node:crypto';

/**
 * Limites de débit (ttl en millisecondes, @nestjs/throttler v6). `burst` et `sustained`
 * s'appliquent à toutes les routes, par utilisateur connecté ou par IP ; `sensitive` resserre
 * les routes publiques exposées au brute force (mot de passe oublié, codes OTP, invitation).
 */
export const THROTTLE = {
  burst: { ttl: 1_000, limit: 20 },
  sustained: { ttl: 60_000, limit: 300 },
  sensitive: { ttl: 60_000, limit: 5 },
} as const;

/** À poser sur une route publique sensible : `@Throttle(SENSITIVE_THROTTLE)`. */
export const SENSITIVE_THROTTLE = { sustained: THROTTLE.sensitive };

/**
 * En-têtes de l'IP cliente. Le proxy Next transmet `CLIENT_IP` accompagné du secret partagé ;
 * le middleware du backend écrit l'IP retenue dans `RESOLVED_IP`, lu par le throttler et
 * Better Auth. Toute valeur envoyée par le client pour ces en-têtes est ignorée ou écrasée.
 */
export const IP_HEADERS = {
  CLIENT_IP: 'x-keurezy-client-ip',
  PROXY_SECRET: 'x-keurezy-proxy-secret',
  RESOLVED_IP: 'x-keurezy-resolved-ip',
} as const;

interface IpRequest {
  headers: Record<string, string | string[] | undefined>;
  /** Calculée par Express selon `trust proxy` (nombre de proxys de confiance) */
  ip?: string;
}

const header = (req: IpRequest, name: string) => {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

const sameSecret = (received: string, expected: string) => {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * IP cliente non falsifiable. Via le proxy Next (secret valide), on garde l'IP qu'il a
 * transmise ; sinon `req.ip`, qu'Express lit dans X-Forwarded-For en ne faisant confiance
 * qu'aux `TRUST_PROXY_HOPS` derniers proxys. L'entrée la plus à gauche, que le client peut
 * écrire, n'est jamais utilisée seule.
 */
export function resolveClientIp(
  req: IpRequest,
  proxySecret = process.env.INTERNAL_PROXY_SECRET,
): string {
  const forwarded = header(req, IP_HEADERS.CLIENT_IP);
  const secret = header(req, IP_HEADERS.PROXY_SECRET);
  if (proxySecret && forwarded && secret && sameSecret(secret, proxySecret)) {
    return forwarded.trim();
  }
  return req.ip ?? 'unknown';
}
