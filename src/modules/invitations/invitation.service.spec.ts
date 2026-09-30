import { InvitationService } from './invitation.service';
import { HttpError } from '../../config/http.error';
import { encodeStoredCode } from './invitation-code';

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

  it('prolonge l’invitation et renvoie le lien, sans aucun mot de passe', async () => {
    prisma.invitation.findUnique.mockResolvedValue(invitation());

    await service.resendInvitation('inv-1', 'owner-1');

    expect(agencyService.agencyAccessControl).toHaveBeenCalledWith('A', 'owner-1');
    const { data } = prisma.invitation.update.mock.calls[0][0] as { data: { expiresAt: Date } };
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600_000);
    expect(data).not.toHaveProperty('temporaryPassword');
    const email = resend.sendInvitationEmail.mock.calls[0][0];
    expect(email).toMatchObject({ sendTo: 'awa@example.com', token: 'tok' });
    expect(email).not.toHaveProperty('password');
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

describe('InvitationService — aperçu, code et acceptation', () => {
  const tx = {
    staff: { create: jest.fn() },
    staffPermission: { createMany: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    account: { updateMany: jest.fn(), create: jest.fn() },
    invitation: { update: jest.fn() },
  };
  const prisma = {
    invitation: { findUnique: jest.fn(), update: jest.fn() },
    planFeature: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
    verification: {
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const resend = { sendVerificationOTP: jest.fn() };
  const service = new InvitationService(prisma as never, resend as never, {} as never, {} as never);

  beforeEach(() => jest.resetAllMocks());

  const pending = (overrides: Record<string, unknown> = {}) => ({
    id: 'inv-1',
    email: 'awa@example.com',
    name: 'Awa',
    agencyId: 'A',
    agencyRole: 'AGENT',
    invitedBy: 'owner-user',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 3600_000),
    agency: { name: 'Agence Dakar', agencyLogo: null },
    permissions: [
      {
        permissionId: 'p1',
        granted: true,
        Permission: { featureId: 'f1', name: 'view_visits', description: 'Voir les visites' },
      },
    ],
    ...overrides,
  });
  const validCode = () => ({
    id: 'v1',
    value: encodeStoredCode('482913'),
    expiresAt: new Date(Date.now() + 60_000),
  });

  it("l'aperçu ne modifie rien et masque l'e-mail", async () => {
    prisma.invitation.findUnique.mockResolvedValue(pending());
    prisma.user.findUnique.mockResolvedValue({ name: 'Moussa' });

    await expect(service.previewInvitation('tok')).resolves.toMatchObject({
      agency: { name: 'Agence Dakar' },
      invitedBy: 'Moussa',
      permissions: ['Voir les visites'],
      maskedEmail: 'a*a@example.com',
    });
    expect(prisma.invitation.update).not.toHaveBeenCalled();
  });

  it('signale une invitation expirée ou déjà utilisée', async () => {
    prisma.invitation.findUnique.mockResolvedValue(
      pending({ expiresAt: new Date(Date.now() - 1) }),
    );
    expect(await errorCodeOf(service.previewInvitation('tok'))).toBe('INVITATION_EXPIRED');
    prisma.invitation.findUnique.mockResolvedValue(pending({ status: 'ACCEPTED' }));
    expect(await errorCodeOf(service.previewInvitation('tok'))).toBe(
      'INVITATION_ALREADY_USED_OR_CANCELLED',
    );
  });

  it('envoie un code haché, et refuse un renvoi trop rapproché', async () => {
    prisma.invitation.findUnique.mockResolvedValue(pending());
    prisma.verification.findFirst.mockResolvedValue(null);

    await service.sendInvitationCode('tok');

    const [, create] = prisma.$transaction.mock.calls[0][0];
    expect(prisma.verification.create).toHaveBeenCalled();
    const code = resend.sendVerificationOTP.mock.calls[0][1];
    expect(code).toMatch(/^\d{6}$/);
    expect(prisma.verification.create.mock.calls[0][0].data.value).not.toContain(code);
    expect(create).toBeUndefined();

    prisma.verification.findFirst.mockResolvedValue({ createdAt: new Date() });
    expect(await errorCodeOf(service.sendInvitationCode('tok'))).toBe('INVITATION_CODE_TOO_SOON');
  });

  it('refuse un code faux en décomptant les essais, puis bloque au 5e', async () => {
    prisma.invitation.findUnique.mockResolvedValue(pending());
    prisma.verification.findFirst.mockResolvedValue(validCode());
    expect(
      await errorCodeOf(service.acceptInvitation({ token: 'tok', code: '000000', password: 'x' })),
    ).toBe('INVITATION_CODE_INVALID');
    expect(prisma.verification.update).toHaveBeenCalled();

    prisma.verification.findFirst.mockResolvedValue({
      ...validCode(),
      value: encodeStoredCode('482913', 4),
    });
    expect(
      await errorCodeOf(service.acceptInvitation({ token: 'tok', code: '000000', password: 'x' })),
    ).toBe('INVITATION_CODE_LOCKED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('crée le compte vérifié avec le mot de passe choisi, sans renvoyer de secret', async () => {
    prisma.invitation.findUnique.mockResolvedValue(pending());
    prisma.verification.findFirst.mockResolvedValue(validCode());
    prisma.planFeature.findMany.mockResolvedValue([{ featureId: 'f1' }]);
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
    tx.user.findUnique.mockResolvedValue(null);
    tx.user.create.mockResolvedValue({ id: 'user-new' });
    tx.staff.create.mockResolvedValue({ id: 'staff-new' });

    const result = await service.acceptInvitation({
      token: 'tok',
      code: '482913',
      password: 'MotDePasse2026',
    });

    expect(tx.user.create.mock.calls[0][0].data).toMatchObject({
      email: 'awa@example.com',
      emailVerified: true,
      status: 'ACTIVE',
    });
    expect(tx.account.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-new',
        accountId: 'user-new',
        providerId: 'credential',
        password: 'hash:MotDePasse2026',
      },
    });
    expect(tx.staffPermission.createMany.mock.calls[0][0].data).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('MotDePasse2026');
  });

  it('réactive un ancien membre : même compte, nouveau mot de passe', async () => {
    prisma.invitation.findUnique.mockResolvedValue(pending({ permissions: [] }));
    prisma.verification.findFirst.mockResolvedValue(validCode());
    prisma.planFeature.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
    tx.user.findUnique.mockResolvedValue({ id: 'user-2' });
    tx.account.updateMany.mockResolvedValue({ count: 1 });
    tx.staff.create.mockResolvedValue({ id: 'staff-new' });

    await service.acceptInvitation({ token: 'tok', code: '482913', password: 'MotDePasse2026' });

    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.account.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-2', providerId: 'credential' },
      data: { password: 'hash:MotDePasse2026' },
    });
    expect(tx.staff.create).toHaveBeenCalledWith({
      data: { userId: 'user-2', agencyId: 'A', agencyRole: 'AGENT' },
    });
  });
});
