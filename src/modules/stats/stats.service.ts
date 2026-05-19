import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '_root/database/prisma.service';
import {
  LeadStatus,
  VisitStatus,
  PropertyStatus,
  TenantStatus,
} from '../../../prisma/generated/enums';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  // STATISTIQUES GLOBALES DE L'AGENCE

  async getAgencyStats(agencyId: string) {
    try {
      // PROPRIETES
      const [totalProperties, availableProperties, rentedProperties] = await Promise.all([
        this.prisma.property.count({ where: { agencyId } }),
        this.prisma.property.count({ where: { agencyId, status: PropertyStatus.AVAILABLE } }),
        this.prisma.property.count({ where: { agencyId, status: PropertyStatus.RENTED } }),
      ]);

      // LEADS
      const [totalLeads, newLeads, contactedLeads, visitPlannedLeads, convertedLeads] =
        await Promise.all([
          this.prisma.lead.count({ where: { agencyId } }),
          this.prisma.lead.count({ where: { agencyId, status: LeadStatus.NEW } }),
          this.prisma.lead.count({ where: { agencyId, status: LeadStatus.CONTACTED } }),
          this.prisma.lead.count({ where: { agencyId, status: LeadStatus.VISIT_PLANNED } }),
          this.prisma.lead.count({ where: { agencyId, status: LeadStatus.CONVERTED } }),
        ]);

      // VISITES
      const [totalVisits, plannedVisits, confirmedVisits, doneVisits, cancelledVisits] =
        await Promise.all([
          this.prisma.visit.count({ where: { agencyId } }),
          this.prisma.visit.count({ where: { agencyId, status: VisitStatus.PLANNED } }),
          this.prisma.visit.count({ where: { agencyId, status: VisitStatus.CONFIRMED } }),
          this.prisma.visit.count({ where: { agencyId, status: VisitStatus.DONE } }),
          this.prisma.visit.count({ where: { agencyId, status: VisitStatus.CANCELLED } }),
        ]);

      // LOCATAIRES
      const [totalTenants, activeTenants, inactiveTenants] = await Promise.all([
        this.prisma.tenant.count({ where: { agencyId } }),
        this.prisma.tenant.count({ where: { agencyId, status: TenantStatus.ACTIVE } }),
        this.prisma.tenant.count({ where: { agencyId, status: TenantStatus.INACTIVE } }),
      ]);

      //  STAFF
      const [totalStaff, activeStaff] = await Promise.all([
        this.prisma.staff.count({ where: { agencyId } }),
        this.prisma.staff.count({ where: { agencyId, isActive: true } }),
      ]);

      // TICKETS
      const [totalTickets, openTickets, inProgressTickets, resolvedTickets] = await Promise.all([
        this.prisma.ticket.count({ where: { agencyId } }),
        this.prisma.ticket.count({ where: { agencyId, status: 'OPEN' } }),
        this.prisma.ticket.count({ where: { agencyId, status: 'IN_PROGRESS' } }),
        this.prisma.ticket.count({ where: { agencyId, status: 'RESOLVED' } }),
      ]);

      // RETOURNER LES STATS
      return {
        properties: {
          total: totalProperties,
          available: availableProperties,
          rented: rentedProperties,
          occupancyRate:
            totalProperties > 0 ? Math.round((rentedProperties / totalProperties) * 100) : 0, // taux d'occupation en %
        },
        leads: {
          total: totalLeads,
          new: newLeads,
          contacted: contactedLeads,
          visitPlanned: visitPlannedLeads,
          converted: convertedLeads,
          conversionRate: totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0, // taux de conversion en %
        },
        visits: {
          total: totalVisits,
          planned: plannedVisits,
          confirmed: confirmedVisits,
          done: doneVisits,
          cancelled: cancelledVisits,
        },
        tenants: {
          total: totalTenants,
          active: activeTenants,
          inactive: inactiveTenants,
        },
        staff: {
          total: totalStaff,
          active: activeStaff,
          inactive: totalStaff - activeStaff,
        },
        tickets: {
          total: totalTickets,
          open: openTickets,
          inProgress: inProgressTickets,
          resolved: resolvedTickets,
        },
      };
    } catch (error) {
      console.error('Erreur getAgencyStats:', error);
      throw new InternalServerErrorException(
        'Une erreur interne est survenue. Veuillez reessayer plus tard.',
      );
    }
  }
}
