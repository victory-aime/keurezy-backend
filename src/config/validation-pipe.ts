import { ValidationPipe } from '@nestjs/common';

/**
 * Pipe de validation global.
 * - whitelist : supprime toute propriété non déclarée dans le DTO (protection mass-assignment).
 * - pas de forbidNonWhitelisted : les clients existants envoient encore des champs ignorés
 *   (ex. userId, remplacé côté serveur par la session) sans que la requête soit rejetée.
 */
export const createValidationPipe = () =>
  new ValidationPipe({
    transform: true,
    whitelist: true,
  });
