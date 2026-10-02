import { HttpError } from '../../config/http.error';
import { bookingReference, draftFromBooking, type InvoiceSnapshot } from './invoice-data';
import { DEFAULT_INVOICE_TEMPLATES } from './invoice-template.config';
import { formatInvoiceNumber, InvoicesService } from './invoices.service';

jest.mock('../agency/agency.service', () => ({ AgencyService: class {} }));
jest.mock('../packs/plan-feature-policy.service', () => ({ PlanFeaturePolicyService: class {} }));

const errorCodeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: HttpError) => (error.getResponse() as { errorCode: string }).errorCode,
  );

const booking = {
  id: '8f2a91c4-0000-4000-8000-000000000000',
  rentalType: 'MONTHLY' as const,
  startDate: new Date('2026-11-01'),
  endDate: new Date('2026-12-31'),
  duration: 2,
  totalAmount: 700_000,
  depositAmount: 150_000,
  property: { title: 'Appartement F3 Almadies', address: 'Route des Almadies', city: 'Dakar' },
  client: { phone: '+221 77 123 45 67', user: { name: 'Aminata Diop', email: 'a@exemple.sn' } },
};

const agencyRow = {
  name: 'Keur Immo',
  companyName: 'Keur Immo SARL',
  ninea: '00123452G3',
  rccm: 'SN-DKR-2020-B-12345',
  address: 'Rue 10, Dakar',
  billingAddress: null,
  phone: null,
  email: 'contact@keur.sn',
  billingEmail: null,
  bankName: null,
  bankAccount: null,
  mobileMoneyNumber: null,
  agencyLogo: null,
  invoiceStampUrl: null,
  vatRate: 18,
  invoicePrefix: 'FAC',
  defaultInvoiceTemplateId: null,
};

const draft = {
  id: 'inv-1',
  agencyId: 'A',
  bookingId: null,
  templateId: null,
  status: 'DRAFT',
  number: null,
  clientName: 'Aminata Diop',
  clientEmail: null,
  clientPhone: null,
  clientAddress: null,
  lines: [{ description: 'Frais de dossier', period: null, quantity: 1, unitPrice: 25_000 }],
  totalHt: 25_000,
  totalVat: 0,
  totalTtc: 25_000,
  dueAt: new Date('2026-10-17'),
  issuedAt: null,
  snapshot: null,
  paidAt: null,
  paymentMethod: null,
  cancelledAt: null,
  cancelReason: null,
  createdBy: 'o1',
  createdAt: new Date('2026-10-02'),
  updatedAt: new Date('2026-10-02'),
};

describe('données de facture', () => {
  it('numéro {préfixe}-{année}-{rang sur 4 chiffres}', () => {
    expect(formatInvoiceNumber('FAC', 2026, 1)).toBe('FAC-2026-0001');
    expect(formatInvoiceNumber('KI', 2027, 12345)).toBe('KI-2027-12345');
  });

  it('réservation : durée × prix quand la division tombe juste, plus la caution', () => {
    const { client, lines } = draftFromBooking(booking);
    expect(client).toMatchObject({ name: 'Aminata Diop', email: 'a@exemple.sn' });
    expect(lines).toEqual([
      {
        description: 'Location mensuelle - Appartement F3 Almadies',
        period: 'Du 01/11/2026 au 31/12/2026',
        quantity: 2,
        unitPrice: 350_000,
      },
      { description: 'Caution (remboursable)', period: null, quantity: 1, unitPrice: 150_000 },
    ]);
    expect(bookingReference(booking.id)).toBe('RES-8F2A91C4');
  });

  it('réservation : forfait quand le prix unitaire ne tombe pas juste', () => {
    const { lines } = draftFromBooking({
      ...booking,
      rentalType: 'NIGHTLY',
      duration: 3,
      totalAmount: 100_000,
      depositAmount: 0,
    });
    expect(lines).toEqual([
      {
        description: 'Location à la nuitée - Appartement F3 Almadies (3 nuits)',
        period: 'Du 01/11/2026 au 31/12/2026',
        quantity: 1,
        unitPrice: 100_000,
      },
    ]);
  });
});

describe('InvoicesService', () => {
  const tx = {
    $queryRaw: jest.fn(),
    invoice: { updateMany: jest.fn() },
    invoiceAsset: { upsert: jest.fn(), findMany: jest.fn() },
    agency: { findUniqueOrThrow: jest.fn() },
    invoiceTemplate: { findFirst: jest.fn(), findFirstOrThrow: jest.fn() },
    booking: { findFirst: jest.fn() },
  };
  const prisma = {
    ...tx,
    invoice: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const agencyService = { agencyAccessControl: jest.fn() };
  const policy = {
    getAgencyFeatureContext: jest.fn(),
    countInvoicesThisMonth: jest.fn(),
    checkCapacity: jest.fn(),
  };
  const service = new InvoicesService(prisma as never, agencyService as never, policy as never);
  const classic = { name: 'Classique', config: DEFAULT_INVOICE_TEMPLATES[0].config };

  beforeEach(() => {
    jest.clearAllMocks();
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'OWNER' });
    prisma.agency.findUniqueOrThrow.mockResolvedValue(agencyRow);
    tx.agency.findUniqueOrThrow.mockResolvedValue(agencyRow);
    tx.invoiceTemplate.findFirst.mockResolvedValue(null);
    tx.invoiceTemplate.findFirstOrThrow.mockResolvedValue(classic);
    policy.countInvoicesThisMonth.mockResolvedValue(0);
    policy.checkCapacity.mockReturnValue({ allowed: true });
    prisma.invoice.create.mockImplementation(({ data }) => Promise.resolve({ ...draft, ...data }));
  });

  it('une facture d’une autre agence est introuvable', async () => {
    prisma.invoice.findFirst.mockResolvedValue(null);
    await expect(errorCodeOf(service.get('A', 'o1', 'inv-B'))).resolves.toBe('INVOICE_NOT_FOUND');
    expect(prisma.invoice.findFirst.mock.calls[0][0].where).toEqual({ id: 'inv-B', agencyId: 'A' });
  });

  it('brouillon depuis une réservation : seulement une réservation confirmée de l’agence', async () => {
    tx.booking.findFirst.mockResolvedValue(null);
    await expect(errorCodeOf(service.create('A', 'o1', { bookingId: booking.id }))).resolves.toBe(
      'BOOKING_NOT_INVOICEABLE',
    );
    expect(tx.booking.findFirst.mock.calls[0][0].where).toEqual({
      id: booking.id,
      agencyId: 'A',
      status: { in: ['CONFIRMED', 'COMPLETED'] },
    });

    tx.booking.findFirst.mockResolvedValue(booking);
    const view = await service.create('A', 'o1', { bookingId: booking.id });
    // Loyer 700 000 + caution 150 000, TVA 18 % de l'agence
    expect(view.totals).toEqual({ ht: 850_000, vat: 153_000, ttc: 1_003_000 });
    expect(view.status).toBe('DRAFT');
  });

  it('sans réservation ni contenu : refusé', async () => {
    await expect(errorCodeOf(service.create('A', 'o1', {}))).resolves.toBe('DRAFT_REQUIRED');
  });

  it('total au-delà du plafond : refusé', async () => {
    const lines = [{ description: 'X', quantity: 100_000, unitPrice: 1_000_000_000 }];
    await expect(
      errorCodeOf(
        service.create('A', 'o1', {
          draft: { client: { name: 'Client' }, lines, dueAt: '2026-10-17' },
        }),
      ),
    ).resolves.toBe('INVOICE_TOTAL_TOO_LARGE');
  });

  it('une facture émise ne se modifie ni ne se supprime', async () => {
    prisma.invoice.findFirst.mockResolvedValue({ ...draft, status: 'ISSUED', number: 'FAC-1' });
    prisma.invoice.updateMany.mockResolvedValue({ count: 0 });
    prisma.invoice.deleteMany.mockResolvedValue({ count: 0 });
    const content = { client: { name: 'Client' }, lines: draft.lines, dueAt: '2026-10-17' };
    await expect(errorCodeOf(service.update('A', 'o1', 'inv-1', content))).resolves.toBe(
      'INVOICE_NOT_DRAFT',
    );
    expect(prisma.invoice.updateMany.mock.calls[0][0].where).toEqual({
      id: 'inv-1',
      agencyId: 'A',
      status: 'DRAFT',
    });
    await expect(errorCodeOf(service.remove('A', 'o1', 'inv-1'))).resolves.toBe(
      'INVOICE_NOT_DRAFT',
    );
  });

  it('émission : numéro du compteur, copie figée, totaux au taux du jour', async () => {
    prisma.invoice.findFirst.mockResolvedValue(draft);
    tx.$queryRaw.mockResolvedValue([{ last: 7 }]);
    tx.invoice.updateMany.mockResolvedValue({ count: 1 });
    await service.issue('A', 'o1', 'inv-1');

    const { where, data } = tx.invoice.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: 'inv-1', agencyId: 'A', status: 'DRAFT' });
    expect(data).toMatchObject({
      status: 'ISSUED',
      number: `FAC-${new Date().getUTCFullYear()}-0007`,
      totalHt: 25_000,
      totalVat: 4_500,
      totalTtc: 29_500,
    });
    expect(data.snapshot).toMatchObject({
      templateName: 'Classique',
      vatRate: 18,
      agency: { companyName: 'Keur Immo SARL', ninea: '00123452G3' },
    });
  });

  it('émission concurrente : la seconde échoue et la transaction est annulée', async () => {
    prisma.invoice.findFirst.mockResolvedValue(draft);
    tx.$queryRaw.mockResolvedValue([{ last: 8 }]);
    tx.invoice.updateMany.mockResolvedValue({ count: 0 });
    await expect(errorCodeOf(service.issue('A', 'o1', 'inv-1'))).resolves.toBe('INVOICE_NOT_DRAFT');
  });

  it('PDF d’une facture émise : rendu depuis la copie figée, sans relire l’agence ni le modèle', async () => {
    const snapshot: InvoiceSnapshot = {
      version: 1,
      templateName: 'Classique',
      config: { ...classic.config, showLogo: false },
      vatRate: 18,
      agency: { ...agencyRow, address: 'Ancienne adresse', logoUrl: null, stampUrl: null },
      booking: null,
      property: null,
    };
    prisma.invoice.findFirst.mockResolvedValue({
      ...draft,
      status: 'ISSUED',
      number: 'FAC-2026-0001',
      issuedAt: new Date('2026-10-02'),
      snapshot,
    });
    const { filename, pdf } = await service.pdf('A', 'o1', 'inv-1');
    expect(filename).toBe('FAC-2026-0001.pdf');
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(prisma.agency.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.invoiceTemplate.findFirst).not.toHaveBeenCalled();
  });

  it('payée : seulement une facture émise, à une date ni future ni antérieure à l’émission', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      ...draft,
      status: 'ISSUED',
      issuedAt: new Date('2026-10-02T10:00:00Z'),
    });
    await expect(
      errorCodeOf(service.pay('A', 'o1', 'inv-1', { paidAt: '2999-01-01', method: 'CASH' })),
    ).resolves.toBe('PAID_IN_FUTURE');
    await expect(
      errorCodeOf(service.pay('A', 'o1', 'inv-1', { paidAt: '2026-10-01', method: 'CASH' })),
    ).resolves.toBe('PAID_BEFORE_ISSUE');
    prisma.invoice.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      errorCodeOf(service.pay('A', 'o1', 'inv-1', { paidAt: '2026-10-02', method: 'CASH' })),
    ).resolves.toBe('INVOICE_WRONG_STATUS');
    expect(prisma.invoice.updateMany.mock.calls[0][0].where.status).toBe('ISSUED');
  });

  it('annulation : émise ou payée seulement (un brouillon se supprime)', async () => {
    prisma.invoice.findFirst.mockResolvedValue(draft);
    prisma.invoice.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      errorCodeOf(service.cancel('A', 'o1', 'inv-1', { reason: 'Erreur de montant' })),
    ).resolves.toBe('INVOICE_WRONG_STATUS');
    expect(prisma.invoice.updateMany.mock.calls[0][0].where.status).toEqual({
      in: ['ISSUED', 'PAID'],
    });
  });

  it('quota mensuel atteint : émission refusée dans la transaction, rien d’émis', async () => {
    prisma.invoice.findFirst.mockResolvedValue(draft);
    tx.$queryRaw.mockResolvedValue([{ last: 6 }]);
    policy.countInvoicesThisMonth.mockResolvedValue(5);
    policy.checkCapacity.mockReturnValue({ allowed: false });
    await expect(errorCodeOf(service.issue('A', 'o1', 'inv-1'))).resolves.toBe(
      'INVOICE_CAPACITY_REACHED',
    );
    // Compté dans la transaction (après le verrou du compteur), sans rien émettre
    expect(policy.countInvoicesThisMonth.mock.calls[0][2]).toBe(tx);
    expect(policy.checkCapacity.mock.calls[0][1]).toBe('manage_invoices');
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('facture émise (version 2) : images lues en base, jamais sur Cloudinary', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    tx.invoiceAsset.findMany.mockResolvedValue([]);
    prisma.invoice.findFirst.mockResolvedValue({
      ...draft,
      status: 'ISSUED',
      number: 'FAC-2026-0002',
      issuedAt: new Date('2026-10-02'),
      snapshot: {
        version: 2,
        templateName: 'Classique',
        config: classic.config,
        vatRate: 18,
        agency: {
          ...agencyRow,
          logoUrl: 'https://res.cloudinary.com/x/logo.png',
          stampUrl: null,
          logoAsset: 'abc',
          stampAsset: null,
        },
        booking: null,
        property: null,
      },
    });
    await service.pdf('A', 'o1', 'inv-1');
    expect(tx.invoiceAsset.findMany).toHaveBeenCalledWith({ where: { id: { in: ['abc'] } } });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
