import { HttpStatus } from '@nestjs/common';
import { HttpError } from './http.error';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Codes à usage unique envoyés par e-mail (invitation, récupération de compte) : générés par un
 * tirage cryptographique, stockés hachés dans `verification`, comparés en temps constant.
 */

/** Essais autorisés par code avant de devoir en redemander un. */
export const ONE_TIME_CODE_MAX_ATTEMPTS = 5;

/** Code à 6 chiffres, tiré par un générateur cryptographique. */
export const generateOneTimeCode = () => randomInt(0, 1_000_000).toString().padStart(6, '0');

/** Empreinte SHA-256 (codes, jetons d'annulation) : seule l'empreinte est stockée. */
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Valeur stockée : empreinte du code (jamais le code en clair) et nombre d'essais. */
export const encodeStoredCode = (code: string, attempts = 0) => `${sha256(code)}:${attempts}`;

/**
 * Compare un code saisi à la valeur stockée, en temps constant.
 * `attempts` : essais déjà consommés avant celui-ci.
 */
export function checkStoredCode(stored: string, code: string) {
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

/** Accès minimal à la table `verification` (client Prisma ou transaction). */
interface VerificationStore {
  verification: {
    findFirst(args: object): Promise<{
      id: string;
      value: string;
      expiresAt: Date;
      createdAt: Date;
    } | null>;
    deleteMany(args: object): Promise<unknown>;
    create(args: object): Promise<unknown>;
    update(args: object): Promise<unknown>;
  };
}

/**
 * Émet un nouveau code pour `identifier` (délai minimal entre deux envois, ancien code
 * remplacé) et renvoie le code en clair, à envoyer par e-mail uniquement.
 * `prefix` nomme les erreurs (ex. `INVITATION_CODE` → `INVITATION_CODE_TOO_SOON`).
 */
export async function issueOneTimeCode(
  store: VerificationStore,
  identifier: string,
  prefix: string,
  settings: { expiresIn: number; resendCooldown: number },
) {
  const previous = await store.verification.findFirst({
    where: { identifier },
    orderBy: { createdAt: 'desc' },
  });
  if (previous && Date.now() - previous.createdAt.getTime() < settings.resendCooldown * 1000) {
    throw new HttpError(
      'Un code vient d’être envoyé : patientez avant d’en demander un autre.',
      HttpStatus.TOO_MANY_REQUESTS,
      `${prefix}_TOO_SOON`,
    );
  }
  const code = generateOneTimeCode();
  await store.verification.deleteMany({ where: { identifier } });
  await store.verification.create({
    data: {
      identifier,
      value: encodeStoredCode(code),
      expiresAt: new Date(Date.now() + settings.expiresIn * 1000),
    },
  });
  return code;
}

/** Vérifie un code (ONE_TIME_CODE_MAX_ATTEMPTS essais), puis le consomme : usage unique. */
export async function consumeOneTimeCode(
  store: VerificationStore,
  identifier: string,
  code: string,
  prefix: string,
) {
  const stored = await store.verification.findFirst({ where: { identifier } });
  if (!stored || stored.expiresAt < new Date()) {
    throw new HttpError(
      'Code expiré : demandez-en un nouveau.',
      HttpStatus.BAD_REQUEST,
      `${prefix}_EXPIRED`,
    );
  }
  const { valid, attempts } = checkStoredCode(stored.value, code);
  if (!valid) {
    const used = attempts + 1;
    if (used >= ONE_TIME_CODE_MAX_ATTEMPTS) {
      await store.verification.deleteMany({ where: { id: stored.id } });
      throw new HttpError(
        'Trop d’essais : demandez un nouveau code.',
        HttpStatus.TOO_MANY_REQUESTS,
        `${prefix}_LOCKED`,
      );
    }
    await store.verification.update({
      where: { id: stored.id },
      data: { value: `${stored.value.split(':')[0]}:${used}` },
    });
    throw new HttpError(
      `Code incorrect : ${ONE_TIME_CODE_MAX_ATTEMPTS - used} essai(s) restant(s).`,
      HttpStatus.BAD_REQUEST,
      `${prefix}_INVALID`,
    );
  }
  // Consommation atomique : deux vérifications simultanées du même code (double envoi du
  // formulaire) lisent toutes deux le code, mais une seule peut le supprimer ; l'autre échoue
  // proprement au lieu d'une erreur 500.
  const { count } = (await store.verification.deleteMany({ where: { id: stored.id } })) as {
    count: number;
  };
  if (count === 0) {
    throw new HttpError(
      'Ce code a déjà été utilisé : demandez-en un nouveau.',
      HttpStatus.BAD_REQUEST,
      `${prefix}_EXPIRED`,
    );
  }
}
