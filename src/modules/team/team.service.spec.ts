import { TeamService } from './team.service';
import { HttpError } from '../../config/http.error';

// Dépendance mockée : évite de charger Better Auth (ESM) dans Jest
jest.mock('../agency/agency.service', () => ({ AgencyService: class {} }));
jest.mock('../packs/permissions.service', () => ({ PermissionsService: class {} }));

describe('TeamService.enableOrDisabledAccount', () => {
  const prisma = {
    staff: { findFirst: jest.fn(), update: jest.fn() },
    user: { update: jest.fn() },
    $transaction: jest.fn(),
  };
  const agencyService = { agencyAccessControl: jest.fn() };
  const service = new TeamService(prisma as never, agencyService as never, {} as never);

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
    permissionsService as never,
  );

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
