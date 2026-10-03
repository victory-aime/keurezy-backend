import { AgencyAdminService } from './agency-admin.service';

describe('AgencyAdminService.updateAgencyStatus : vérification', () => {
  const prisma = { agency: { findUnique: jest.fn(), update: jest.fn() } };
  const service = new AgencyAdminService(prisma as never);
  const complete = {
    companyName: 'Keur Immo SARL',
    legalForm: 'SARL',
    ninea: '00123452G3',
    rccm: 'SN-DKR-2020-B-12345',
    billingAddress: 'Rue 10, Dakar',
    billingEmail: 'compta@keur.sn',
    legalFormProofUrl: 'https://res.cloudinary.com/k/raw/upload/statuts.pdf',
    nineaProofUrl: 'https://res.cloudinary.com/k/image/upload/ninea.png',
    rccmProofUrl: 'https://res.cloudinary.com/k/raw/upload/rccm.pdf',
  };

  beforeEach(() => jest.clearAllMocks());

  it('informations légales complètes : ouverte et vérifiée', async () => {
    prisma.agency.findUnique.mockResolvedValue({ id: 'A', ...complete });
    await expect(service.updateAgencyStatus('A', 'OPEN')).resolves.toMatchObject({
      isVerified: true,
      legalMissing: [],
    });
    expect(prisma.agency.update.mock.calls[0][0].data).toEqual({
      status: 'OPEN',
      isVerified: true,
    });
  });

  it('informations incomplètes : ouverte mais non vérifiée, avec ce qui manque', async () => {
    prisma.agency.findUnique.mockResolvedValue({ id: 'A', ...complete, ninea: null, rccm: null });
    await expect(service.updateAgencyStatus('A', 'OPEN')).resolves.toMatchObject({
      isVerified: false,
      legalMissing: ['ninea', 'rccm'],
    });
    expect(prisma.agency.update.mock.calls[0][0].data).toEqual({
      status: 'OPEN',
      isVerified: false,
    });
  });

  it('sans pièce justificative, l’agence n’est pas vérifiée', async () => {
    prisma.agency.findUnique.mockResolvedValue({ id: 'A', ...complete, rccmProofUrl: null });
    await expect(service.updateAgencyStatus('A', 'OPEN')).resolves.toMatchObject({
      isVerified: false,
      legalMissing: ['rccmProofUrl'],
    });
  });
});
