import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { AgencyService } from '../agency/agency.service';
import { PrismaService } from '../../database/prisma.service';
import { ResendService } from '../mail/resend.service';
import { PlanFeaturePolicyService } from '../common/services/plan-feature-policy.service';
import { CreateInvitationDto } from './invitation.dto';
import { EXPIRE_TIME, FeatureCommercial } from '../../config/enum';
import { HttpError } from '../../config/http.error';
import { decryptPassword, encryptPassword } from '../../config/crypto';
import { getAuthInstance } from '../../lib/auth';

@Injectable()
export class InvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resendService: ResendService,
    private readonly agencyService: AgencyService,
    private readonly planFeaturePolicy: PlanFeaturePolicyService,
  ) {}

  async getAllInviteByAgencyId(agencyId: string, userId: string) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    return this.prisma.invitation.findMany({
      where: {
        agencyId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async createInvitation({ adminId, userId, agencyId, payload }: CreateInvitationDto) {
    await this.agencyService.agencyAccessControl(agencyId, userId);

    const context = await this.planFeaturePolicy.getAgencyFeatureContext(agencyId);

    const currentProperties = await this.prisma.staff.count({
      where: {
        agencyId,
      },
    });

    const check = this.planFeaturePolicy.checkCapacity(
      context,
      FeatureCommercial.USERS,
      currentProperties,
    );

    if (!check.allowed) {
      throw new HttpError(
        "Votre capacité maximale d'utilisateur est atteinte.",
        HttpStatus.FORBIDDEN,
        'USERS_CAPACITY_REACHED',
      );
    }

    const agency = await this.prisma.agency.findUniqueOrThrow({
      where: { id: agencyId },
    });

    // 1. Features autorisées par le plan actif de l'agence
    const agencyPlanFeatures = await this.prisma.planFeature.findMany({
      where: {
        enabled: true,
        plan: {
          subscriptions: { some: { agencyId, status: 'ACTIVE' } },
        },
      },
      select: { featureId: true },
    });
    const allowedFeatureIds = new Set(agencyPlanFeatures.map((f) => f.featureId));

    // 2. Récupérer les permissions demandées avec leur featureId parent
    const requestedPermissions = await this.prisma.permission.findMany({
      where: {
        id: { in: payload.permissions.map((p) => p.permissionId) },
      },
      select: { id: true, featureId: true },
    });

    // 3. Valider que chaque permission appartient à une feature du plan
    const invalidPerms = requestedPermissions.filter((p) => !allowedFeatureIds.has(p.featureId));
    if (invalidPerms.length > 0) {
      throw new BadRequestException('Certaines permissions ne sont pas incluses dans votre plan.');
    }

    // 4. Générer le mot de passe côté serveur (jamais côté client)
    const encryptedPassword = encryptPassword(payload.temporaryPassword);

    // 5. Créer l'invitation avec les permissions pré-configurées
    const invitation = await this.prisma.invitation.create({
      data: {
        name: payload.name,
        email: payload.email,
        temporaryPassword: encryptedPassword,
        agencyId,
        agencyRole: payload.role,
        invitedBy: adminId,
        expiresAt: new Date(Date.now() + EXPIRE_TIME._7_DAYS * 1000),
        permissions: {
          create: payload.permissions.map((p) => ({
            permissionId: p.permissionId,
            granted: p.granted,
          })),
        },
      },
      include: { permissions: true },
    });

    // 6. Envoyer l'email avec le mot de passe en clair
    await this.resendService.sendInvitationEmail({
      sendTo: invitation.email,
      email: invitation.email,
      password: payload.temporaryPassword,
      token: invitation.token,
      agencyName: agency.name,
      username: invitation.name,
    });

    return {
      message: 'Invitation envoyée avec succès.',
    };
  }

  async acceptInvitation(token: string) {
    // 1. Valider le token
    const invitation = await this.prisma.invitation.findUniqueOrThrow({
      where: { token },
      include: {
        permissions: {
          include: {
            Permission: { select: { featureId: true } }, // 🔑 on remonte au featureId
          },
        },
      },
    });

    if (invitation.status !== 'PENDING') {
      throw new HttpError(
        'Invitation déjà utilisée ou annulée.',
        HttpStatus.BAD_REQUEST,
        'INVITATION_ALREADY_USED_OR_CANCELLED',
      );
    }
    if (invitation.expiresAt < new Date()) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Invitation expirée.');
    }

    // 2. Features encore autorisées au moment de l'acceptation
    //    (le plan a pu changer entre l'invitation et l'acceptation)
    const currentPlanFeatures = await this.prisma.planFeature.findMany({
      where: {
        enabled: true,
        plan: {
          subscriptions: {
            some: { agencyId: invitation.agencyId, status: 'ACTIVE' },
          },
        },
      },
      select: { featureId: true },
    });
    const currentAllowedFeatureIds = new Set(currentPlanFeatures.map((f) => f.featureId));

    return this.prisma.$transaction(async (tx) => {
      // 3. Créer le User via better-auth
      const auth = getAuthInstance();
      const { user } = await auth.api.signUpEmail({
        body: {
          email: invitation.email,
          password: decryptPassword(invitation.temporaryPassword!),
          name: invitation.name,
        },
      });

      // 4. Créer le Staff
      const newStaff = await tx.staff.create({
        data: {
          userId: user.id,
          agencyId: invitation.agencyId,
          agencyRole: invitation.agencyRole,
        },
      });

      // 5. Filtrer les permissions dont la feature parente est encore dans le plan
      const validPermissions = invitation.permissions.filter((p) =>
        currentAllowedFeatureIds.has(p?.Permission?.featureId!),
      );

      await tx.staffPermission.createMany({
        data: validPermissions.map((p) => ({
          staffId: newStaff.id,
          permissionId: p.permissionId,
          granted: p.granted,
          grantedBy: invitation.invitedBy,
        })),
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          role: invitation.agencyRole,
        },
      });

      // 6. Clôturer l'invitation et effacer le mot de passe chiffré
      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          temporaryPassword: null, // plus utile après création du compte
        },
      });
      return {
        email: user.email,
        password: decryptPassword(invitation.temporaryPassword!),
      };
    });
  }

  async cancelledInvitation(id: string, agencyId: string, userId: string) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    await this.prisma.invitation.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        temporaryPassword: null,
      },
    });
    return {
      message: 'Invitation annulée avec succès.',
    };
  }
}
