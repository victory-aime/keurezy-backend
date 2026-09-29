import { InvitationService } from './invitation.service';
import { HttpError } from '../../config/http.error';

// Dépendances mockées : évite de charger Better Auth (ESM) dans Jest
jest.mock('../../lib/auth', () => ({ getAuthInstance: jest.fn() }));
jest.mock('../agency/agency.service', () => ({ AgencyService: class {} }));
jest.mock('../mail/resend.service', () => ({ ResendService: class {} }));
// Chiffrement neutre : la clé vient de l'environnement, absente en test
jest.mock('../../config/crypto', () => ({
  encryptPassword: (value: string) => `enc:${value}`,
  decryptPassword: (value: string) => value.replace(/^enc:/, ''),
}));

const errorCodeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: HttpError) => (error.getResponse() as { errorCode: string }).errorCode,
  );

describe('InvitationService.resendInvitation', () => {
  const prisma = { invitation: { findUnique: jest.fn(), update: jest.fn() } };
  const resend = { sendInvitationEmail: jest.fn() };
  const agencyService = { agencyAccessControl: jest.fn() };
  const service = new InvitationService(
    prisma as never,
    resend as never,
    agencyService as never,
    {} as never,
  );

  const invitation = (overrides: Record<string, unknown> = {}) => ({
    id: 'inv-1',
    agencyId: 'A',
    email: 'awa@example.com',
    name: 'Awa',
    token: 'tok',
    status: 'PENDING',
    temporaryPassword: 'enc:Secret#1',
    agency: { name: 'Agence' },
    ...overrides,
  });

  beforeEach(() => jest.resetAllMocks());

  it("refuse de renvoyer une invitation qui n'est plus en attente", async () => {
    prisma.invitation.findUnique.mockResolvedValue(invitation({ status: 'CANCELLED' }));
    await expect(errorCodeOf(service.resendInvitation('inv-1', 'owner-1'))).resolves.toBe(
      'INVITATION_NOT_PENDING',
    );
    expect(resend.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('prolonge l’invitation et renvoie l’e-mail avec le même mot de passe', async () => {
    prisma.invitation.findUnique.mockResolvedValue(invitation());

    await service.resendInvitation('inv-1', 'owner-1');

    expect(agencyService.agencyAccessControl).toHaveBeenCalledWith('A', 'owner-1');
    const { data } = prisma.invitation.update.mock.calls[0][0] as { data: { expiresAt: Date } };
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600_000);
    expect(resend.sendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ sendTo: 'awa@example.com', password: 'Secret#1', token: 'tok' }),
    );
  });
});
