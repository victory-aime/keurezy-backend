import { VisitsService } from './visits.service';
import { HttpError } from '../../config/http.error';
import { VisitStatus } from '../../../prisma/generated/enums';

// Dépendances mockées : évite de charger Better Auth (ESM) dans Jest
jest.mock('../agency/agency.service', () => ({ AgencyService: class {} }));
jest.mock('../notifications/notifications.service', () => ({ NotificationsService: class {} }));

const errorCodeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: HttpError) => (error.getResponse() as { errorCode: string }).errorCode,
  );

const inOneHour = (hours = 1) => new Date(Date.now() + hours * 3600_000).toISOString();

describe('VisitsService.createVisit — visite rattachée au client', () => {
  const prisma = {
    lead: { findUnique: jest.fn() },
    client: { findUnique: jest.fn() },
    property: { findUnique: jest.fn() },
    staff: { findFirst: jest.fn() },
    agency: { findUnique: jest.fn() },
    visit: { create: jest.fn() },
  };
  const notifications = { createNotification: jest.fn() };
  const agencyService = { agencyAccessControl: jest.fn() };
  const service = new VisitsService(
    prisma as never,
    notifications as never,
    agencyService as never,
  );

  const dto = (extra: Record<string, string>) => ({
    scheduledAt: inOneHour(),
    startTime: inOneHour(),
    endTime: inOneHour(2),
    propertyId: 'prop-1',
    status: VisitStatus.PLANNED,
    ...extra,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    agencyService.agencyAccessControl.mockResolvedValue({
      type: 'OWNER',
      userOwnerId: 'owner-user',
    });
    prisma.property.findUnique.mockResolvedValue({ id: 'prop-1', agencyId: 'A', title: 'Villa' });
    prisma.agency.findUnique.mockResolvedValue({ owner: { userId: 'owner-user' } });
  });

  it("refuse un client qui n'a ni réservation ni discussion avec l'agence", async () => {
    prisma.client.findUnique.mockResolvedValue({
      id: 'client-1',
      userId: 'client-user',
      _count: { bookings: 0, conversations: 0 },
    });

    await expect(
      errorCodeOf(service.createVisit(dto({ clientId: 'client-1' }) as never, 'A', 'owner-1')),
    ).resolves.toBe('CLIENT_NOT_LINKED');
    expect(prisma.visit.create).not.toHaveBeenCalled();
  });

  it("planifie la visite d'un client lié à l'agence et le notifie", async () => {
    prisma.client.findUnique.mockResolvedValue({
      id: 'client-1',
      userId: 'client-user',
      _count: { bookings: 0, conversations: 1 },
    });

    await service.createVisit(dto({ clientId: 'client-1' }) as never, 'A', 'owner-1');

    expect(prisma.visit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: 'client-1', agencyId: 'A' }),
    });
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipients: ['client-user'] }),
    );
  });

  it('déduit le client du lead (compatibilité jusqu’au retrait des leads)', async () => {
    prisma.lead.findUnique.mockResolvedValue({
      id: 'lead-1',
      agencyId: 'A',
      clientId: 'client-1',
      client: { userId: 'client-user' },
    });

    await service.createVisit(dto({ leadId: 'lead-1' }) as never, 'A', 'owner-1');

    expect(prisma.visit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: 'client-1', leadId: 'lead-1' }),
    });
  });

  it('exige un client ou un lead', async () => {
    await expect(errorCodeOf(service.createVisit(dto({}) as never, 'A', 'owner-1'))).resolves.toBe(
      'VISIT_CLIENT_REQUIRED',
    );
  });
});

describe('VisitsService.getAgencyClients', () => {
  const prisma = { client: { findMany: jest.fn() } };
  const agencyService = { agencyAccessControl: jest.fn() };
  const service = new VisitsService(prisma as never, {} as never, agencyService as never);

  it("ne propose que les clients ayant réservé ou écrit à l'agence, après contrôle d'accès", async () => {
    prisma.client.findMany.mockResolvedValue([]);

    await service.getAgencyClients('A', 'owner-1');

    expect(agencyService.agencyAccessControl).toHaveBeenCalledWith('A', 'owner-1');
    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { bookings: { some: { agencyId: 'A' } } },
            { conversations: { some: { agencyId: 'A' } } },
          ],
        },
      }),
    );
  });
});

describe('VisitsService.getVisitsByAgency — période', () => {
  const prisma = { visit: { findMany: jest.fn().mockResolvedValue([]) } };
  const agencyService = { agencyAccessControl: jest.fn() };
  const service = new VisitsService(prisma as never, {} as never, agencyService as never);

  it('filtre les visites planifiées dans la période demandée', async () => {
    await service.getVisitsByAgency(
      { agencyId: 'A', from: '2026-10-01', to: '2026-10-31' },
      'owner-1',
    );
    expect(prisma.visit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          agencyId: 'A',
          scheduledAt: { gte: new Date('2026-10-01'), lt: new Date('2026-11-01') },
        },
      }),
    );
  });

  it('sans période, renvoie toutes les visites de l’agence', async () => {
    await service.getVisitsByAgency({ agencyId: 'A' }, 'owner-1');
    expect(prisma.visit.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { agencyId: 'A' } }),
    );
  });
});
