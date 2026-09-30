// Dépendance mockée : évite de charger Better Auth (ESM) dans Jest
const viewBackupCodes = jest.fn();
jest.mock('../../lib/auth', () => ({
  getAuthInstance: () => ({ api: { viewBackupCodes } }),
}));
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

describe('UsersService.updateUser', () => {
  const prisma = {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  };
  let service: UsersService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new UsersService(prisma as never);
    jest
      .spyOn(service, 'findUser')
      .mockResolvedValue({ id: 'user-1', email: 'me@example.com' } as never);
  });

  it("n'écrit que les champs de profil autorisés (pas d'escalade de rôle)", async () => {
    const payload = {
      name: 'Nouveau nom',
      theme_mode: 'dark',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      id: 'victim-id',
    } as UpdateUserDto;

    await service.updateUser('user-1', payload);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Nouveau nom', theme_mode: 'dark' },
    });
  });
});

describe('UsersService.backupCodesRemaining', () => {
  const prisma = { user: { findUnique: jest.fn() } };
  const service = new UsersService(prisma as never);

  beforeEach(() => jest.resetAllMocks());

  it('ne renvoie que le nombre de codes restants, jamais les codes', async () => {
    prisma.user.findUnique.mockResolvedValue({ twoFactorEnabled: true });
    viewBackupCodes.mockResolvedValue({ backupCodes: ['a-1', 'b-2', 'c-3'] });
    await expect(service.backupCodesRemaining('u1')).resolves.toEqual({ remaining: 3 });
  });

  it('vaut 0 sans 2FA, sans interroger Better Auth', async () => {
    prisma.user.findUnique.mockResolvedValue({ twoFactorEnabled: false });
    await expect(service.backupCodesRemaining('u1')).resolves.toEqual({ remaining: 0 });
    expect(viewBackupCodes).not.toHaveBeenCalled();
  });
});
