import { TeamService } from './team.service';
import { HttpError } from '../../config/http.error';

// Dépendance mockée : évite de charger Better Auth (ESM) dans Jest
jest.mock('../agency/agency.service', () => ({ AgencyService: class {} }));

describe('TeamService.enableOrDisabledAccount', () => {
  const prisma = {
    staff: { findFirst: jest.fn(), update: jest.fn() },
    user: { update: jest.fn() },
    $transaction: jest.fn(),
  };
  const agencyService = { agencyAccessControl: jest.fn() };
  const service = new TeamService(prisma as never, agencyService as never);

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
