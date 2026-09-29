import { InvitationService } from './invitation.service';
import { HttpError } from '../../config/http.error';

// Dépendances mockées : évite de charger Better Auth (ESM) dans Jest
const hashPassword = async (value: string) => `hash:${value}`;
jest.mock('../../lib/auth', () => ({
  getAuthInstance: () => ({ $context: Promise.resolve({ password: { hash: hashPassword } }) }),
}));
jest.mock('../agency/agency.service', () => ({ AgencyService: class {} }));
jest.mock('../mail/resend.service', () => ({ ResendService: class {} }));
// Chiffrement neutre : la clé vient de l'environnement, absente en test
jest.mock('../../config/crypto', () => ({
  encryptPassword: (value: string) => `enc:${value}`,
  decryptPassword: (value: string) => value.replace(/^enc:/, ''),
  generateTemporaryPassword: () => 'Nouveau#2',
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

  it('prolonge l’invitation et renvoie l’e-mail avec un nouveau mot de passe temporaire', async () => {
    prisma.invitation.findUnique.mockResolvedValue(invitation());

    await service.resendInvitation('inv-1', 'owner-1');

    expect(agencyService.agencyAccessControl).toHaveBeenCalledWith('A', 'owner-1');
    const { data } = prisma.invitation.update.mock.calls[0][0] as {
      data: { expiresAt: Date; temporaryPassword: string };
    };
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600_000);
    expect(data.temporaryPassword).toBe('enc:Nouveau#2');
    expect(resend.sendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ sendTo: 'awa@example.com', password: 'Nouveau#2', token: 'tok' }),
    );
  });
});

describe('InvitationService — réinvitation d’un compte désactivé', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    invitation: { findFirst: jest.fn(), deleteMany: jest.fn() },
  };
  const service = new InvitationService(prisma as never, {} as never, {} as never, {} as never);

  beforeEach(() => jest.resetAllMocks());

  it('accepte une adresse inconnue', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.assertInvitableEmail('new@example.com')).resolves.toBeUndefined();
  });

  it('refuse un compte actif (client, owner ou membre)', async () => {
    prisma.user.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      staff: null,
      owner: null,
      client: {},
    });
    await expect(errorCodeOf(service.assertInvitableEmail('awa@example.com'))).resolves.toBe(
      'USER_NOT_INVITABLE',
    );
  });

  it('refuse un compte désactivé encore rattaché à une équipe (à réactiver plutôt)', async () => {
    prisma.user.findUnique.mockResolvedValue({
      status: 'INACTIVE',
      staff: { id: 's' },
      owner: null,
      client: null,
    });
    await expect(errorCodeOf(service.assertInvitableEmail('awa@example.com'))).resolves.toBe(
      'USER_NOT_INVITABLE',
    );
  });

  it('accepte un ancien membre retiré et purge ses anciennes invitations', async () => {
    prisma.user.findUnique.mockResolvedValue({
      status: 'INACTIVE',
      staff: null,
      owner: null,
      client: null,
    });
    prisma.invitation.findFirst.mockResolvedValue(null);

    await service.assertInvitableEmail('awa@example.com');

    expect(prisma.invitation.deleteMany).toHaveBeenCalledWith({
      where: { email: 'awa@example.com', status: { not: 'PENDING' } },
    });
  });

  it('refuse une adresse qui a déjà une invitation en attente', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.invitation.findFirst.mockResolvedValue({ id: 'inv' });
    await expect(errorCodeOf(service.assertInvitableEmail('awa@example.com'))).resolves.toBe(
      'INVITATION_ALREADY_PENDING',
    );
  });
});

describe('InvitationService.acceptInvitation — compte existant', () => {
  const tx = {
    staff: { create: jest.fn() },
    staffPermission: { createMany: jest.fn() },
    user: { update: jest.fn() },
    account: { updateMany: jest.fn() },
    invitation: { update: jest.fn() },
  };
  const prisma = {
    invitation: { findUniqueOrThrow: jest.fn() },
    planFeature: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new InvitationService(prisma as never, {} as never, {} as never, {} as never);

  it('réactive le compte désactivé avec le mot de passe temporaire, sans en créer un nouveau', async () => {
    prisma.invitation.findUniqueOrThrow.mockResolvedValue({
      id: 'inv-1',
      email: 'awa@example.com',
      name: 'Awa',
      agencyId: 'A',
      agencyRole: 'AGENT',
      invitedBy: 'owner',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 3600_000),
      temporaryPassword: 'enc:Secret#1',
      permissions: [],
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-2', email: 'awa@example.com' });
    prisma.planFeature.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
    tx.staff.create.mockResolvedValue({ id: 'staff-new' });

    await service.acceptInvitation('tok');

    expect(tx.account.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-2', providerId: 'credential' },
      data: { password: 'hash:Secret#1' },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: { role: 'AGENT', status: 'ACTIVE' },
    });
    expect(tx.staff.create).toHaveBeenCalledWith({
      data: { userId: 'user-2', agencyId: 'A', agencyRole: 'AGENT' },
    });
  });
});
