import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AllowAnonymous, AuthGuard } from '@thallesp/nestjs-better-auth';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { MiddlewareGuard } from '../../guard/middleware.guard';
import { InvitationService } from './invitation.service';
import { API_URL } from '../../config/api';
import { AgencyProfileId, CurrentUserId } from '../../guard/current-user.decorator';
import { AcceptInvitationDto, CreateInvitationDto, InvitationTokenDto } from './invitation.dto';
import { RequirePermission } from '../../guard/permission.guard';
import { Throttle } from '@nestjs/throttler';
import { SENSITIVE_THROTTLE } from '../../config/throttle';
import { AllowWhenInactive } from '../../guard/active-subscription.guard';

@ApiTags('Invitation')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, MiddlewareGuard)
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  @Get(API_URL.INVITATION.AGENCY_INVITE_LIST)
  @RequirePermission('view_users')
  @ApiOperation({ summary: "Lister toutes les invitations d'une agence" })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: 'Liste des invitations récupérée avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async AllAgencyInviteList(
    @Query('agencyId') agencyId: string,
    @AgencyProfileId() userId: string,
  ) {
    return this.invitationService.getAllInviteByAgencyId(agencyId, userId);
  }

  @Post(API_URL.INVITATION.CREATE_INVITE)
  @RequirePermission('send_invitation')
  @ApiOperation({ summary: 'Créer et envoyer une invitation à un membre (Owner + Admin)' })
  @ApiBody({ type: CreateInvitationDto })
  @ApiOkResponse({ description: 'Invitation envoyée avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async createInvitation(
    @Body()
    data: CreateInvitationDto,
    @CurrentUserId() adminId: string,
    @AgencyProfileId() userId: string,
  ) {
    return this.invitationService.createInvitation(data, { adminId, userId });
  }

  @Get(API_URL.INVITATION.PREVIEW_INVITE)
  @AllowAnonymous()
  @ApiOperation({
    summary: "Aperçu d'une invitation (lecture seule)",
    description:
      "Affiché à l'ouverture du lien : agence, rôle, permissions, e-mail masqué. Ne modifie rien.",
  })
  @ApiQuery({ name: 'token', required: true, description: "Jeton d'invitation reçu par e-mail" })
  @ApiOkResponse({ description: "Aperçu de l'invitation" })
  @ApiBadRequestResponse({ description: 'Invitation expirée, déjà utilisée ou annulée' })
  async previewInvitation(@Query('token') token: string) {
    return this.invitationService.previewInvitation(token);
  }

  @Post(API_URL.INVITATION.SEND_INVITE_CODE)
  @Throttle(SENSITIVE_THROTTLE)
  @AllowAnonymous()
  @ApiOperation({ summary: "Envoyer le code de confirmation à l'adresse invitée" })
  @ApiBody({ type: InvitationTokenDto })
  @ApiOkResponse({ description: 'Code envoyé (validité et délai avant renvoi, en secondes)' })
  async sendInvitationCode(@Body() { token }: InvitationTokenDto) {
    return this.invitationService.sendInvitationCode(token);
  }

  @Post(API_URL.INVITATION.ACCEPT_INVITE)
  @Throttle(SENSITIVE_THROTTLE)
  @AllowAnonymous()
  @ApiOperation({
    summary: 'Accepter une invitation avec le code reçu et le mot de passe choisi',
  })
  @ApiBody({ type: AcceptInvitationDto })
  @ApiOkResponse({ description: 'Invitation acceptée : compte créé ou réactivé, e-mail vérifié' })
  @ApiBadRequestResponse({ description: 'Code invalide ou expiré, invitation non valable' })
  async acceptInvitation(@Body() data: AcceptInvitationDto) {
    return this.invitationService.acceptInvitation(data);
  }

  @AllowWhenInactive()
  @Post(API_URL.INVITATION.CANCEL_INVITE)
  @RequirePermission('cancel_invitation')
  @ApiOperation({ summary: 'Annuler une invitation (Owner + Admin)' })
  @ApiQuery({ name: 'inviteId', required: true, description: "Identifiant de l'invitation" })
  @ApiOkResponse({ description: 'Invitation annulée avec succès' })
  @ApiBadRequestResponse({ description: 'Invitation introuvable ou déjà acceptée' })
  async cancelInvitation(@Query('inviteId') inviteId: string, @AgencyProfileId() userId: string) {
    return this.invitationService.cancelledInvitation(inviteId, userId);
  }

  @Post(API_URL.INVITATION.RESEND_INVITE)
  @RequirePermission('resend_invitation')
  @ApiOperation({ summary: 'Renvoyer une invitation en attente (7 jours de validité en plus)' })
  @ApiQuery({ name: 'inviteId', required: true, description: "Identifiant de l'invitation" })
  @ApiOkResponse({ description: 'Invitation renvoyée avec succès' })
  async resendInvitation(@Query('inviteId') inviteId: string, @AgencyProfileId() userId: string) {
    return this.invitationService.resendInvitation(inviteId, userId);
  }
}
