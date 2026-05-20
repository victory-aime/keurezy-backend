import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { InvitationService } from '_root/modules/invitations/invitation.service';
import { AgencyRole, Role } from '../../../prisma/generated/enums';
import { AuthorizeRoles, MiddlewareGuard } from '_root/guard/middleware.guard';
import { AllowAnonymous, AuthGuard } from '@thallesp/nestjs-better-auth';
import { API_URL } from '_root/config/api';
import { CreateInvitationDto } from '_root/modules/invitations/invitation.dto';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Invitation')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, MiddlewareGuard)
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  @Get(API_URL.INVITATION.AGENCY_INVITE_LIST)
  @ApiOperation({ summary: "Lister toutes les invitations d'une agence" })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiQuery({ name: 'userId', required: true, description: "Identifiant de l'utilisateur" })
  @ApiOkResponse({ description: 'Liste des invitations récupérée avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async AllAgencyInviteList(@Query('agencyId') agencyId: string, @Query('userId') userId: string) {
    return this.invitationService.getAllInviteByAgencyId(agencyId, userId);
  }

  @Post(API_URL.INVITATION.CREATE_INVITE)
  @AuthorizeRoles(Role.OWNER, Role.AGENCY_ADMIN)
  @ApiOperation({ summary: 'Créer et envoyer une invitation à un membre (Owner + Admin)' })
  @ApiBody({ type: CreateInvitationDto })
  @ApiOkResponse({ description: 'Invitation envoyée avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async createInvitation(
    @Body()
    data: CreateInvitationDto,
  ) {
    return this.invitationService.createInvitation(data);
  }

  @Post(API_URL.INVITATION.ACCEPT_INVITE)
  @AllowAnonymous()
  @ApiOperation({ summary: 'Accepter une invitation via le token reçu par email' })
  @ApiQuery({ name: 'token', required: true, description: "Token d'invitation reçu par email" })
  @ApiOkResponse({ description: 'Invitation acceptée avec succès' })
  @ApiBadRequestResponse({ description: 'Token invalide ou expiré' })
  async acceptInvitation(@Query('token') token: string) {
    return this.invitationService.acceptInvitation(token);
  }

  @Post(API_URL.INVITATION.CANCEL_INVITE)
  @AuthorizeRoles(Role.OWNER, Role.AGENCY_ADMIN)
  @ApiOperation({ summary: 'Annuler une invitation (Owner + Admin)' })
  @ApiQuery({ name: 'inviteId', required: true, description: "Identifiant de l'invitation" })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiQuery({ name: 'userId', required: true, description: "Identifiant de l'utilisateur" })
  @ApiOkResponse({ description: 'Invitation annulée avec succès' })
  @ApiBadRequestResponse({ description: 'Invitation introuvable ou déjà acceptée' })
  async cancelInvitation(
    @Query('inviteId') inviteId: string,
    @Query('agencyId') agencyId: string,
    @Query('userId') userId: string,
  ) {
    return this.invitationService.cancelledInvitation(inviteId, agencyId, userId);
  }
}
