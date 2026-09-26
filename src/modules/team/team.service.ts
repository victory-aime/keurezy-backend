import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { HttpError } from '../../config/http.error';
import { AgencyService } from '../agency/agency.service';

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agencyService: AgencyService,
  ) {}

  async getTeamListByAgencyId(agencyId: string, userId: string) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    const agency = await this.agencyService.findAgency(agencyId, userId);

    if (!agency) {
      throw new HttpError('Not found');
    }

    const teamMembers = await this.prisma.staff.findMany({
      where: { agencyId: agency.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
          },
        },
        permissions: {
          include: {
            permission: {
              include: {
                feature: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return teamMembers.map((member) => ({
      id: member.id,
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      role: member.agencyRole,
      status: member.user?.status,
      createdAt: member.createdAt,
      permissions: member.permissions,
    }));
  }

  async enableOrDisabledAccount(
    data: { status: boolean; id: string },
    agencyId: string,
    ownerId: string,
  ): Promise<{ message: string }> {
    const actor = await this.agencyService.agencyAccessControl(agencyId, ownerId);

    if (actor.type !== 'OWNER') {
      throw new HttpError(
        "Seul le propriétaire de l'agence peut modifier le statut d'un membre",
        HttpStatus.FORBIDDEN,
        'OWNER_ONLY',
      );
    }

    // Le membre ciblé doit appartenir à l'agence ; son userId est déduit, jamais lu du client.
    const member = await this.prisma.staff.findFirst({
      where: { id: data.id, agencyId },
      select: { id: true, userId: true },
    });

    if (!member) {
      throw new HttpError('Membre introuvable', HttpStatus.NOT_FOUND, 'STAFF_NOT_FOUND');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: member.userId },
        data: {
          status: data.status ? 'ACTIVE' : 'INACTIVE',
        },
      }),
      this.prisma.staff.update({
        where: { id: member.id },
        data: { isActive: data.status },
      }),
    ]);
    return {
      message: `Le compte a été ${data.status ? 'activé' : 'désactivé'} avec succès.`,
    };
  }
}
