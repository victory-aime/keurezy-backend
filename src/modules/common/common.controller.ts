import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PermissionsService } from '_root/modules/common/services/permissions.service';
import { AuthorizeRoles, MiddlewareGuard } from '_root/guard/middleware.guard';
import { AllowAnonymous, AuthGuard } from '@thallesp/nestjs-better-auth';
import { Role } from '../../../prisma/generated/enums';
import { API_URL } from '_root/config/api';
import { CommonService } from '_root/modules/common/common.service';
import { SubscriptionLimitService } from '_root/modules/common/services/subscription-limit.service';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Common')
@Controller()
export class CommonController {
  constructor(
    private readonly permissionService: PermissionsService,
    private readonly commonService: CommonService,
    private readonly subscriptionLimitService: SubscriptionLimitService, // ✅ ajouté
  ) {}

  @Get(API_URL.COMMON.PERMS)
  @UseGuards(AuthGuard, MiddlewareGuard)
  @AuthorizeRoles(Role.AGENCY_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Récupérer toutes les permissions assignables d'une agence" })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: 'Liste des permissions récupérée avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async getAllPerms(@Query('agencyId') agencyId: string) {
    return this.permissionService.getAssignableFeatures(agencyId);
  }

  @Get(API_URL.COMMON.PACKS)
  @AllowAnonymous()
  @ApiOperation({ summary: 'Récupérer tous les plans disponibles (public)' })
  @ApiOkResponse({ description: 'Liste des plans récupérée avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async getAllPacks() {
    return this.commonService.getAllPlans();
  }

  @Get('v1/secure/common/usage')
  @AllowAnonymous() // ⚠️ TEMPORAIRE
  @ApiOperation({
    summary: "Récupérer le résumé d'utilisation des limites d'abonnement d'une agence",
  })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: "Résumé d'utilisation récupéré avec succès" })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async getUsageSummary(@Query('agencyId') agencyId: string) {
    return this.subscriptionLimitService.getUsageSummary(agencyId);
  }
}
