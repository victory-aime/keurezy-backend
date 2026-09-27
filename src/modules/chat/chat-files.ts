import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import multer, { MulterError } from 'multer';
import { Observable } from 'rxjs';
import { AttachmentKind } from '../../../prisma/generated/enums';
import { HttpError } from '../../config/http.error';

/** Limites du chat : source de vérité unique côté serveur (le mobile et le web les reprennent). */
export const CHAT_LIMITS = {
  MAX_FILES: 3,
  MAX_FILE_SIZE: 2 * 1024 * 1024,
  MAX_VOICE_MS: 120_000,
  MAX_TEXT_LENGTH: 2000,
  FILES_FIELD: 'files',
} as const;

export type CloudinaryResourceType = 'image' | 'raw' | 'video';

interface AllowedType {
  kind: AttachmentKind;
  resourceType: CloudinaryResourceType;
  extension: string;
  /** Vérifie la signature binaire du fichier (le type MIME déclaré ne suffit pas). */
  matches: (buffer: Buffer) => boolean;
}

const startsWith = (buffer: Buffer, bytes: number[]) =>
  buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);

const isPdf = (b: Buffer) => startsWith(b, [0x25, 0x50, 0x44, 0x46]); // %PDF
const isJpeg = (b: Buffer) => startsWith(b, [0xff, 0xd8, 0xff]);
const isPng = (b: Buffer) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Conteneur MP4 / M4A : "ftyp" aux octets 4 à 7
const isMp4Container = (b: Buffer) => b.length >= 8 && b.toString('ascii', 4, 8) === 'ftyp';
// AAC brut (ADTS) : mot de synchronisation 0xFFF
const isAdts = (b: Buffer) => b.length >= 2 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0;

const PDF: AllowedType = {
  kind: AttachmentKind.DOCUMENT,
  resourceType: 'raw',
  extension: 'pdf',
  matches: isPdf,
};
const JPEG: AllowedType = {
  kind: AttachmentKind.IMAGE,
  resourceType: 'image',
  extension: 'jpg',
  matches: isJpeg,
};
const PNG: AllowedType = {
  kind: AttachmentKind.IMAGE,
  resourceType: 'image',
  extension: 'png',
  matches: isPng,
};
// Cloudinary range l'audio parmi les ressources « video »
const M4A: AllowedType = {
  kind: AttachmentKind.AUDIO,
  resourceType: 'video',
  extension: 'm4a',
  matches: isMp4Container,
};
const AAC: AllowedType = {
  kind: AttachmentKind.AUDIO,
  resourceType: 'video',
  extension: 'aac',
  matches: isAdts,
};

export const CHAT_ALLOWED_TYPES: Record<string, AllowedType> = {
  'application/pdf': PDF,
  'image/jpeg': JPEG,
  'image/jpg': JPEG,
  'image/png': PNG,
  'audio/mp4': M4A,
  'audio/m4a': M4A,
  'audio/x-m4a': M4A,
  'audio/aac': AAC,
};

export interface ValidatedChatFile {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  fileSize: number;
  kind: AttachmentKind;
  resourceType: CloudinaryResourceType;
  extension: string;
}

const tooMany = () =>
  new HttpError(
    `${CHAT_LIMITS.MAX_FILES} fichiers maximum par message`,
    HttpStatus.BAD_REQUEST,
    'CHAT_TOO_MANY_FILES',
  );
const tooLarge = () =>
  new HttpError(
    'Chaque fichier doit faire 2 Mo maximum',
    HttpStatus.BAD_REQUEST,
    'CHAT_FILE_TOO_LARGE',
  );
const notAllowed = () =>
  new HttpError(
    'Seuls les PDF, JPG, PNG et notes vocales sont acceptés',
    HttpStatus.BAD_REQUEST,
    'CHAT_FILE_TYPE_NOT_ALLOWED',
  );

/** Nom affichable : sans chemin ni caractères de contrôle, longueur bornée. */
export function sanitizeFileName(name: string, extension: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"|?*]/g, '')
    .trim()
    .slice(0, 120);
  return base || `fichier.${extension}`;
}

/**
 * Valide les fichiers d'un message : nombre, taille, type MIME en liste blanche,
 * signature binaire, et règles des notes vocales (seule, durée bornée).
 */
export function validateChatFiles(
  files: Express.Multer.File[],
  durationMs?: number,
): ValidatedChatFile[] {
  if (files.length > CHAT_LIMITS.MAX_FILES) throw tooMany();

  const validated = files.map((file) => {
    if (file.size > CHAT_LIMITS.MAX_FILE_SIZE) throw tooLarge();
    const type = CHAT_ALLOWED_TYPES[file.mimetype?.toLowerCase()];
    if (!type || !type.matches(file.buffer)) throw notAllowed();
    return {
      buffer: file.buffer,
      mimeType: file.mimetype.toLowerCase(),
      fileName: sanitizeFileName(file.originalname, type.extension),
      fileSize: file.size,
      kind: type.kind,
      resourceType: type.resourceType,
      extension: type.extension,
    };
  });

  const audio = validated.filter((file) => file.kind === AttachmentKind.AUDIO);
  if (audio.length) {
    if (validated.length > 1) {
      throw new HttpError(
        'Une note vocale s’envoie seule',
        HttpStatus.BAD_REQUEST,
        'CHAT_VOICE_NOT_ALONE',
      );
    }
    if (!durationMs || durationMs > CHAT_LIMITS.MAX_VOICE_MS) {
      throw new HttpError(
        'Une note vocale dure 2 minutes maximum',
        HttpStatus.BAD_REQUEST,
        'CHAT_VOICE_TOO_LONG',
      );
    }
  }

  return validated;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: CHAT_LIMITS.MAX_FILE_SIZE,
    files: CHAT_LIMITS.MAX_FILES,
    fields: 2,
    fieldSize: 16 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (CHAT_ALLOWED_TYPES[file.mimetype?.toLowerCase()]) callback(null, true);
    else callback(notAllowed());
  },
}).array(CHAT_LIMITS.FILES_FIELD, CHAT_LIMITS.MAX_FILES);

/**
 * Réception multipart des fichiers du chat. Multer coupe le flux dès qu'une limite
 * est dépassée ; ses erreurs sont traduites en codes explicites.
 */
@Injectable()
export class ChatFilesInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    await new Promise<void>((resolve, reject) =>
      upload(http.getRequest<Request>(), http.getResponse<Response>(), (error: unknown) => {
        if (!error) return resolve();
        if (error instanceof MulterError) {
          if (error.code === 'LIMIT_FILE_SIZE') return reject(tooLarge());
          if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
            return reject(tooMany());
          }
          return reject(
            new HttpError('Envoi invalide', HttpStatus.BAD_REQUEST, 'CHAT_UPLOAD_INVALID'),
          );
        }
        reject(error instanceof Error ? error : new Error('Réception des fichiers impossible'));
      }),
    );
    return next.handle();
  }
}
