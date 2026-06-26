import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '_root/database/prisma.service';
import { HttpError } from '_root/config/http.error';
import { PaymentStatus } from '../../../../prisma/generated/enums';
import { NabooService } from './naboo.service';

@Injectable()
export class PaymentAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nabooService: NabooService,
  ) {}

  // ─────────────────────────────────────────
  // 1. Liste toutes les transactions
  // ─────────────────────────────────────────
  async getAllTransactions(params: {
    page: number;
    limit: number;
    status?: PaymentStatus;
  }): Promise<{
    content: any[];
    totalDataPerPages: number;
    currentPage: number;
    totalItems: number;
    totalPages: number;
  }> {
    const { page, limit, status } = params;
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    try {
      const [data, total] = await this.prisma.$transaction([
        this.prisma.paymentTransaction.findMany({
          where,
          select: {
            id: true,
            naboo_order_id: true,
            checkout_url: true,
            amount_to_pay: true,
            status: true,
            confirmed_at: true,
            createdAt: true,
            updatedAt: true,
            plan: {
              select: {
                id: true,
                name: true,
                pricingType: true,
              },
            },
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.paymentTransaction.count({ where }),
      ]);

      return {
        content: data,
        totalDataPerPages: limit,
        currentPage: page,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        'Une erreur est survenue lors de la récupération des transactions.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─────────────────────────────────────────
  // 2. Détail d'une transaction par ID
  // ─────────────────────────────────────────
  async getTransactionById(transactionId: string): Promise<any> {
    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
      include: {
        plan: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!transaction) {
      throw new HttpError(`Transaction introuvable`, HttpStatus.NOT_FOUND, 'TRANSACTION_NOT_FOUND');
    }

    return transaction;
  }

  // ─────────────────────────────────────────
  // 3. Statistiques des paiements
  // ─────────────────────────────────────────
  async getPaymentStats(): Promise<any> {
    try {
      const [total, paid, pending, failed, cancelled, totalRevenue] =
        await this.prisma.$transaction([
          // Total transactions
          this.prisma.paymentTransaction.count(),
          // Payées
          this.prisma.paymentTransaction.count({
            where: { status: PaymentStatus.PAID },
          }),
          // En attente
          this.prisma.paymentTransaction.count({
            where: { status: PaymentStatus.PENDING },
          }),
          // Échouées
          this.prisma.paymentTransaction.count({
            where: { status: PaymentStatus.FAILED },
          }),
          // Annulées
          this.prisma.paymentTransaction.count({
            where: { status: PaymentStatus.CANCELLED },
          }),
          // Revenu total (transactions PAID uniquement)
          this.prisma.paymentTransaction.aggregate({
            where: { status: PaymentStatus.PAID },
            _sum: { amount_to_pay: true },
          }),
        ]);

      return {
        transactions: {
          total,
          paid,
          pending,
          failed,
          cancelled,
        },
        revenue: {
          total: totalRevenue._sum.amount_to_pay ?? 0,
          currency: 'XOF',
        },
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        'Une erreur est survenue lors de la récupération des statistiques.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─────────────────────────────────────────
  // 4. Remboursement d'un paiement
  // ─────────────────────────────────────────
  async refundTransaction(transactionId: string): Promise<{ message: string }> {
    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new HttpError(`Transaction introuvable`, HttpStatus.NOT_FOUND, 'TRANSACTION_NOT_FOUND');
    }

    if (transaction.status !== PaymentStatus.PAID) {
      throw new HttpError(
        `Seules les transactions PAID peuvent être remboursées. Statut actuel : ${transaction.status}`,
        HttpStatus.BAD_REQUEST,
        'TRANSACTION_NOT_REFUNDABLE',
      );
    }

    try {
      // Vérifier le statut côté NabooPay avant de rembourser
      const nabooTx = await this.nabooService.getTransaction(transaction.naboo_order_id);

      if (nabooTx.transaction_status !== 'paid') {
        throw new HttpError(
          `NabooPay indique que cette transaction n'est pas remboursable (statut: ${nabooTx.transaction_status})`,
          HttpStatus.BAD_REQUEST,
          'NABOO_NOT_REFUNDABLE',
        );
      }

      // Mettre à jour le statut en base
      await this.prisma.paymentTransaction.update({
        where: { id: transactionId },
        data: { status: PaymentStatus.CANCELLED },
      });

      return {
        message: `La transaction a été remboursée avec succès.`,
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        'Une erreur est survenue lors du remboursement.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
