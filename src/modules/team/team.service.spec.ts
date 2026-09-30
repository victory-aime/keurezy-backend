import { TeamService } from './team.service';
import { HttpError } from '../../config/http.error';

// Dépendance mockée : évite de charger Better Auth (ESM) dans Jest
jest.mock('../agency/agency.service', () => ({ AgencyService: class {} }));
jest.mock('../packs/permissions.service', () => ({ PermissionsService: class {} }));
jest.mock('../mail/resend.service', () => ({ ResendService: class {} }));

describe('TeamService.enableOrDisabledAccount', () => {
  const prisma = {
    staff: { findFirst: jest.fn(), update: jest.fn() },
    user: { update: jest.fn() },
    session: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const agencyService = { agencyAccessControl: jest.fn() };
  const service = new TeamService(prisma as never, agencyService as never, {} as never, {} as never);

  beforeEach(() => jest.resetAllMocks());

  it("refuse l'action à un membre qui n'est pas le propriétaire", async () => {
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'STAFF' });

    await expect(
      service.enableOrDisabledAccount({ status: false, id: 'staff-2' }, 'agency-A', 'staff-1'),
    ).rejects.toBeInstanceOf(HttpError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuse un membre qui n'appartient pas à l'agence", async () => {
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'OWNER' });
    prisma.staff.findFirst.mockResolvedValue(null);

    await expect(
      service.enableOrDisabledAccount({ status: false, id: 'staff-other' }, 'agency-A', 'owner-1'),
    ).rejects.toBeInstanceOf(HttpError);
    expect(prisma.staff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'staff-other', agencyId: 'agency-A' } }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('désactive le compte déduit du membre, jamais un userId fourni par le client', async () => {
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'OWNER' });
    prisma.staff.findFirst.mockResolvedValue({ id: 'staff-2', userId: 'user-of-staff-2' });

    const body = { status: false, id: 'staff-2', userId: 'any-platform-user' };
    await service.enableOrDisabledAccount(body, 'agency-A', 'owner-1');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-of-staff-2' } }),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('ferme les sessions à la désactivation, pas à la réactivation', async () => {
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'OWNER' });
    prisma.staff.findFirst.mockResolvedValue({ id: 'staff-2', userId: 'user-2' });

    await service.enableOrDisabledAccount({ status: false, id: 'staff-2' }, 'agency-A', 'owner-1');
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-2' } });

    prisma.session.deleteMany.mockClear();
    await service.enableOrDisabledAccount({ status: true, id: 'staff-2' }, 'agency-A', 'owner-1');
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });
});

describe('TeamService.updateMemberPermissions', () => {
  const prisma = {
    staff: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
    staffPermission: { deleteMany: jest.fn(), updateMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const agencyService = { agencyAccessControl: jest.fn() };
  const permissionsService = { getAssignablePermissionIds: jest.fn() };
  const service = new TeamService(
    prisma as never,
    agencyService as never,
    permissionsService as never, {} as never);

  const errorCode = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return ((error as HttpError).getResponse() as { errorCode: string }).errorCode;
    }
    return null;
  };

  const dto = { staffId: 'staff-2', permissionIds: ['perm-view', 'perm-reply'] };

  beforeEach(() => {
    jest.resetAllMocks();
    agencyService.agencyAccessControl.mockResolvedValue({
      type: 'OWNER',
      userOwnerId: 'user-owner',
    });
    prisma.staff.findFirst.mockResolvedValue({ id: 'staff-2' });
    permissionsService.getAssignablePermissionIds.mockResolvedValue(
      new Set(['perm-view', 'perm-reply', 'perm-leads']),
    );
    prisma.staff.findUniqueOrThrow.mockResolvedValue({
      id: 'staff-2',
      userId: 'user-2',
      agencyRole: 'AGENT',
      createdAt: new Date(),
      user: { name: 'Awa', email: 'awa@example.com', status: 'ACTIVE' },
      permissions: [],
    });
  });

  it('réserve la mise à jour au propriétaire', async () => {
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'STAFF' });
    expect(await errorCode(service.updateMemberPermissions(dto, 'agency-A', 'staff-1'))).toBe(
      'OWNER_ONLY',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuse un membre d'une autre agence", async () => {
    prisma.staff.findFirst.mockResolvedValue(null);
    expect(await errorCode(service.updateMemberPermissions(dto, 'agency-A', 'owner-1'))).toBe(
      'STAFF_NOT_FOUND',
    );
    expect(prisma.staff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'staff-2', agencyId: 'agency-A' } }),
    );
  });

  it('refuse une permission hors du plan de l’agence', async () => {
    const outside = { staffId: 'staff-2', permissionIds: ['perm-view', 'perm-accounting'] };
    expect(await errorCode(service.updateMemberPermissions(outside, 'agency-A', 'owner-1'))).toBe(
      'PERMISSIONS_NOT_ASSIGNABLE',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('remplace les permissions : retire les autres, crée les nouvelles', async () => {
    const result = await service.updateMemberPermissions(dto, 'agency-A', 'owner-1');

    expect(prisma.staffPermission.deleteMany).toHaveBeenCalledWith({
      where: { staffId: 'staff-2', permissionId: { notIn: ['perm-view', 'perm-reply'] } },
    });
    expect(prisma.staffPermission.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(result.member.id).toBe('staff-2');
  });
});

describe('TeamService.removeMember', () => {
  const prisma = {
    staff: { findFirst: jest.fn(), delete: jest.fn() },
    visit: { updateMany: jest.fn() },
    ticket: { updateMany: jest.fn() },
    user: { update: jest.fn() },
    session: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const agencyService = { agencyAccessControl: jest.fn() };
  const service = new TeamService(prisma as never, agencyService as never, {} as never, {} as never);

  beforeEach(() => jest.resetAllMocks());

  it("refuse le retrait à un membre qui n'est pas le propriétaire", async () => {
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'STAFF' });
    await expect(service.removeMember('staff-2', 'agency-A', 'staff-1')).rejects.toBeInstanceOf(
      HttpError,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuse un membre d'une autre agence", async () => {
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'OWNER' });
    prisma.staff.findFirst.mockResolvedValue(null);
    await expect(service.removeMember('staff-x', 'agency-A', 'owner-1')).rejects.toBeInstanceOf(
      HttpError,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('désassigne son travail, supprime son profil, désactive son compte et ses sessions', async () => {
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'OWNER' });
    prisma.staff.findFirst.mockResolvedValue({ id: 'staff-2', userId: 'user-2' });

    await service.removeMember('staff-2', 'agency-A', 'owner-1');

    expect(prisma.visit.updateMany).toHaveBeenCalledWith({
      where: { agentId: 'staff-2' },
      data: { agentId: null },
    });
    expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
      where: { assignedToId: 'staff-2' },
      data: { assignedToId: null },
    });
    expect(prisma.staff.delete).toHaveBeenCalledWith({ where: { id: 'staff-2' } });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: { status: 'INACTIVE' },
    });
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-2' } });
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

describe('TeamService.getMemberImpact', () => {
  const prisma = {
    staff: { findFirst: jest.fn() },
    visit: { count: jest.fn() },
    ticket: { count: jest.fn() },
  };
  const agencyService = { agencyAccessControl: jest.fn() };
  const service = new TeamService(prisma as never, agencyService as never, {} as never, {} as never);

  beforeEach(() => jest.resetAllMocks());

  it("refuse l'impact à un membre qui n'est pas le propriétaire", async () => {
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'STAFF' });
    await expect(service.getMemberImpact('staff-2', 'agency-A', 'staff-1')).rejects.toBeInstanceOf(
      HttpError,
    );
  });

  it('compte les visites et tickets assignés et les permissions retirées', async () => {
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'OWNER' });
    prisma.staff.findFirst.mockResolvedValue({
      id: 'staff-2',
      user: { name: 'Moussa', email: 'moussa@example.com' },
      _count: { permissions: 4 },
    });
    prisma.visit.count.mockImplementation(({ where }: { where: { scheduledAt?: unknown } }) =>
      where.scheduledAt ? 1 : 3,
    );
    prisma.ticket.count.mockResolvedValue(2);

    await expect(service.getMemberImpact('staff-2', 'agency-A', 'owner-1')).resolves.toEqual({
      name: 'Moussa',
      email: 'moussa@example.com',
      visits: { assigned: 3, upcoming: 1 },
      tickets: 2,
      permissions: 4,
    });
  });
});

describe('TeamService.resetMemberTwoFactor', () => {
  const prisma = {
    staff: { findFirst: jest.fn() },
    twoFactor: { deleteMany: jest.fn() },
    user: { update: jest.fn() },
    session: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const agencyService = { agencyAccessControl: jest.fn() };
  const resend = { sendTwoFactorReset: jest.fn() };
  const service = new TeamService(
    prisma as never,
    agencyService as never,
    {} as never,
    resend as never,
  );

  beforeEach(() => jest.resetAllMocks());

  it("refuse l'action à un membre qui n'est pas le propriétaire", async () => {
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'STAFF' });
    await expect(service.resetMemberTwoFactor('s2', 'A', 's1')).rejects.toBeInstanceOf(HttpError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('supprime la 2FA, ferme les sessions et prévient le membre', async () => {
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'OWNER' });
    prisma.staff.findFirst.mockResolvedValue({
      userId: 'u2',
      user: { name: 'Awa', email: 'awa@example.com' },
      agency: { name: 'Agence Dakar' },
    });

    await service.resetMemberTwoFactor('s2', 'A', 'owner-1');

    expect(prisma.staff.findFirst.mock.calls[0][0].where).toEqual({ id: 's2', agencyId: 'A' });
    expect(prisma.twoFactor.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u2' } });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u2' },
      data: { twoFactorEnabled: false },
    });
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u2' } });
    expect(resend.sendTwoFactorReset).toHaveBeenCalledWith(
      expect.objectContaining({ sendTo: 'awa@example.com', agencyName: 'Agence Dakar' }),
    );
  });
});
