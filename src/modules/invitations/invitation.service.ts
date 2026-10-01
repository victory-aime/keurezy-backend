import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { AgencyService } from '../agency/agency.service';
import { PrismaService } from '../../database/prisma.service';
import { ResendService } from '../mail/resend.service';
import { PlanFeaturePolicyService } from '../packs/plan-feature-policy.service';
import { AcceptInvitationDto, CreateInvitationDto } from './invitation.dto';
import { EXPIRE_TIME, FeatureCommercial } from '../../config/enum';
import { HttpError } from '../../config/http.error';
import { OTP_SETTINGS } from '../../config/otp';
import { consumeOneTimeCode, issueOneTimeCode, maskEmail } from '../../config/one-time-code';

/** Identifiant du code d'invitation dans `verification` : lié à l'invitation. */
const invitationCodeIdentifier = (invitationId: string) => `invitation-${invitationId}`;
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

  async createInvitation(
    { agencyId, payload }: CreateInvitationDto,
    actor: { adminId: string; userId: string },
  ) {
    const { adminId, userId } = actor;
    await this.agencyService.agencyAccessControl(agencyId, userId);
    await this.assertInvitableEmail(payload.email);

    const context = await this.planFeaturePolicy.getAgencyFeatureContext(agencyId);

    const currentProperties = await this.planFeaturePolicy.countUserSeats(agencyId);

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

    // 4. Créer l'invitation avec les permissions pré-configurées
    const invitation = await this.prisma.invitation.create({
      data: {
        name: payload.name,
        email: payload.email,
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

    // 5. E-mail avec le seul lien : l'invité choisit son mot de passe à l'acceptation
    await this.resendService.sendInvitationEmail({
      sendTo: invitation.email,
      email: invitation.email,
      token: invitation.token,
      agencyName: agency.name,
      username: invitation.name,
    });

    return {
      message: 'Invitation envoyée avec succès.',
    };
  }

  /**
   * Adresse invitable : inconnue, ou compte désactivé sans profil (ancien membre retiré).
   * Les anciennes invitations clôturées de l'adresse sont purgées (e-mail unique).
   */
  async assertInvitableEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { status: true, staff: true, owner: true, client: true },
    });
    if (user && (user.status !== 'INACTIVE' || user.staff || user.owner || user.client)) {
      throw new HttpError(
        'Cette adresse appartient déjà à un compte actif : seuls les comptes désactivés peuvent être réinvités.',
        HttpStatus.CONFLICT,
        'USER_NOT_INVITABLE',
      );
    }

    const pending = await this.prisma.invitation.findFirst({
      where: { email, status: 'PENDING' },
      select: { id: true },
    });
    if (pending) {
      throw new HttpError(
        'Une invitation est déjà en attente pour cette adresse : renvoyez-la plutôt.',
        HttpStatus.CONFLICT,
        'INVITATION_ALREADY_PENDING',
      );
    }
    await this.prisma.invitation.deleteMany({ where: { email, status: { not: 'PENDING' } } });
  }

  /**
   * Invitation en attente pour ce jeton, avec ce qu'il faut pour l'aperçu et l'acceptation.
   * Une invitation expirée est marquée EXPIRED. Erreurs neutres : rien sur le compte ciblé.
   */
  private async findPendingInvitation(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: {
        agency: { select: { name: true, agencyLogo: true } },
        permissions: {
          include: { Permission: { select: { featureId: true, name: true, description: true } } },
        },
      },
    });
    if (!invitation) {
      throw new HttpError('Invitation introuvable.', HttpStatus.NOT_FOUND, 'INVITATION_NOT_FOUND');
    }
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
      throw new HttpError('Invitation expirée.', HttpStatus.BAD_REQUEST, 'INVITATION_EXPIRED');
    }
    return invitation;
  }

  /**
   * Aperçu en lecture seule, affiché à l'ouverture du lien : ne modifie rien (un scanner de
   * liens qui ouvre l'URL ne consomme plus l'invitation).
   */
  async previewInvitation(token: string) {
    const invitation = await this.findPendingInvitation(token);
    const inviter = await this.prisma.user.findUnique({
      where: { id: invitation.invitedBy },
      select: { name: true },
    });
    return {
      agency: { name: invitation.agency.name, logo: invitation.agency.agencyLogo },
      invitedBy: inviter?.name ?? invitation.agency.name,
      role: invitation.agencyRole,
      permissions: invitation.permissions
        .filter((p) => p.granted && p.Permission)
        .map((p) => p.Permission!.description ?? p.Permission!.name),
      maskedEmail: maskEmail(invitation.email),
      expiresAt: invitation.expiresAt,
    };
  }

  /**
   * Envoie un code à 6 chiffres à l'adresse invitée : il prouve la possession de la boîte.
   * Le code est stocké haché, lié à l'invitation, avec un délai minimal entre deux envois.
   */
  async sendInvitationCode(token: string) {
    const invitation = await this.findPendingInvitation(token);
    const code = await issueOneTimeCode(
      this.prisma,
      invitationCodeIdentifier(invitation.id),
      'INVITATION_CODE',
      OTP_SETTINGS,
    );
    await this.resendService.sendVerificationOTP(invitation.email, code, 'invitation');
    return { expiresIn: OTP_SETTINGS.expiresIn, retryIn: OTP_SETTINGS.resendCooldown };
  }

  /**
   * Acceptation volontaire : code valide et mot de passe choisi par l'invité. En une seule
   * transaction : compte créé (ou ancien membre réactivé, même userId) avec l'e-mail vérifié,
   * profil Staff, permissions encore couvertes par le plan, invitation ACCEPTED. Aucun secret
   * n'est renvoyé : le front connecte l'invité avec le mot de passe qu'il vient de saisir.
   */
  async acceptInvitation({ token, code, password }: AcceptInvitationDto) {
    const invitation = await this.findPendingInvitation(token);
    await consumeOneTimeCode(
      this.prisma,
      invitationCodeIdentifier(invitation.id),
      code,
      'INVITATION_CODE',
    );

    // Features encore autorisées au moment de l'acceptation (le plan a pu changer)
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
    const allowedFeatureIds = new Set(currentPlanFeatures.map((f) => f.featureId));
    const validPermissions = invitation.permissions.filter((p) =>
      allowedFeatureIds.has(p?.Permission?.featureId!),
    );

    const { password: hasher } = await getAuthInstance().$context;
    const passwordHash = await hasher.hash(password);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email: invitation.email },
        select: { id: true },
      });
      const userData = {
        role: invitation.agencyRole,
        status: 'ACTIVE' as const,
        emailVerified: true,
      };

      let userId: string;
      if (existing) {
        // Ancien membre retiré puis réinvité : même compte, nouveau mot de passe
        userId = existing.id;
        await tx.user.update({ where: { id: userId }, data: userData });
        const updated = await tx.account.updateMany({
          where: { userId, providerId: 'credential' },
          data: { password: passwordHash },
        });
        if (!updated.count) {
          await tx.account.create({
            data: { userId, accountId: userId, providerId: 'credential', password: passwordHash },
          });
        }
      } else {
        const user = await tx.user.create({
          data: { name: invitation.name, email: invitation.email, ...userData },
        });
        userId = user.id;
        await tx.account.create({
          data: { userId, accountId: userId, providerId: 'credential', password: passwordHash },
        });
      }

      const staff = await tx.staff.create({
        data: { userId, agencyId: invitation.agencyId, agencyRole: invitation.agencyRole },
      });
      await tx.staffPermission.createMany({
        data: validPermissions.map((p) => ({
          staffId: staff.id,
          permissionId: p.permissionId,
          granted: p.granted,
          grantedBy: invitation.invitedBy,
        })),
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED' },
      });
    });

    return { message: 'Invitation acceptée.', email: invitation.email };
  }

  async cancelledInvitation(id: string, userId: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id },
      select: { agencyId: true },
    });
    if (!invitation) {
      throw new HttpError('Invitation introuvable', HttpStatus.NOT_FOUND, 'INVITATION_NOT_FOUND');
    }
    await this.agencyService.agencyAccessControl(invitation.agencyId, userId);
    await this.prisma.invitation.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    return {
      message: 'Invitation annulée avec succès.',
    };
  }

  /** Renvoie une invitation en attente : 7 jours de validité en plus et le lien par e-mail. */
  async resendInvitation(id: string, userId: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id },
      include: { agency: { select: { name: true } } },
    });
    if (!invitation) {
      throw new HttpError('Invitation introuvable', HttpStatus.NOT_FOUND, 'INVITATION_NOT_FOUND');
    }
    await this.agencyService.agencyAccessControl(invitation.agencyId, userId);

    if (invitation.status !== 'PENDING') {
      throw new HttpError(
        'Seule une invitation en attente peut être renvoyée',
        HttpStatus.BAD_REQUEST,
        'INVITATION_NOT_PENDING',
      );
    }

    await this.prisma.invitation.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() + EXPIRE_TIME._7_DAYS * 1000) },
    });
    await this.resendService.sendInvitationEmail({
      sendTo: invitation.email,
      email: invitation.email,
      token: invitation.token,
      agencyName: invitation.agency.name,
      username: invitation.name,
    });

    return { message: 'Invitation renvoyée avec succès.' };
  }
}
