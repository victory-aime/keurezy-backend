import { Controller, Get, INestApplication, Query } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../database/prisma.service';
import { AgencyProfileId, CurrentUserId } from './current-user.decorator';

@Controller('probe')
class ProbeController {
  @Get('user')
  user(@CurrentUserId() userId: string, @Query('userId') spoofed?: string) {
    return { userId, spoofed };
  }

  @Get('profile')
  profile(@AgencyProfileId() profileId: string) {
    return { profileId };
  }
}

describe('CurrentUserId / AgencyProfileId', () => {
  let app: INestApplication;
  let sessionUserId: string | undefined;
  const prisma = {
    owner: { findUnique: jest.fn() },
    staff: { findUnique: jest.fn() },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    app = moduleRef.createNestApplication();
    // Simule la session posée par l'AuthGuard Better Auth
    app.use((req: { session?: unknown }, _res: unknown, next: () => void) => {
      req.session = sessionUserId ? { user: { id: sessionUserId } } : undefined;
      next();
    });
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.resetAllMocks();
    sessionUserId = 'user-1';
  });

  it("retourne l'id de session et ignore le userId de la query", async () => {
    const res = await request(app.getHttpServer() as App)
      .get('/probe/user?userId=victim')
      .expect(200);
    expect(res.body).toEqual({ userId: 'user-1', spoofed: 'victim' });
  });

  it('renvoie 401 sans session', async () => {
    sessionUserId = undefined;
    await request(app.getHttpServer() as App)
      .get('/probe/user')
      .expect(401);
  });

  it("résout l'id du profil Owner", async () => {
    prisma.owner.findUnique.mockResolvedValue({ id: 'owner-1' });
    prisma.staff.findUnique.mockResolvedValue(null);

    const res = await request(app.getHttpServer() as App)
      .get('/probe/profile')
      .expect(200);
    expect(res.body).toEqual({ profileId: 'owner-1' });
    expect(prisma.owner.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it("résout l'id d'un Staff actif", async () => {
    prisma.owner.findUnique.mockResolvedValue(null);
    prisma.staff.findUnique.mockResolvedValue({ id: 'staff-1', isActive: true });

    const res = await request(app.getHttpServer() as App)
      .get('/probe/profile')
      .expect(200);
    expect(res.body).toEqual({ profileId: 'staff-1' });
  });

  it('refuse un Staff désactivé ou un utilisateur sans profil agence', async () => {
    prisma.owner.findUnique.mockResolvedValue(null);
    prisma.staff.findUnique.mockResolvedValue({ id: 'staff-1', isActive: false });
    await request(app.getHttpServer() as App)
      .get('/probe/profile')
      .expect(403);

    prisma.staff.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer() as App)
      .get('/probe/profile')
      .expect(403);
  });
});
