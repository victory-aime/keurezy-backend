import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { ActiveSubscriptionGuard } from './active-subscription.guard';
import { HttpError } from '../config/http.error';

/** Contexte HTTP minimal : méthode, rôle de session, route autorisée ou non. */
const contextOf = (method: string, role?: string, userId = 'u1') =>
  ({
    getHandler: () => 'handler',
    getClass: () => 'controller',
    switchToHttp: () => ({
      getRequest: () => ({ method, session: role ? { user: { id: userId, role } } : undefined }),
    }),
  }) as unknown as ExecutionContext;

const errorCodeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: HttpError) => (error.getResponse() as { errorCode: string }).errorCode,
  );

describe('ActiveSubscriptionGuard', () => {
  const prisma = {
    owner: { findUnique: jest.fn() },
    staff: { findUnique: jest.fn() },
  };
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new ActiveSubscriptionGuard(reflector as unknown as Reflector, prisma as never);

  /** Agence de l'owner avec l'abonnement donné (null = aucune souscription). */
  const ownerWith = (status: string | null) =>
    prisma.owner.findUnique.mockResolvedValue({
      agency: { subscriptions: status ? [{ status }] : [] },
    });

  beforeEach(() => {
    jest.resetAllMocks();
    reflector.getAllAndOverride.mockReturnValue(false);
  });

  it("refuse l'écriture d'un owner dont l'abonnement est inactif", async () => {
    ownerWith('INACTIVE');
    await expect(errorCodeOf(guard.canActivate(contextOf('POST', 'OWNER')))).resolves.toBe(
      'SUBSCRIPTION_INACTIVE',
    );
  });

  it("refuse l'écriture d'un membre du staff de la même agence", async () => {
    prisma.staff.findUnique.mockResolvedValue({
      isActive: true,
      agency: { subscriptions: [{ status: 'INACTIVE' }] },
    });
    await expect(guard.canActivate(contextOf('PATCH', 'AGENT'))).rejects.toBeInstanceOf(HttpError);
  });

  it('laisse passer une route marquée @AllowWhenInactive', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    ownerWith('INACTIVE');
    await expect(guard.canActivate(contextOf('POST', 'OWNER'))).resolves.toBe(true);
    expect(prisma.owner.findUnique).not.toHaveBeenCalled();
  });

  it('laisse toujours passer la lecture', async () => {
    ownerWith('INACTIVE');
    await expect(guard.canActivate(contextOf('GET', 'OWNER'))).resolves.toBe(true);
  });

  it('ignore les clients mobiles, le super admin et les appels anonymes', async () => {
    await expect(guard.canActivate(contextOf('POST', 'USER'))).resolves.toBe(true);
    await expect(guard.canActivate(contextOf('POST', 'SUPER_ADMIN'))).resolves.toBe(true);
    await expect(guard.canActivate(contextOf('POST'))).resolves.toBe(true);
    expect(prisma.owner.findUnique).not.toHaveBeenCalled();
  });

  it('laisse écrire une agence active ou sans souscription', async () => {
    ownerWith('ACTIVE');
    await expect(guard.canActivate(contextOf('DELETE', 'OWNER'))).resolves.toBe(true);
    ownerWith(null);
    await expect(guard.canActivate(contextOf('DELETE', 'OWNER'))).resolves.toBe(true);
  });
});
