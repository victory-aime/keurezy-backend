import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { NabooSignatureGuard } from '_root/guard/naboo.guard';
import { PaymentService } from '_root/modules/common/services/payment.service';

@ApiTags('Common')
@Controller()
export class CommonController {
  private readonly logger = new Logger(CommonController.name);
  constructor(
    private readonly permissionService: PermissionsService,
    private readonly commonService: CommonService,
    private readonly paymentService: PaymentService,
    private readonly subscriptionLimitService: SubscriptionLimitService,
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
  @AllowAnonymous()
  @ApiOperation({
    summary: "Récupérer le résumé d'utilisation des limites d'abonnement d'une agence",
  })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: "Résumé d'utilisation récupéré avec succès" })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async getUsageSummary(@Query('agencyId') agencyId: string) {
    return this.subscriptionLimitService.getUsageSummary(agencyId);
  }

  @AllowAnonymous()
  @Post('webhooks/naboo')
  @UseGuards(NabooSignatureGuard)
  @HttpCode(HttpStatus.OK)
  handleWebhook(@Body() payload: any) {
    setImmediate(() => {
      this.paymentService.handleWebhook(payload).catch((err) => {
        this.logger.error('Erreur traitement webhook:', err.message, err.stack);
      });
    });
    return { received: true };
  }

  @AllowAnonymous()
  @Get(API_URL.COMMON.PAYMENT_POLLING)
  getPaymentStatus(@Query('orderId') orderId: string) {
    return this.paymentService.getPaymentStatus(orderId);
  }
}
