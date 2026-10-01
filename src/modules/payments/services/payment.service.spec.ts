import { BadRequestException } from '@nestjs/common';
import { PaymentService } from './payment.service';

// Better Auth (ESM) et les services d'upload ne sont pas utilisés par ce contrôle
jest.mock('../../../lib/auth', () => ({ getAuthInstance: jest.fn() }));
jest.mock('../../cloudinary/uploads.service', () => ({ UploadsService: class {} }));
jest.mock('../../cloudinary/cloudinary.service', () => ({ CloudinaryService: class {} }));

describe('PaymentService.initiateAgencyPayment', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    agency: { findUnique: jest.fn() },
    subscriptionPlan: { findUnique: jest.fn() },
  };
  const service = new PaymentService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it("refuse l'e-mail d'une agence existante, avant tout appel NabooPay", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.agency.findUnique.mockResolvedValue({ id: 'existing' });
    const dto = { userEmail: 'new@owner.sn', email: 'contact@agence.sn', plan: { planId: 'p' } };

    await expect(service.initiateAgencyPayment(dto as never, 'session')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.agency.findUnique).toHaveBeenCalledWith({
      where: { email: 'contact@agence.sn' },
      select: { id: true },
    });
    expect(prisma.subscriptionPlan.findUnique).not.toHaveBeenCalled();
  });
});
