import { AgencyService } from './agency.service';
import { HttpError } from '../../config/http.error';

// Dépendances mockées : évite de charger Better Auth (ESM) dans Jest
jest.mock('../../lib/auth', () => ({ getAuthInstance: jest.fn() }));
jest.mock('../users/users.service', () => ({ UsersService: class {} }));
jest.mock('../payments/services/payment.service', () => ({ PaymentService: class {} }));
jest.mock('../cloudinary/uploads.service', () => ({ UploadsService: class {} }));

/** Code d'erreur métier porté par la réponse d'une HttpError */
const errorCodeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: HttpError) => (error.getResponse() as { errorCode: string }).errorCode,
  );

describe('AgencyService.agencyAccessControl', () => {
  const prisma = {
    owner: { findUnique: jest.fn() },
    staff: { findFirst: jest.fn() },
  };
  const service = new AgencyService(prisma as never, {} as never, {} as never, {} as never);

  beforeEach(() => jest.resetAllMocks());

  it("autorise le propriétaire d'une agence ouverte ou en attente de validation", async () => {
    for (const status of ['OPEN', 'PENDING']) {
      prisma.owner.findUnique.mockResolvedValue({ userId: 'u1', agency: { id: 'A', status } });
      await expect(service.agencyAccessControl('A', 'owner-1')).resolves.toMatchObject({
        type: 'OWNER',
      });
    }
  });

  it('refuse toute action sur une agence fermée, au propriétaire comme au staff', async () => {
    prisma.owner.findUnique.mockResolvedValue({
      userId: 'u1',
      agency: { id: 'A', status: 'CLOSE' },
    });
    await expect(errorCodeOf(service.agencyAccessControl('A', 'owner-1'))).resolves.toBe(
      'AGENCY_CLOSED',
    );

    prisma.owner.findUnique.mockResolvedValue(null);
    prisma.staff.findFirst.mockResolvedValue({
      userId: 'u2',
      agency: { id: 'A', status: 'CLOSE' },
    });
    await expect(service.agencyAccessControl('A', 'staff-1')).rejects.toBeInstanceOf(HttpError);
  });

  it("refuse quelqu'un qui n'appartient pas à l'agence", async () => {
    prisma.owner.findUnique.mockResolvedValue(null);
    prisma.staff.findFirst.mockResolvedValue(null);
    await expect(errorCodeOf(service.agencyAccessControl('A', 'x'))).resolves.toBe(
      'AGENCY_ACCESS_DENIED',
    );
  });
});
