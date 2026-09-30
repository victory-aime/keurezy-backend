const authApi = {
  requestPasswordResetEmailOTP: jest.fn(),
  checkVerificationOTP: jest.fn(),
  resetPasswordEmailOTP: jest.fn(),
  verifyEmailOTP: jest.fn(),
  sendVerificationEmail: jest.fn(),
};

jest.mock('../../lib/auth', () => ({ getAuthInstance: () => ({ api: authApi }) }));
jest.mock('../users/users.service', () => ({ UsersService: jest.fn() }));

import { AuthService } from './auth.service';
import { HttpError } from '../../config/http.error';

const betterAuthError = (code: string) => Object.assign(new Error(code), { body: { code } });

const errorOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  return null;
};

describe('AuthService — mot de passe oublié par code OTP', () => {
  const prisma = { verification: { findFirst: jest.fn() } };
  const service = new AuthService({} as never, prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('envoie un code et répond sans révéler si le compte existe', async () => {
    prisma.verification.findFirst.mockResolvedValue(null);

    const result = await service.requestPasswordResetOtp('Awa@Example.com');

    expect(authApi.requestPasswordResetEmailOTP).toHaveBeenCalledWith({
      body: { email: 'awa@example.com' },
    });
    expect(result.message).toContain('Si un compte existe');
    expect(result.otp).toEqual({ expireOtp: 180, retryIn: 120 });
  });

  it('ne renvoie pas de code pendant le délai de 2 minutes, avec la même réponse', async () => {
    prisma.verification.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 30_000) });

    const result = await service.requestPasswordResetOtp('awa@example.com');

    expect(authApi.requestPasswordResetEmailOTP).not.toHaveBeenCalled();
    expect(result.message).toContain('Si un compte existe');
  });

  it('traduit les refus du code et masque un email inconnu', async () => {
    authApi.checkVerificationOTP.mockRejectedValueOnce(betterAuthError('OTP_EXPIRED'));
    const expired = (await errorOf(
      service.verifyPasswordResetOtp({ email: 'awa@example.com', otp: '123456' }),
    )) as HttpError;
    expect(expired).toBeInstanceOf(HttpError);
    expect(expired.message).toContain('expiré');

    authApi.checkVerificationOTP.mockRejectedValueOnce(betterAuthError('USER_NOT_FOUND'));
    const unknown = (await errorOf(
      service.verifyPasswordResetOtp({ email: 'inconnu@example.com', otp: '123456' }),
    )) as HttpError;
    expect((unknown.getResponse() as { errorCode: string }).errorCode).toBe('INVALID_OTP');
  });

  it('change le mot de passe avec le code', async () => {
    authApi.resetPasswordEmailOTP.mockResolvedValue({ success: true });

    await service.resetPasswordWithOtp({
      email: 'Awa@Example.com',
      otp: '123456',
      newPassword: 'NouveauMotDePasse2026',
    });

    expect(authApi.resetPasswordEmailOTP).toHaveBeenCalledWith({
      body: { email: 'awa@example.com', otp: '123456', password: 'NouveauMotDePasse2026' },
    });
  });
});

describe('AuthService — renvoi du lien de vérification', () => {
  const usersService = { findUser: jest.fn() };
  const service = new AuthService(usersService as never, {} as never);

  it('répond pareil pour un compte inconnu, déjà vérifié ou à vérifier', async () => {
    const accounts = [null, { emailVerified: true }, { emailVerified: false }];
    const messages: string[] = [];
    for (const account of accounts) {
      usersService.findUser.mockResolvedValue(account);
      messages.push((await service.sendVerificationEmail({ email: 'awa@example.com' })).message);
    }

    expect(new Set(messages).size).toBe(1);
    // Seul le compte existant non vérifié déclenche un envoi
    expect(authApi.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });
});
