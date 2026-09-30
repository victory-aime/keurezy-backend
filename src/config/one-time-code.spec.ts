import {
  consumeOneTimeCode,
  checkStoredCode,
  encodeStoredCode,
  generateOneTimeCode,
  maskEmail,
} from './one-time-code';

describe('one-time-code', () => {
  it('génère un code à 6 chiffres', () => {
    for (let i = 0; i < 20; i++) expect(generateOneTimeCode()).toMatch(/^\d{6}$/);
  });

  it('ne stocke que l’empreinte, et reconnaît le bon code', () => {
    const stored = encodeStoredCode('482913', 2);
    expect(stored).not.toContain('482913');
    expect(checkStoredCode(stored, '482913')).toEqual({ valid: true, attempts: 2 });
    expect(checkStoredCode(stored, '000000')).toEqual({ valid: false, attempts: 2 });
  });

  it('masque l’adresse e-mail', () => {
    expect(maskEmail('victory@gmail.com')).toBe('v*****y@gmail.com');
    expect(maskEmail('ab@x.sn')).toBe('a@x.sn');
  });
});

describe('consumeOneTimeCode', () => {
  const store = () => ({
    verification: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'v1',
        value: encodeStoredCode('482913'),
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      }),
      deleteMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  });
  const errorCode = (promise: Promise<unknown>) =>
    promise.then(
      () => null,
      (error: { getResponse: () => { errorCode: string } }) => error.getResponse().errorCode,
    );

  it('consomme le code une seule fois', async () => {
    const s = store();
    s.verification.deleteMany.mockResolvedValue({ count: 1 });
    await expect(consumeOneTimeCode(s, 'id', '482913', 'CODE')).resolves.toBeUndefined();
  });

  it('refuse proprement un second envoi simultané du même code (déjà consommé)', async () => {
    const s = store();
    s.verification.deleteMany.mockResolvedValue({ count: 0 });
    expect(await errorCode(consumeOneTimeCode(s, 'id', '482913', 'CODE'))).toBe('CODE_EXPIRED');
  });
});
