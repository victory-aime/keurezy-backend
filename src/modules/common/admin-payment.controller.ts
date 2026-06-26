import { Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
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
import { AuthorizeRoles, MiddlewareGuard } from '_root/guard/middleware.guard';
import { Role, PaymentStatus } from '../../../prisma/generated/enums';
import { PaymentAdminService } from './services/payment-admin.service';
import { API_URL } from '_root/config/api';
import { convertToInteger } from '_root/config/convert';

@ApiTags('Super Admin - Paiements')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, MiddlewareGuard)
export class AdminPaymentController {
  constructor(private readonly paymentAdminService: PaymentAdminService) {}

  // GET /api/v1/secure/admin/payments
  @Get(API_URL.PAYMENT_ADMIN.LIST)
  @AuthorizeRoles(Role.SUPER_ADMIN)
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
  async getAllTransactions(
    @Query('initialPage') initialPage: number,
    @Query('limitPerPage') limitPerPage: number,
    @Query('status') status?: PaymentStatus,
  ) {
    const page = convertToInteger(initialPage) || 1;
    const limit = convertToInteger(limitPerPage) || 10;
    return this.paymentAdminService.getAllTransactions({ page, limit, status });
  }

  // GET /api/v1/secure/admin/payments/stats
  @Get(API_URL.PAYMENT_ADMIN.STATS)
  @AuthorizeRoles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Statistiques des paiements',
    description: 'Retourne le nombre de transactions par statut et le revenu total.',
  })
  @ApiOkResponse({ description: 'Statistiques récupérées avec succès' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  async getPaymentStats() {
    return this.paymentAdminService.getPaymentStats();
  }

  // GET /api/v1/secure/admin/payments/detail
  @Get(API_URL.PAYMENT_ADMIN.DETAIL)
  @AuthorizeRoles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: "Détail d'une transaction par ID" })
  @ApiQuery({ name: 'id', description: 'Identifiant de la transaction' })
  @ApiOkResponse({ description: 'Transaction récupérée avec succès' })
  @ApiBadRequestResponse({ description: 'Transaction introuvable' })
  async getTransactionById(@Query('id') id: string) {
    return this.paymentAdminService.getTransactionById(id);
  }

  // PATCH /api/v1/secure/admin/payments/refund
  @Patch(API_URL.PAYMENT_ADMIN.REFUND)
  @AuthorizeRoles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Rembourser une transaction',
    description: 'Seules les transactions avec le statut PAID peuvent être remboursées.',
  })
  @ApiQuery({ name: 'id', description: 'Identifiant de la transaction' })
  @ApiOkResponse({ description: 'Transaction remboursée avec succès' })
  @ApiBadRequestResponse({ description: 'Transaction introuvable ou non remboursable' })
  async refundTransaction(@Query('id') id: string) {
    return this.paymentAdminService.refundTransaction(id);
  }
}
