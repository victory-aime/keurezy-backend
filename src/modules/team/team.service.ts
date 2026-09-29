import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../../../prisma/generated/client';
import { PrismaService } from '../../database/prisma.service';
import { HttpError } from '../../config/http.error';
import { AgencyService } from '../agency/agency.service';
import { PermissionsService } from '../packs/permissions.service';
import { UpdateStaffPermissionsDto } from './team.dto';

const TEAM_MEMBER_INCLUDE = {
  user: { select: { id: true, name: true, email: true, status: true } },
  permissions: { include: { permission: { include: { feature: true } } } },
} satisfies Prisma.StaffInclude;

type TeamMemberRecord = Prisma.StaffGetPayload<{ include: typeof TEAM_MEMBER_INCLUDE }>;

const toTeamMember = (member: TeamMemberRecord) => ({
  id: member.id,
  userId: member.userId,
  name: member.user.name,
  email: member.user.email,
  role: member.agencyRole,
  status: member.user?.status,
  createdAt: member.createdAt,
  permissions: member.permissions,
});

const ownerOnly = (action: string) =>
  new HttpError(
    `Seul le propriétaire de l'agence peut ${action}`,
    HttpStatus.FORBIDDEN,
    'OWNER_ONLY',
  );

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agencyService: AgencyService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async getTeamListByAgencyId(agencyId: string, userId: string) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    const agency = await this.agencyService.findAgency(agencyId, userId);

    if (!agency) {
      throw new HttpError('Not found');
    }

    const teamMembers = await this.prisma.staff.findMany({
      where: { agencyId: agency.id },
      include: TEAM_MEMBER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return teamMembers.map(toTeamMember);
  }

  async enableOrDisabledAccount(
    data: { status: boolean; id: string },
    agencyId: string,
    ownerId: string,
  ): Promise<{ message: string }> {
    const actor = await this.agencyService.agencyAccessControl(agencyId, ownerId);

    if (actor.type !== 'OWNER') throw ownerOnly("modifier le statut d'un membre");

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

  /**
   * Retire un membre (owner uniquement) : son travail est désassigné (pas supprimé), son profil
   * et ses permissions disparaissent, son compte est désactivé et ses sessions sont fermées.
   */
  async removeMember(staffId: string, agencyId: string, ownerId: string) {
    const actor = await this.agencyService.agencyAccessControl(agencyId, ownerId);
    if (actor.type !== 'OWNER') throw ownerOnly("retirer un membre de l'équipe");

    const member = await this.prisma.staff.findFirst({
      where: { id: staffId, agencyId },
      select: { id: true, userId: true },
    });
    if (!member) {
      throw new HttpError('Membre introuvable', HttpStatus.NOT_FOUND, 'STAFF_NOT_FOUND');
    }

    await this.prisma.$transaction([
      this.prisma.visit.updateMany({ where: { agentId: member.id }, data: { agentId: null } }),
      this.prisma.ticket.updateMany({
        where: { assignedToId: member.id },
        data: { assignedToId: null },
      }),
      this.prisma.staff.delete({ where: { id: member.id } }),
      this.prisma.user.update({ where: { id: member.userId }, data: { status: 'INACTIVE' } }),
      this.prisma.session.deleteMany({ where: { userId: member.userId } }),
    ]);

    return { message: "Le membre a été retiré de l'équipe." };
  }

  /**
   * Remplace les permissions d'un membre (owner uniquement). Seules les permissions des
   * features incluses dans le plan actif de l'agence peuvent être accordées.
   * Les droits sont relus à chaque requête : ils s'appliquent dès la session suivante du membre.
   */
  async updateMemberPermissions(
    dto: UpdateStaffPermissionsDto,
    agencyId: string,
    profileId: string,
  ) {
    const actor = await this.agencyService.agencyAccessControl(agencyId, profileId);
    if (actor.type !== 'OWNER') throw ownerOnly("modifier les permissions d'un membre");

    const member = await this.prisma.staff.findFirst({
      where: { id: dto.staffId, agencyId },
      select: { id: true },
    });
    if (!member) {
      throw new HttpError('Membre introuvable', HttpStatus.NOT_FOUND, 'STAFF_NOT_FOUND');
    }

    const assignable = await this.permissionsService.getAssignablePermissionIds(agencyId);
    if (dto.permissionIds.some((id) => !assignable.has(id))) {
      throw new HttpError(
        'Certaines permissions ne sont pas incluses dans votre plan',
        HttpStatus.BAD_REQUEST,
        'PERMISSIONS_NOT_ASSIGNABLE',
      );
    }

    const now = new Date();
    const grantedBy = actor.userOwnerId ?? null;
    await this.prisma.$transaction([
      // Retirées : supprimées ; conservées : réactivées si besoin ; nouvelles : créées
      this.prisma.staffPermission.deleteMany({
        where: { staffId: member.id, permissionId: { notIn: dto.permissionIds } },
      }),
      this.prisma.staffPermission.updateMany({
        where: { staffId: member.id, permissionId: { in: dto.permissionIds }, granted: false },
        data: { granted: true, grantedBy, grantedAt: now },
      }),
      this.prisma.staffPermission.createMany({
        data: dto.permissionIds.map((permissionId) => ({
          staffId: member.id,
          permissionId,
          granted: true,
          grantedBy,
          grantedAt: now,
        })),
        skipDuplicates: true,
      }),
    ]);

    const updated = await this.prisma.staff.findUniqueOrThrow({
      where: { id: member.id },
      include: TEAM_MEMBER_INCLUDE,
    });
    return {
      message: 'Les permissions du membre ont été mises à jour.',
      member: toTeamMember(updated),
    };
  }
}
