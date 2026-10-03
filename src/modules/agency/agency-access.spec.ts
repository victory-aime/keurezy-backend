import { AGENCY_CLOSE_DELAY_DAYS, AgencyService } from './agency.service';
import { HttpError } from '../../config/http.error';

// Dépendances mockées : évite de charger Better Auth (ESM) dans Jest
jest.mock('../../lib/auth', () => ({ getAuthInstance: jest.fn() }));
jest.mock('../users/users.service', () => ({ UsersService: class {} }));
jest.mock('../payments/services/payment.service', () => ({ PaymentService: class {} }));
jest.mock('../cloudinary/uploads.service', () => ({ UploadsService: class {} }));
jest.mock('../mail/resend.service', () => ({ ResendService: class {} }));

const resend = { sendAgencyCloseScheduled: jest.fn() };

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
  const service = new AgencyService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    resend as never,
  );

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

describe('AgencyService — fermeture programmée', () => {
  const tx = {
    agency: { update: jest.fn() },
    user: { update: jest.fn(), updateMany: jest.fn() },
    subscription: { updateMany: jest.fn() },
    staff: { findMany: jest.fn(), updateMany: jest.fn() },
    session: { deleteMany: jest.fn() },
  };
  const prisma = {
    agency: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    staff: { count: jest.fn() },
    property: { count: jest.fn() },
    booking: { count: jest.fn() },
    subscription: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new AgencyService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    resend as never,
  );

  it('refuse un membre qui n’est pas le propriétaire', async () => {
    jest.spyOn(service, 'agencyAccessControl').mockResolvedValue({ type: 'STAFF' } as never);

    expect(await errorCodeOf(service.scheduleClose({ agencyId: 'A', userId: 's1' }))).toBe(
      'OWNER_ONLY',
    );
    expect(await errorCodeOf(service.getCloseImpact('A', 's1'))).toBe('OWNER_ONLY');
    expect(prisma.agency.update).not.toHaveBeenCalled();
  });

  it('programme la fermeture dans 15 jours, sans rien fermer tout de suite', async () => {
    jest.spyOn(service, 'agencyAccessControl').mockResolvedValue({ type: 'OWNER' } as never);
    prisma.agency.findUnique.mockResolvedValue({
      id: 'A',
      name: 'Agence Dakar',
      closeScheduledAt: null,
      owner: { user: { name: 'Awa', email: 'awa@example.com' } },
    });

    const { closeScheduledAt } = await service.scheduleClose({ agencyId: 'A', userId: 'o1' });

    const days = (closeScheduledAt.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(AGENCY_CLOSE_DELAY_DAYS);
    expect(prisma.agency.update).toHaveBeenCalledWith({
      where: { id: 'A' },
      data: { closeScheduledAt },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(resend.sendAgencyCloseScheduled).toHaveBeenCalledWith(
      expect.objectContaining({ sendTo: 'awa@example.com', agencyName: 'Agence Dakar' }),
    );
  });

  it('garde la date déjà programmée et permet d’annuler', async () => {
    jest.spyOn(service, 'agencyAccessControl').mockResolvedValue({ type: 'OWNER' } as never);
    const planned = new Date('2026-10-15');
    prisma.agency.findUnique.mockResolvedValue({ id: 'A', closeScheduledAt: planned });

    await expect(service.scheduleClose({ agencyId: 'A', userId: 'o1' })).resolves.toEqual({
      closeScheduledAt: planned,
    });
    await service.cancelScheduledClose({ agencyId: 'A', userId: 'o1' });
    expect(prisma.agency.update).toHaveBeenCalledWith({
      where: { id: 'A' },
      data: { closeScheduledAt: null },
    });
  });

  it("le cron ferme l'agence : membres désactivés, toutes les sessions fermées", async () => {
    // resetMocks (config Jest) efface les implémentations déclarées hors du test
    prisma.$transaction.mockImplementation((run: (client: typeof tx) => Promise<unknown>) =>
      run(tx),
    );
    prisma.agency.findMany.mockResolvedValue([{ id: 'A' }]);
    prisma.agency.findUnique.mockResolvedValue({ id: 'A', owner: { userId: 'owner-user' } });
    tx.staff.findMany.mockResolvedValue([{ userId: 'm1' }, { userId: 'm2' }]);

    await service.runScheduledClosures();

    expect(prisma.agency.findMany.mock.calls[0][0].where.closeScheduledAt.lte).toBeInstanceOf(Date);
    expect(tx.agency.update).toHaveBeenCalledWith({
      where: { id: 'A' },
      data: { status: 'CLOSE' },
    });
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['m1', 'm2'] } },
      data: { status: 'INACTIVE' },
    });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: { in: ['m1', 'm2', 'owner-user'] } },
    });
  });

  it('compte membres, biens, réservations et abonnement, avec la date programmée', async () => {
    jest.spyOn(service, 'agencyAccessControl').mockResolvedValue({ type: 'OWNER' } as never);
    prisma.agency.findUnique.mockResolvedValue({ id: 'A', closeScheduledAt: null });
    prisma.staff.count.mockResolvedValue(3);
    prisma.property.count.mockImplementation(({ where }: { where: { annonces?: unknown } }) =>
      Promise.resolve(where.annonces ? 2 : 5),
    );
    prisma.booking.count.mockImplementation(({ where }: { where: { status: string } }) =>
      Promise.resolve(where.status === 'CONFIRMED' ? 4 : 1),
    );
    const end = new Date('2026-12-01');
    prisma.subscription.findUnique.mockResolvedValue({
      currentPeriodEnd: end,
      plan: { name: 'PREMIUM' },
    });

    await expect(service.getCloseImpact('A', 'owner-1')).resolves.toEqual({
      members: { active: 3 },
      properties: { total: 5, online: 2 },
      bookings: { upcoming: 4, pending: 1 },
      subscription: { plan: 'PREMIUM', currentPeriodEnd: end },
      closeScheduledAt: null,
      closeDelayDays: AGENCY_CLOSE_DELAY_DAYS,
    });
  });
});

describe('AgencyService.getAgencyPlanFeatures', () => {
  const prisma = { subscription: { findUnique: jest.fn() } };
  const service = new AgencyService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it("expose le statut de l'abonnement, pour le bandeau de lecture seule du staff", async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'INACTIVE',
      plan: { name: 'BASIC_SUB', planFeatures: [] },
    });
    await expect(service.getAgencyPlanFeatures('A')).resolves.toEqual({
      plan: 'BASIC_SUB',
      status: 'INACTIVE',
      features: [],
    });
  });
});

describe('AgencyService.updateLegal', () => {
  const prisma = { agency: { findUnique: jest.fn(), update: jest.fn() } };
  const service = new AgencyService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    resend as never,
  );
  const owner = jest.spyOn(service, 'agencyAccessControl');
  const verified = {
    isVerified: true,
    companyName: 'Keur Immo SARL',
    legalForm: 'SARL',
    ninea: '00123452G3',
    rccm: 'SN-DKR-2020-B-12345',
    billingAddress: 'Rue 10, Dakar',
    billingEmail: 'compta@keur.sn',
    legalFormProofUrl: 'https://res.cloudinary.com/k/raw/upload/v1/agency/a/legal/statuts.pdf',
    nineaProofUrl: 'https://res.cloudinary.com/k/image/upload/v1/agency/a/legal/ninea.png',
    rccmProofUrl: 'https://res.cloudinary.com/k/raw/upload/v1/agency/a/legal/rccm.pdf',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    owner.mockResolvedValue({ type: 'OWNER' } as never);
    prisma.agency.findUnique.mockResolvedValue(verified);
    prisma.agency.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...verified, ...data }),
    );
  });

  it('refuse le staff', async () => {
    owner.mockResolvedValue({ type: 'STAFF' } as never);
    await expect(errorCodeOf(service.updateLegal('A', 's1', { ninea: '0012345' }))).resolves.toBe(
      'OWNER_ONLY',
    );
    expect(prisma.agency.update).not.toHaveBeenCalled();
  });

  it("changer le NINEA d'une agence vérifiée retire la vérification", async () => {
    const result = await service.updateLegal('A', 'o1', { ninea: '00999991A1' });
    expect(prisma.agency.update.mock.calls[0][0].data).toEqual({
      ninea: '00999991A1',
      isVerified: false,
    });
    expect(result.isVerified).toBe(false);
  });

  it("changer l'adresse de facturation garde la vérification", async () => {
    const result = await service.updateLegal('A', 'o1', { billingAddress: 'Rue 12, Dakar' });
    expect(prisma.agency.update.mock.calls[0][0].data).toEqual({ billingAddress: 'Rue 12, Dakar' });
    expect(result).toMatchObject({ isVerified: true, legalMissing: [] });
  });
});

describe('AgencyService — pièces justificatives', () => {
  const prisma = { agency: { findUnique: jest.fn(), update: jest.fn() } };
  const uploads = { uploadFiles: jest.fn(), deleteByUrl: jest.fn() };
  const service = new AgencyService(
    prisma as never,
    {} as never,
    {} as never,
    uploads as never,
    resend as never,
  );
  const access = jest.spyOn(service, 'agencyAccessControl');
  const oldProof = 'https://res.cloudinary.com/k/raw/upload/v1/agency/a/legal/ninea-old.pdf';
  const agency = {
    name: 'Keur Immo',
    isVerified: true,
    companyName: 'Keur Immo SARL',
    legalForm: 'SARL',
    ninea: '00123452G3',
    rccm: 'SN-DKR-2020-B-12345',
    billingAddress: 'Rue 10, Dakar',
    billingEmail: 'compta@keur.sn',
    legalFormProofUrl: 'https://res.cloudinary.com/k/raw/upload/v1/agency/a/legal/statuts.pdf',
    nineaProofUrl: oldProof,
    rccmProofUrl: null,
  };
  const pdf = { size: 1000, buffer: Buffer.from('%PDF-1.7 ...') } as Express.Multer.File;

  beforeEach(() => {
    jest.clearAllMocks();
    access.mockResolvedValue({ type: 'OWNER' } as never);
    prisma.agency.findUnique.mockResolvedValue(agency);
    prisma.agency.update.mockImplementation(({ data }) => Promise.resolve({ ...agency, ...data }));
    uploads.uploadFiles.mockResolvedValue({ secure_url: 'https://res.cloudinary.com/k/new.pdf' });
  });

  it('refuse le staff, sans rien envoyer à Cloudinary', async () => {
    access.mockResolvedValue({ type: 'STAFF' } as never);
    await expect(errorCodeOf(service.uploadLegalProof('A', 's1', 'NINEA', pdf))).resolves.toBe(
      'OWNER_ONLY',
    );
    expect(uploads.uploadFiles).not.toHaveBeenCalled();
  });

  it('refuse un fichier qui n’est ni PNG, ni JPEG, ni PDF (quel que soit son nom)', async () => {
    const html = { size: 10, buffer: Buffer.from('<html>') } as Express.Multer.File;
    for (const file of [html, undefined]) {
      await expect(errorCodeOf(service.uploadLegalProof('A', 'o1', 'NINEA', file))).resolves.toBe(
        'INVALID_LEGAL_PROOF',
      );
    }
    expect(uploads.uploadFiles).not.toHaveBeenCalled();
  });

  it('remplace la pièce, retire la vérification et supprime l’ancienne', async () => {
    const result = await service.uploadLegalProof('A', 'o1', 'NINEA', pdf);
    expect(prisma.agency.update.mock.calls[0][0].data).toEqual({
      nineaProofUrl: 'https://res.cloudinary.com/k/new.pdf',
      isVerified: false,
    });
    expect(uploads.deleteByUrl).toHaveBeenCalledWith(oldProof);
    // Pièce RCCM toujours manquante
    expect(result).toMatchObject({ isVerified: false, legalMissing: ['rccmProofUrl'] });
  });

  it('retire une pièce et la supprime de Cloudinary', async () => {
    const result = await service.removeLegalProof('A', 'o1', 'NINEA');
    expect(prisma.agency.update.mock.calls[0][0].data).toEqual({
      nineaProofUrl: null,
      isVerified: false,
    });
    expect(uploads.deleteByUrl).toHaveBeenCalledWith(oldProof);
    expect(result.legalMissing).toEqual(['nineaProofUrl', 'rccmProofUrl']);
  });
});
