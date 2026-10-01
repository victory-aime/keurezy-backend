import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiUnprocessableEntityResponse,
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
import { ActivateAssetDto } from './asset-activation.dto';
import { SubscriptionChangeService } from './subscription-change.service';
import { CheckoutDto, SubscriptionTargetDto } from './subscription-change.dto';

/** Abonnement de l'agence, côté propriétaire (page « Mon abonnement »). */
@ApiTags('Subscription')
@Controller()
@ApiBearerAuth()
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly changeService: SubscriptionChangeService,
  ) {}

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

  @Post(API_URL.AGENCY.SUBSCRIPTION_ACTIVATE_ASSET)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réactiver un bien désactivé, dans la limite du plan (propriétaire)' })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: '{ isActive: true }' })
  @ApiForbiddenResponse({ description: 'OWNER_ONLY ou PROPERTY_CAPACITY_REACHED' })
  @ApiNotFoundResponse({ description: "ASSET_NOT_FOUND : bien absent ou d'une autre agence" })
  activateAsset(
    @Query('agencyId') agencyId: string,
    @Body() body: ActivateAssetDto,
    @AgencyProfileId() userId: string,
  ) {
    return this.subscriptionService.activateAsset(agencyId, userId, body);
  }

  @Get(API_URL.AGENCY.SUBSCRIPTION_QUOTE)
  @ApiOperation({ summary: "Devis d'un changement de plan ou d'un renouvellement (propriétaire)" })
  @ApiOkResponse({
    description:
      '{ kind, amount, currency, effectiveAt, newPeriodEnd, excess } ; excess liste les éléments en surplus',
  })
  @ApiForbiddenResponse({ description: 'OWNER_ONLY : réservé au propriétaire' })
  @ApiNotFoundResponse({ description: 'SUBSCRIPTION_NOT_FOUND ou PLAN_NOT_FOUND' })
  getQuote(@Query() query: SubscriptionTargetDto, @AgencyProfileId() userId: string) {
    return this.changeService.getQuote(query.agencyId, userId, query.planId, query.billingCycle);
  }

  @AllowWhenInactive() // la réactivation passe par un paiement
  @Post(API_URL.AGENCY.SUBSCRIPTION_CHECKOUT)
  @ApiOperation({
    summary: 'Payer un renouvellement, un upgrade ou une réactivation (propriétaire)',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Une clé par intention de paiement, renvoyée à chaque nouvelle tentative',
  })
  @ApiOkResponse({ description: '{ checkoutUrl, orderId } ; même clé → même checkout' })
  @ApiBadRequestResponse({ description: 'IDEMPOTENCY_KEY_REQUIRED, DOWNGRADE_NOT_PAYABLE' })
  @ApiUnprocessableEntityResponse({
    description:
      'IDEMPOTENCY_KEY_REUSED, SELECTION_REQUIRED, SELECTION_INVALID, SELECTION_EXCEEDS_LIMIT',
  })
  @ApiForbiddenResponse({ description: 'OWNER_ONLY : réservé au propriétaire' })
  createCheckout(
    @Body() body: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @AgencyProfileId() userId: string,
  ) {
    const { agencyId, ...target } = body;
    return this.changeService.createCheckout(agencyId, userId, target, idempotencyKey);
  }

  @Get(API_URL.AGENCY.SUBSCRIPTION_PAYMENT)
  @ApiOperation({ summary: "Statut d'un paiement d'abonnement de l'agence (propriétaire)" })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiQuery({ name: 'orderId', required: true, description: 'Commande NabooPay' })
  @ApiOkResponse({ description: '{ status: PENDING | PAID | FAILED | CANCELLED }' })
  @ApiNotFoundResponse({
    description: "PAYMENT_NOT_FOUND : commande absente ou d'une autre agence",
  })
  getPaymentStatus(
    @Query('agencyId') agencyId: string,
    @Query('orderId') orderId: string,
    @AgencyProfileId() userId: string,
  ) {
    return this.changeService.getPaymentStatus(agencyId, userId, orderId);
  }

  @Post(API_URL.AGENCY.SUBSCRIPTION_SCHEDULE_CHANGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Programmer un downgrade pour l'échéance (propriétaire)" })
  @ApiOkResponse({ description: '{ planId, billingCycle, effectiveAt, keep }' })
  @ApiBadRequestResponse({
    description: 'NOT_A_DOWNGRADE : un upgrade ou un renouvellement se paie',
  })
  @ApiUnprocessableEntityResponse({
    description: 'SELECTION_REQUIRED, SELECTION_INVALID, SELECTION_EXCEEDS_LIMIT',
  })
  @ApiForbiddenResponse({ description: 'OWNER_ONLY : réservé au propriétaire' })
  scheduleChange(@Body() body: CheckoutDto, @AgencyProfileId() userId: string) {
    const { agencyId, ...target } = body;
    return this.changeService.scheduleChange(agencyId, userId, target);
  }

  @Delete(API_URL.AGENCY.SUBSCRIPTION_SCHEDULED_CHANGE)
  @ApiOperation({ summary: 'Annuler le downgrade programmé (propriétaire, idempotent)' })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: '{ scheduledChange: null }' })
  @ApiForbiddenResponse({ description: 'OWNER_ONLY : réservé au propriétaire' })
  cancelScheduledChange(@Query('agencyId') agencyId: string, @AgencyProfileId() userId: string) {
    return this.changeService.cancelScheduledChange(agencyId, userId);
  }
}
