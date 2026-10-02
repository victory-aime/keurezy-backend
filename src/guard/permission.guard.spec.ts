import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';

const contextWith = (session: unknown) =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ session }) }),
  }) as unknown as ExecutionContext;

describe('PermissionGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new PermissionGuard(reflector as unknown as Reflector);

  beforeEach(() => reflector.getAllAndOverride.mockReset());

  it('laisse passer une route sans permission requise', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(contextWith(undefined))).resolves.toBe(true);
  });

  it("autorise toujours le propriétaire de l'agence", async () => {
    reflector.getAllAndOverride.mockReturnValue('cancel_visit');
    const session = { user: { role: 'OWNER' }, session: { token: 't', permissions: [] } };
    await expect(guard.canActivate(contextWith(session))).resolves.toBe(true);
  });

  it('autorise un membre qui a la permission', async () => {
    reflector.getAllAndOverride.mockReturnValue('view_visits');
    const session = {
      user: { role: 'STAFF' },
      session: { token: 't', permissions: [{ name: 'view_visits' }] },
    };
    await expect(guard.canActivate(contextWith(session))).resolves.toBe(true);
  });

  it("refuse un membre qui n'a pas la permission", async () => {
    reflector.getAllAndOverride.mockReturnValue('cancel_visit');
    const session = {
      user: { role: 'STAFF' },
      session: { token: 't', permissions: [{ name: 'view_visits' }] },
    };
    await expect(guard.canActivate(contextWith(session))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuse une session sans liste de permissions (client connecté)', async () => {
    reflector.getAllAndOverride.mockReturnValue('view_visits');
    const session = { user: { role: 'CLIENT' }, session: { token: 't' } };
    await expect(guard.canActivate(contextWith(session))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  describe('route partagée avec les clients (staffOnly)', () => {
    const route = (permission: string) =>
      reflector.getAllAndOverride.mockImplementation((key: string) =>
        key === 'required_permission' ? permission : true,
      );

    it('laisse passer un client : son accès est limité par le service', async () => {
      route('view_conversations');
      const session = { user: { role: 'USER' }, session: { token: 't' } };
      await expect(guard.canActivate(contextWith(session))).resolves.toBe(true);
    });

    it('exige la permission d’un collaborateur', async () => {
      route('view_conversations');
      const without = { user: { role: 'AGENT' }, session: { token: 't', permissions: [] } };
      await expect(guard.canActivate(contextWith(without))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      const withPermission = {
        user: { role: 'AGENT' },
        session: { token: 't', permissions: [{ name: 'view_conversations' }] },
      };
      await expect(guard.canActivate(contextWith(withPermission))).resolves.toBe(true);
    });
  });
});
