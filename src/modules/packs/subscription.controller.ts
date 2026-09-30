import { Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
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
import { AllowWhenInactive } from '../../guard/active-subscription.guard';

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

  @Get(API_URL.AGENCY.SUBSCRIPTION_CANCEL_IMPACT)
  @ApiOperation({ summary: 'Ce que la résiliation entraîne à l’échéance (propriétaire)' })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({
    description: 'Fin de période, annonces en ligne, membres actifs, réservations à venir',
  })
  @ApiForbiddenResponse({ description: 'OWNER_ONLY : réservé au propriétaire' })
  @ApiNotFoundResponse({ description: 'SUBSCRIPTION_NOT_FOUND' })
  @ApiConflictResponse({ description: 'SUBSCRIPTION_EXPIRED : abonnement déjà expiré' })
  getCancelImpact(@Query('agencyId') agencyId: string, @AgencyProfileId() userId: string) {
    return this.subscriptionService.getCancelImpact(agencyId, userId);
  }

  @AllowWhenInactive()
  @Post(API_URL.AGENCY.SUBSCRIPTION_CANCEL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Résilier à la fin de la période (propriétaire, idempotent)' })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: '{ cancelAtPeriodEnd: true, activeUntil }' })
  @ApiForbiddenResponse({ description: 'OWNER_ONLY : réservé au propriétaire' })
  @ApiConflictResponse({ description: 'SUBSCRIPTION_EXPIRED : abonnement déjà expiré' })
  cancel(@Query('agencyId') agencyId: string, @AgencyProfileId() userId: string) {
    return this.subscriptionService.cancel(agencyId, userId);
  }

  @AllowWhenInactive()
  @Post(API_URL.AGENCY.SUBSCRIPTION_RESUME)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Annuler la résiliation programmée (propriétaire, idempotent)' })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: '{ cancelAtPeriodEnd: false, activeUntil }' })
  @ApiForbiddenResponse({ description: 'OWNER_ONLY : réservé au propriétaire' })
  @ApiConflictResponse({
    description: 'SUBSCRIPTION_EXPIRED : expiré, la réactivation passe par un paiement',
  })
  resume(@Query('agencyId') agencyId: string, @AgencyProfileId() userId: string) {
    return this.subscriptionService.resume(agencyId, userId);
  }
}
