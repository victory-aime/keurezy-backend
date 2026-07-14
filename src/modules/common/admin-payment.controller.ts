import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import { AuthorizeRoles, MiddlewareGuard } from '../../guard/middleware.guard';
import { Role, PaymentStatus } from '../../../prisma/generated/enums';
import { PaymentAdminService } from './services/payment-admin.service';
import { API_URL } from '../../config/api';
import { convertToInteger } from '../../config/convert';
import { NabooPayoutParams, NabooPayoutPayload, NabooTransactionParams } from './naboo';

@ApiTags('Super Admin - Paiements')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, MiddlewareGuard)
@AuthorizeRoles(Role.SUPER_ADMIN)
export class AdminPaymentController {
  constructor(private readonly paymentAdminService: PaymentAdminService) {}

  // GET /api/v1/secure/admin/payments
  @Get(API_URL.PAYMENT_ADMIN.LIST)
  @ApiOperation({
    summary: 'Lister toutes les transactions',
    description: 'Retourne la liste paginée des transactions avec filtrage optionnel par statut.',
  })
  @ApiQuery({ name: 'initialPage', required: false, example: 1 })
  @ApiQuery({ name: 'limitPerPage', required: false, example: 10 })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: PaymentStatus,
    description: 'Filtrer par statut',
  })
  @ApiOkResponse({ description: 'Liste des transactions récupérée avec succès' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  async getAllTransactions(@Query() data: NabooTransactionParams) {
    const page = convertToInteger(data?.page!) || 1;
    const limit = convertToInteger(data.limit!) || 10;
    const min_amount = convertToInteger(data.min_amount!);
    const max_amount = convertToInteger(data.max_amount!);
    return this.paymentAdminService.getAllTransactions({
      ...data,
      max_amount,
      min_amount,
      page,
      limit,
    });
  }

  // GET /api/v1/secure/admin/payments/detail
  @Get(API_URL.PAYMENT_ADMIN.DETAIL)
  @ApiOperation({ summary: "Détail d'une transaction par ID" })
  @ApiQuery({ name: 'id', description: 'Identifiant de la transaction' })
  @ApiOkResponse({ description: 'Transaction récupérée avec succès' })
  @ApiBadRequestResponse({ description: 'Transaction introuvable' })
  async getTransactionById(@Query('id') id: string) {
    return this.paymentAdminService.getTransactionById(id);
  }

  @Post(API_URL.PAYMENT_ADMIN.REFUND)
  @ApiOperation({
    summary: 'Rembourser une transaction',
    description: 'Seules les transactions avec le statut PAID peuvent être remboursées.',
  })
  @ApiQuery({ name: 'id', description: 'Identifiant de la transaction' })
  @ApiOkResponse({ description: 'Transaction remboursée avec succès' })
  @ApiBadRequestResponse({ description: 'Transaction introuvable ou non remboursable' })
  async refundTransaction(@Query('id') id: string, @Body() data: NabooPayoutPayload) {
    const amount = convertToInteger(data.amount);
    return this.paymentAdminService.refundTransaction(id, { ...data, amount });
  }

  @Get(API_URL.PAYMENT_ADMIN.ALL_REFUNDS)
  async getAllPayouts(@Query() data: NabooPayoutParams) {
    const page = convertToInteger(data?.page!) || 1;
    const limit = convertToInteger(data.limit!) || 10;
    const min_amount = convertToInteger(data.min_amount!);
    const max_amount = convertToInteger(data.max_amount!);
    return this.paymentAdminService.getAllPayouts({
      ...data,
      max_amount,
      min_amount,
      page,
      limit,
    });
  }

  @Get(API_URL.PAYMENT_ADMIN.REFUND_ID)
  async getPayoutById(@Query('order_id') order_id: string) {
    return this.paymentAdminService.getPayoutById(order_id);
  }
}
