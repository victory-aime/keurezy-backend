import { HttpError } from '../../config/http.error';
import { CHAT_LIMITS, sanitizeFileName, validateChatFiles } from './chat-files';
import { AttachmentKind } from '../../../prisma/generated/enums';

const PDF = Buffer.from('%PDF-1.7 contenu');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const M4A = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A ')]);
const EXE = Buffer.from('MZ\x90\x00 exécutable');

const file = (mimetype: string, buffer: Buffer, size = buffer.length, originalname = 'fichier') =>
  ({ mimetype, buffer, size, originalname }) as Express.Multer.File;

const errorCode = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return ((error as HttpError).getResponse() as { errorCode: string }).errorCode;
  }
  return null;
};

describe('validateChatFiles', () => {
  it('accepte 1 puis 3 pièces jointes PDF / JPG / PNG', () => {
    expect(validateChatFiles([file('application/pdf', PDF, PDF.length, 'bail.pdf')])).toHaveLength(
      1,
    );

    const three = validateChatFiles([
      file('application/pdf', PDF),
      file('image/png', PNG),
      file('image/jpeg', JPEG),
    ]);
    expect(three.map((f) => f.kind)).toEqual([
      AttachmentKind.DOCUMENT,
      AttachmentKind.IMAGE,
      AttachmentKind.IMAGE,
    ]);
    expect(three.map((f) => f.resourceType)).toEqual(['raw', 'image', 'image']);
  });

  it('refuse un 4e fichier', () => {
    const four = Array.from({ length: 4 }, () => file('image/png', PNG));
    expect(errorCode(() => validateChatFiles(four))).toBe('CHAT_TOO_MANY_FILES');
  });

  it('refuse un fichier de plus de 2 Mo', () => {
    const big = file('application/pdf', PDF, CHAT_LIMITS.MAX_FILE_SIZE + 1);
    expect(errorCode(() => validateChatFiles([big]))).toBe('CHAT_FILE_TOO_LARGE');
  });

  it('refuse un type non autorisé', () => {
    expect(errorCode(() => validateChatFiles([file('application/zip', PDF)]))).toBe(
      'CHAT_FILE_TYPE_NOT_ALLOWED',
    );
  });

  it('refuse un exécutable déguisé en PDF (signature binaire)', () => {
    expect(errorCode(() => validateChatFiles([file('application/pdf', EXE)]))).toBe(
      'CHAT_FILE_TYPE_NOT_ALLOWED',
    );
  });

  it('accepte une note vocale seule de 2 minutes maximum', () => {
    const [voice] = validateChatFiles([file('audio/m4a', M4A)], 45_000);
    expect(voice.kind).toBe(AttachmentKind.AUDIO);
    expect(voice.resourceType).toBe('video');
  });

  it('refuse une note vocale trop longue, sans durée, ou accompagnée', () => {
    expect(errorCode(() => validateChatFiles([file('audio/m4a', M4A)], 120_001))).toBe(
      'CHAT_VOICE_TOO_LONG',
    );
    expect(errorCode(() => validateChatFiles([file('audio/m4a', M4A)]))).toBe(
      'CHAT_VOICE_TOO_LONG',
    );
    expect(
      errorCode(() => validateChatFiles([file('audio/m4a', M4A), file('image/png', PNG)], 5000)),
    ).toBe('CHAT_VOICE_NOT_ALONE');
  });

  it('nettoie le nom affiché', () => {
    expect(sanitizeFileName('../../etc/passwd<>.pdf', 'pdf')).toBe('passwd.pdf');
    expect(sanitizeFileName('', 'png')).toBe('fichier.png');
  });
});
