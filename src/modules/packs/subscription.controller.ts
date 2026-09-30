import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { API_URL } from '../../config/api';
import { AgencyProfileId } from '../../guard/current-user.decorator';
import { SubscriptionService } from './subscription.service';

/** Abonnement de l'agence, côté propriétaire (page « Mon abonnement »). */
@ApiTags('Subscription')
@Controller()
@ApiBearerAuth()
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get(API_URL.AGENCY.SUBSCRIPTION)
  @ApiOperation({
    summary: "Abonnement, consommation et fonctionnalités de l'agence (propriétaire)",
  })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: 'Souscription (ou null), consommation par quota, fonctionnalités' })
  @ApiForbiddenResponse({ description: 'OWNER_ONLY : réservé au propriétaire' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  getSubscription(@Query('agencyId') agencyId: string, @AgencyProfileId() userId: string) {
    return this.subscriptionService.getOverview(agencyId, userId);
  }
}
