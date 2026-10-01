import { HttpError } from '../../config/http.error';
import { DEFAULT_INVOICE_TEMPLATES } from './invoice-template.config';
import { InvoiceTemplatesService } from './invoice-templates.service';

jest.mock('../agency/agency.service', () => ({ AgencyService: class {} }));

const errorCodeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: HttpError) => (error.getResponse() as { errorCode: string }).errorCode,
  );

describe('InvoiceTemplatesService', () => {
  const prisma = {
    invoiceTemplate: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    agency: { findUniqueOrThrow: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const agencyService = { agencyAccessControl: jest.fn() };
  const service = new InvoiceTemplatesService(prisma as never, agencyService as never);
  const classic = DEFAULT_INVOICE_TEMPLATES[0];
  const commonTemplate = {
    id: 'classic-id',
    name: 'Classique',
    defaultKey: 'CLASSIC',
    agencyId: null,
    config: classic.config,
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'OWNER' });
    prisma.invoiceTemplate.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'new-id', defaultKey: null, updatedAt: new Date(), ...data }),
    );
  });

  it('crée ou met à jour les 3 modèles communs au démarrage', async () => {
    await service.onModuleInit();
    expect(prisma.invoiceTemplate.upsert).toHaveBeenCalledTimes(3);
    expect(prisma.invoiceTemplate.upsert.mock.calls[0][0].where).toEqual({ defaultKey: 'CLASSIC' });
  });

  it('modifier un modèle commun crée une copie pour l’agence, sans toucher l’original', async () => {
    prisma.invoiceTemplate.findFirst.mockResolvedValue(commonTemplate);
    const view = await service.update('A', 'o1', 'classic-id', { config: classic.config });
    expect(prisma.invoiceTemplate.update).not.toHaveBeenCalled();
    expect(prisma.invoiceTemplate.create.mock.calls[0][0].data).toMatchObject({
      agencyId: 'A',
      name: 'Classique (personnalisé)',
    });
    expect(view).toMatchObject({ id: 'new-id', isDefault: false });
  });

  it('un modèle d’une autre agence est introuvable ; un modèle commun ne se supprime pas', async () => {
    prisma.invoiceTemplate.findFirst.mockResolvedValue(null);
    await expect(
      errorCodeOf(service.update('A', 'o1', 'other', { config: classic.config })),
    ).resolves.toBe('TEMPLATE_NOT_FOUND');
    expect(prisma.invoiceTemplate.findFirst.mock.calls[0][0].where).toEqual({
      id: 'other',
      OR: [{ agencyId: null }, { agencyId: 'A' }],
    });

    prisma.invoiceTemplate.findFirst.mockResolvedValue(commonTemplate);
    await expect(errorCodeOf(service.remove('A', 'o1', 'classic-id'))).resolves.toBe(
      'DEFAULT_TEMPLATE_LOCKED',
    );
  });

  it('refuse une variable inconnue et le staff en écriture', async () => {
    const config = {
      ...classic.config,
      texts: { ...classic.config.texts, intro: '{{client.secret}}' },
    };
    await expect(errorCodeOf(service.create('A', 'o1', { name: 'X', config }))).resolves.toBe(
      'UNKNOWN_VARIABLES',
    );
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'STAFF' });
    await expect(
      errorCodeOf(service.create('A', 's1', { name: 'X', config: classic.config })),
    ).resolves.toBe('OWNER_ONLY');
    expect(prisma.invoiceTemplate.create).not.toHaveBeenCalled();
  });

  it('sans modèle par défaut choisi (ou supprimé), Classique est proposé', async () => {
    prisma.invoiceTemplate.findMany.mockResolvedValue([commonTemplate]);
    prisma.agency.findUniqueOrThrow.mockResolvedValue({
      vatRate: { toString: () => '18' },
      invoicePrefix: 'FAC',
      defaultInvoiceTemplateId: 'deleted-id',
    });
    await expect(service.list('A', 's1')).resolves.toMatchObject({
      settings: { vatRate: 18, invoicePrefix: 'FAC', defaultTemplateId: 'classic-id' },
    });
  });

  it('aperçu : un PDF avec les informations de l’agence', async () => {
    prisma.agency.findUniqueOrThrow.mockResolvedValue({
      name: 'Keur Immo',
      companyName: null,
      ninea: null,
      rccm: null,
      address: 'Dakar',
      billingAddress: null,
      phone: null,
      email: 'a@b.sn',
      billingEmail: null,
      bankName: null,
      bankAccount: null,
      mobileMoneyNumber: null,
      agencyLogo: null,
      vatRate: { toString: () => '0' },
    });
    const pdf = await service.preview('A', 's1', classic.config);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
