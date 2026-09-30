import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

/** Essais autorisés par code d'invitation avant de devoir en redemander un. */
export const INVITATION_CODE_MAX_ATTEMPTS = 5;

/** Identifiant du code dans la table `verification` (Better Auth) : lié à l'invitation. */
export const invitationCodeIdentifier = (invitationId: string) => `invitation-${invitationId}`;

/** Code à 6 chiffres, tiré par un générateur cryptographique. */
export const generateInvitationCode = () => randomInt(0, 1_000_000).toString().padStart(6, '0');

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Valeur stockée : empreinte du code (jamais le code en clair) et nombre d'essais. */
export const encodeStoredCode = (code: string, attempts = 0) => `${sha256(code)}:${attempts}`;

/**
 * Compare un code saisi à la valeur stockée, en temps constant.
 * `attempts` : essais déjà consommés avant celui-ci.
 */
export function checkInvitationCode(stored: string, code: string) {
  const [hash, attemptsRaw] = stored.split(':');
  const attempts = Number(attemptsRaw) || 0;
  const expected = Buffer.from(hash, 'hex');
  const received = Buffer.from(sha256(code), 'hex');
  const valid = expected.length === received.length && timingSafeEqual(expected, received);
  return { valid, attempts };
}

/** « victory@gmail.com » → « v*****y@gmail.com » : l'invité reconnaît son adresse sans l'exposer. */
export function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible =
    local.length <= 2 ? local[0] : `${local[0]}${'*'.repeat(local.length - 2)}${local.at(-1)}`;
  return `${visible}@${domain}`;
}
