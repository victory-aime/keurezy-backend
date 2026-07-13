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
import { MiddlewareGuard } from '_root/guard/middleware.guard';
import { AllowAnonymous, AuthGuard } from '@thallesp/nestjs-better-auth';
import { API_URL } from '_root/config/api';
import { CommonService } from '_root/modules/common/common.service';
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
  ) {}

  @Get(API_URL.COMMON.PERMS)
  @UseGuards(AuthGuard, MiddlewareGuard)
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
