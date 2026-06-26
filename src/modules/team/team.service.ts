import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '_root/database/prisma.service';
import { HttpError } from '../../config/http.error';
import { AgencyService } from '_root/modules/agency/agency.service';

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
    id: string,
    userId: string,
    status: boolean,
  ): Promise<{ message: string }> {
    if (!id || !userId) {
      throw new HttpError('Certaines informations sont manquantes', HttpStatus.NOT_FOUND);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: status ? 'ACTIVE' : 'INACTIVE',
      },
    });
    await this.prisma.staff.update({
      where: { id },
      data: { isActive: status },
    });
    return {
      message: `Le compte a été ${status ? 'activé' : 'désactivé'} avec succès.`,
    };
  }
}
