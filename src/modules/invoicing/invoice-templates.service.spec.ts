import { HttpError } from '../../config/http.error';
import { DEFAULT_INVOICE_TEMPLATES } from './invoice-template.config';
import {
  cloudinaryPublicId,
  InvoiceTemplatesService,
  isPngOrJpeg,
} from './invoice-templates.service';

jest.mock('../agency/agency.service', () => ({ AgencyService: class {} }));
jest.mock('../cloudinary/uploads.service', () => ({ UploadsService: class {} }));
jest.mock('../cloudinary/cloudinary.service', () => ({ CloudinaryService: class {} }));
jest.mock('../packs/plan-feature-policy.service', () => ({ PlanFeaturePolicyService: class {} }));

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
  const uploads = { uploadFiles: jest.fn() };
  const cloudinary = { deleteImage: jest.fn() };
  const policy = {
    hasRoomFor: jest.fn(),
    getAgencyFeatureContext: jest.fn(),
    countInvoiceTemplates: jest.fn(),
    checkCapacity: jest.fn(),
  };
  const service = new InvoiceTemplatesService(
    prisma as never,
    agencyService as never,
    uploads as never,
    cloudinary as never,
    policy as never,
  );
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
    policy.hasRoomFor.mockResolvedValue(true);
    policy.countInvoiceTemplates.mockResolvedValue(1);
    policy.checkCapacity.mockReturnValue({ enabled: true, capacity: 3 });
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

  describe('cachet', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const file = (buffer: Buffer) =>
      ({ buffer, originalname: 'cachet.png' }) as Express.Multer.File;

    it('reconnaît PNG et JPEG à leur signature binaire, pas au nom', () => {
      expect(isPngOrJpeg(png)).toBe(true);
      expect(isPngOrJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
      expect(isPngOrJpeg(Buffer.from('<svg onload=alert(1)>'))).toBe(false);
      expect(isPngOrJpeg(undefined)).toBe(false);
    });

    it('refuse un faux PNG sans rien téléverser, et le staff', async () => {
      await expect(
        errorCodeOf(service.uploadStamp('A', 'o1', file(Buffer.from('%PDF-1.7')))),
      ).resolves.toBe('INVALID_STAMP_IMAGE');
      agencyService.agencyAccessControl.mockResolvedValue({ type: 'STAFF' });
      await expect(errorCodeOf(service.uploadStamp('A', 's1', file(png)))).resolves.toBe(
        'OWNER_ONLY',
      );
      await expect(errorCodeOf(service.removeStamp('A', 's1'))).resolves.toBe('OWNER_ONLY');
      expect(uploads.uploadFiles).not.toHaveBeenCalled();
    });

    it('enregistre l’URL Cloudinary du cachet', async () => {
      prisma.agency.findUniqueOrThrow.mockResolvedValue({ name: 'Keur Immo' });
      uploads.uploadFiles.mockResolvedValue({ secure_url: 'https://res.cloudinary.com/x/c.png' });
      await expect(service.uploadStamp('A', 'o1', file(png))).resolves.toEqual({
        stampUrl: 'https://res.cloudinary.com/x/c.png',
      });
      expect(prisma.agency.update).toHaveBeenCalledWith({
        where: { id: 'A' },
        data: { invoiceStampUrl: 'https://res.cloudinary.com/x/c.png' },
      });
    });
  });

  describe('quota de modèles', () => {
    it('création ou personnalisation refusées à la limite du plan', async () => {
      policy.hasRoomFor.mockResolvedValue(false);
      await expect(
        errorCodeOf(service.create('A', 'o1', { name: 'Loyer', config: classic.config })),
      ).resolves.toBe('INVOICE_TEMPLATE_CAPACITY_REACHED');
      prisma.invoiceTemplate.findFirst.mockResolvedValue(commonTemplate);
      await expect(
        errorCodeOf(service.update('A', 'o1', 'classic-id', { config: classic.config })),
      ).resolves.toBe('INVOICE_TEMPLATE_CAPACITY_REACHED');
      expect(prisma.invoiceTemplate.create).not.toHaveBeenCalled();
    });

    it('après un downgrade, un modèle en trop ne se modifie plus', async () => {
      prisma.invoiceTemplate.findFirst.mockResolvedValue({ ...commonTemplate, agencyId: 'A' });
      policy.countInvoiceTemplates.mockResolvedValue(2);
      policy.checkCapacity.mockReturnValue({ enabled: true, capacity: 1 });
      await expect(
        errorCodeOf(service.update('A', 'o1', 'own', { config: classic.config })),
      ).resolves.toBe('INVOICE_TEMPLATE_CAPACITY_REACHED');
      expect(prisma.invoiceTemplate.update).not.toHaveBeenCalled();
    });
  });

  it('ancien cachet retiré de Cloudinary une fois remplacé', async () => {
    prisma.agency.findUniqueOrThrow.mockResolvedValue({
      name: 'Keur Immo',
      invoiceStampUrl:
        'https://res.cloudinary.com/demo/image/upload/v1712/agency/keur/invoicing/old.png',
    });
    uploads.uploadFiles.mockResolvedValue({ secure_url: 'https://res.cloudinary.com/x/new.png' });
    await service.uploadStamp('A', 'o1', {
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      originalname: 'c.png',
    } as Express.Multer.File);
    expect(cloudinary.deleteImage).toHaveBeenCalledWith('agency/keur/invoicing/old');
  });

  it('identifiant Cloudinary : seulement pour une URL Cloudinary', () => {
    expect(cloudinaryPublicId('https://res.cloudinary.com/d/image/upload/a/b.jpg')).toBe('a/b');
    expect(cloudinaryPublicId('https://exemple.com/image/upload/a/b.jpg')).toBeNull();
    expect(cloudinaryPublicId(null)).toBeNull();
  });
});
