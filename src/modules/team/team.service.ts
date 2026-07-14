import { Injectable } from '@nestjs/common';
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
    data: { status: boolean; id: string; userId: string },
    agencyId: string,
    ownerId: string,
  ): Promise<{ message: string }> {
    await this.agencyService.agencyAccessControl(agencyId, ownerId);

    await this.prisma.user.update({
      where: { id: data.userId },
      data: {
        status: data.status ? 'ACTIVE' : 'INACTIVE',
      },
    });
    await this.prisma.staff.update({
      where: { id: data.id },
      data: { isActive: data.status },
    });
    return {
      message: `Le compte a été ${data.status ? 'activé' : 'désactivé'} avec succès.`,
    };
  }
}
