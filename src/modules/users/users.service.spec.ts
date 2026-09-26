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
