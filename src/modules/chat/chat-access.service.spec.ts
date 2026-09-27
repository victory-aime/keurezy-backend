import { ChatAccessService, CHAT_PERMISSIONS } from './chat-access.service';
import { HttpError } from '../../config/http.error';
import { Role } from '../../../prisma/generated/enums';

const errorCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return ((error as HttpError).getResponse() as { errorCode: string }).errorCode;
  }
  return null;
};

const conversation = {
  id: 'conv-1',
  clientId: 'client-1',
  agencyId: 'agency-A',
  propertyId: 'property-1',
  client: { userId: 'user-client' },
};

const setup = () => {
  const prisma = {
    agency: { findFirst: jest.fn(), findUnique: jest.fn() },
    conversation: { findUnique: jest.fn().mockResolvedValue(conversation) },
    session: { findUnique: jest.fn() },
  };
  return { prisma, service: new ChatAccessService(prisma as never) };
};

/** Permissions demandées dans la requête staff de getAgencyRole. */
const requestedPermissions = (mock: jest.Mock) =>
  (
    (mock.mock.calls as unknown[][])[0][0] as {
      select: {
        staff: { where: { permissions: { some: { permission: { name: { in: string[] } } } } } };
      };
    }
  ).select.staff.where.permissions.some.permission.name.in;

describe('ChatAccessService', () => {
  it('autorise le client de la conversation', async () => {
    const { service, prisma } = setup();
    const access = await service.assertConversationAccess('conv-1', 'user-client', 'reply');
    expect(access.side).toBe('CLIENT');
    expect(prisma.agency.findFirst).not.toHaveBeenCalled();
  });

  it("autorise l'owner de l'agence, sans permission particulière", async () => {
    const { service, prisma } = setup();
    prisma.agency.findFirst.mockResolvedValue({ owner: { userId: 'user-owner' }, staff: [] });
    const access = await service.assertConversationAccess('conv-1', 'user-owner', 'reply');
    expect(access).toMatchObject({ side: 'AGENCY', role: Role.OWNER });
  });

  it('autorise un staff actif ayant la permission', async () => {
    const { service, prisma } = setup();
    prisma.agency.findFirst.mockResolvedValue({
      owner: { userId: 'user-owner' },
      staff: [{ id: 'staff-1' }],
    });
    const access = await service.assertConversationAccess('conv-1', 'user-staff', 'read');
    expect(access.role).toBe(Role.AGENT);
    expect(requestedPermissions(prisma.agency.findFirst)).toEqual([
      CHAT_PERMISSIONS.VIEW,
      CHAT_PERMISSIONS.REPLY,
    ]);
  });

  it('exige la permission de réponse pour écrire', async () => {
    const { service, prisma } = setup();
    prisma.agency.findFirst.mockResolvedValue({ owner: { userId: 'user-owner' }, staff: [] });
    expect(await errorCode(service.assertConversationAccess('conv-1', 'user-staff', 'reply'))).toBe(
      'CHAT_ACCESS_DENIED',
    );
    expect(requestedPermissions(prisma.agency.findFirst)).toEqual([CHAT_PERMISSIONS.REPLY]);
  });

  it("refuse un staff sans permission, un membre d'une autre agence ou un autre client", async () => {
    const { service, prisma } = setup();
    // La requête est filtrée sur l'agence de la conversation : un tiers n'y figure pas
    prisma.agency.findFirst.mockResolvedValue({ owner: { userId: 'user-owner' }, staff: [] });
    expect(await errorCode(service.assertConversationAccess('conv-1', 'user-other', 'read'))).toBe(
      'CHAT_ACCESS_DENIED',
    );
    expect(prisma.agency.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'agency-A' } }),
    );
  });

  it('refuse une conversation inexistante', async () => {
    const { service, prisma } = setup();
    prisma.conversation.findUnique.mockResolvedValue(null);
    expect(await errorCode(service.assertConversationAccess('conv-x', 'user-client', 'read'))).toBe(
      'CHAT_ACCESS_DENIED',
    );
  });

  it('authentifie le socket par un jeton de session valide, jamais expiré', async () => {
    const { service, prisma } = setup();
    prisma.session.findUnique.mockResolvedValueOnce({
      userId: 'user-owner',
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await service.getUserIdFromSessionToken('valid-token')).toBe('user-owner');

    prisma.session.findUnique.mockResolvedValueOnce({
      userId: 'user-owner',
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await service.getUserIdFromSessionToken('expired-token')).toBeNull();

    prisma.session.findUnique.mockResolvedValueOnce(null);
    expect(await service.getUserIdFromSessionToken('unknown')).toBeNull();
  });
});
