import { LeadsService } from './leads.service';
import { HttpError } from '../../config/http.error';
import { LeadStatus } from '../../../prisma/generated/enums';

// Dépendances mockées : évite de charger Better Auth (ESM) dans Jest
jest.mock('../agency/agency.service', () => ({ AgencyService: class {} }));
jest.mock('../notifications/notifications.service', () => ({ NotificationsService: class {} }));
jest.mock('../chat/chat.service', () => ({ ChatService: class {} }));

describe('LeadsService — contrôle d’accès', () => {
  const prisma = {
    lead: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    staff: { findFirst: jest.fn() },
  };
  const agencyService = { agencyAccessControl: jest.fn() };
  const service = new LeadsService(
    prisma as never,
    agencyService as never,
    { notifyStaff: jest.fn() } as never,
    { handleLeadReassignment: jest.fn() } as never,
  );

  const denied = new HttpError('Accès refusé à cette agence', 403, 'AGENCY_ACCESS_DENIED');

  beforeEach(() => jest.resetAllMocks());

  it("vérifie l'accès sur l'agence du lead, pas sur une agence fournie par le client", async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', agencyId: 'agency-B' });
    agencyService.agencyAccessControl.mockRejectedValue(denied);

    await expect(service.getLeadById('lead-1', 'profile-A')).rejects.toBe(denied);
    expect(agencyService.agencyAccessControl).toHaveBeenCalledWith('agency-B', 'profile-A');
  });

  it("met à jour le statut après contrôle sur l'agence du lead (ancien bug : leadId passé comme agencyId)", async () => {
    prisma.lead.findUnique.mockResolvedValue({
      id: 'lead-1',
      agencyId: 'agency-A',
      status: LeadStatus.NEW,
    });
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'OWNER' });

    await service.updateLeadStatus({ leadId: 'lead-1', status: LeadStatus.CONTACTED }, 'profile-A');

    expect(agencyService.agencyAccessControl).toHaveBeenCalledWith('agency-A', 'profile-A');
    expect(prisma.lead.update).toHaveBeenCalled();
  });

  it("n'assigne pas un lead d'une autre agence", async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', agencyId: 'agency-B' });
    agencyService.agencyAccessControl.mockRejectedValue(denied);

    await expect(
      service.assignLead({ leadId: 'lead-1', staffId: 'staff-1' }, 'profile-A'),
    ).rejects.toBe(denied);
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it("ne supprime pas un lead d'une autre agence", async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', agencyId: 'agency-B' });
    agencyService.agencyAccessControl.mockRejectedValue(denied);

    await expect(service.deleteLead('lead-1', 'profile-A')).rejects.toBe(denied);
    expect(prisma.lead.delete).not.toHaveBeenCalled();
  });
});
