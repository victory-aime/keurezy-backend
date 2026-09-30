const hasher = { hash: jest.fn(), verify: jest.fn() };
jest.mock('../../lib/auth', () => ({
  getAuthInstance: () => ({ $context: Promise.resolve({ password: hasher }) }),
}));
jest.mock('../mail/resend.service', () => ({ ResendService: class {} }));

import { AccountRecoveryService, RECOVERY_DELAY_HOURS } from './account-recovery.service';
import { HttpError } from '../../config/http.error';
import { encodeStoredCode, sha256 } from '../../config/one-time-code';

const errorCodeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: HttpError) => (error.getResponse() as { errorCode: string }).errorCode,
  );

describe('AccountRecoveryService', () => {
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    verification: {
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    accountRecoveryRequest: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    twoFactor: { deleteMany: jest.fn() },
    session: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const resend = {
    sendVerificationOTP: jest.fn(),
    sendAccountRecoveryRequested: jest.fn(),
    sendAccountRecoveryCompleted: jest.fn(),
  };
  const service = new AccountRecoveryService(prisma as never, resend as never);

  const account = (overrides = {}) => ({
    id: 'u1',
    name: 'Awa',
    email: 'awa@example.com',
    twoFactorEnabled: true,
    accounts: [{ password: 'hash' }],
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    hasher.hash.mockResolvedValue('dummy');
    prisma.verification.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('refuse des identifiants faux avec la même erreur qu’un compte inconnu', async () => {
    prisma.user.findUnique.mockResolvedValue(account());
    hasher.verify.mockResolvedValue(false);
    expect(await errorCodeOf(service.requestRecovery('awa@example.com', 'faux'))).toBe(
      'INVALID_CREDENTIALS',
    );

    prisma.user.findUnique.mockResolvedValue(null);
    expect(await errorCodeOf(service.requestRecovery('inconnu@example.com', 'x'))).toBe(
      'INVALID_CREDENTIALS',
    );
    // Travail de hachage fait aussi pour un compte inconnu (temps de réponse comparable)
    expect(hasher.hash).toHaveBeenCalled();
    expect(resend.sendVerificationOTP).not.toHaveBeenCalled();
  });

  it('envoie un code haché quand les identifiants sont bons et la 2FA active', async () => {
    prisma.user.findUnique.mockResolvedValue(account());
    hasher.verify.mockResolvedValue(true);
    prisma.verification.findFirst.mockResolvedValue(null);

    await service.requestRecovery('awa@example.com', 'bon');

    const code = resend.sendVerificationOTP.mock.calls[0][1];
    const stored = prisma.verification.create.mock.calls[0][0].data;
    expect(stored.identifier).toBe('recovery-u1');
    expect(stored.value).not.toContain(code);
  });

  it('refuse un compte sans 2FA', async () => {
    prisma.user.findUnique.mockResolvedValue(account({ twoFactorEnabled: false }));
    hasher.verify.mockResolvedValue(true);
    expect(await errorCodeOf(service.requestRecovery('awa@example.com', 'bon'))).toBe(
      'TWO_FACTOR_NOT_ENABLED',
    );
  });

  it('programme la récupération dans 72 h et envoie un lien d’annulation (jeton haché)', async () => {
    prisma.user.findUnique.mockResolvedValue(account());
    hasher.verify.mockResolvedValue(true);
    prisma.verification.findFirst.mockResolvedValue({
      id: 'v1',
      value: encodeStoredCode('482913'),
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.accountRecoveryRequest.findFirst.mockResolvedValue(null);

    const { executeAt } = await service.confirmRecovery('awa@example.com', 'bon', '482913');

    expect(Math.round((executeAt.getTime() - Date.now()) / 3_600_000)).toBe(RECOVERY_DELAY_HOURS);
    const { cancelLink } = resend.sendAccountRecoveryRequested.mock.calls[0][0];
    const token = new URL(cancelLink, 'http://x').searchParams.get('token')!;
    const created = prisma.accountRecoveryRequest.create.mock.calls[0][0].data;
    expect(created.cancelTokenHash).toBe(sha256(token));
    expect(created.cancelTokenHash).not.toBe(token);
  });

  it('refuse un code faux sans créer de demande', async () => {
    prisma.user.findUnique.mockResolvedValue(account());
    hasher.verify.mockResolvedValue(true);
    prisma.verification.findFirst.mockResolvedValue({
      id: 'v1',
      value: encodeStoredCode('482913'),
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await errorCodeOf(service.confirmRecovery('awa@example.com', 'bon', '000000'))).toBe(
      'RECOVERY_CODE_INVALID',
    );
    expect(prisma.accountRecoveryRequest.create).not.toHaveBeenCalled();
  });

  it('annule par le jeton reçu (comparé par empreinte)', async () => {
    await service.cancelRecovery('jeton');
    expect(prisma.accountRecoveryRequest.updateMany).toHaveBeenCalledWith({
      where: { cancelTokenHash: sha256('jeton'), status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
  });

  it('le cron désactive la 2FA des demandes échues et ferme les sessions', async () => {
    prisma.accountRecoveryRequest.findMany.mockResolvedValue([
      { id: 'r1', user: { id: 'u1', name: 'Awa', email: 'awa@example.com' } },
    ]);
    prisma.$transaction.mockResolvedValue([]);

    await service.executeDueRecoveries();

    expect(prisma.twoFactor.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { twoFactorEnabled: false },
    });
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(resend.sendAccountRecoveryCompleted).toHaveBeenCalled();
  });
});
