import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '_root/database/prisma.service';
import { HttpError } from '_root/config/http.error';
import { NabooService } from './naboo.service';
import { NabooPayoutParams, NabooPayoutPayload, NabooTransactionParams } from '../naboo';

@Injectable()
export class PaymentAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nabooService: NabooService,
  ) {}

  // ─────────────────────────────────────────
  // 1. Liste toutes les transactions
  // ─────────────────────────────────────────
  async getAllTransactions(params: NabooTransactionParams) {
    try {
      return this.nabooService.getAllTransactions(params);
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
  async getTransactionById(transactionId: string) {
    try {
      return this.nabooService.getTransactionById(transactionId);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(`Transaction introuvable`, HttpStatus.NOT_FOUND, 'TRANSACTION_NOT_FOUND');
    }
  }

  // ─────────────────────────────────────────
  // 3. Remboursement d'un paiement
  // ─────────────────────────────────────────
  async refundTransaction(
    transactionId: string,
    data: NabooPayoutPayload,
  ): Promise<{ message: string }> {
    const transaction = await this.nabooService.getTransactionById(transactionId);

    if (!transaction) {
      throw new HttpError('Transaction introuvable', HttpStatus.NOT_FOUND, 'TRANSACTION_NOT_FOUND');
    }

    if (transaction.transaction_status !== 'paid') {
      throw new HttpError(
        `Seules les transactions avec le statut "payé" peuvent être remboursées. Statut actuel : ${transaction.transaction_status}`,
        HttpStatus.BAD_REQUEST,
        'TRANSACTION_NOT_REFUNDABLE',
      );
    }

    try {
      await this.nabooService.refundTransaction(data);

      return {
        message: 'La transaction a été remboursée avec succès.',
      };
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw new HttpError(
        'Une erreur est survenue lors du remboursement.',
        HttpStatus.INTERNAL_SERVER_ERROR,
        'REFUND_FAILED',
      );
    }
  }

  async getAllPayouts(params: NabooPayoutParams) {
    try {
      return this.nabooService.refundTransactionList(params);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        'Une erreur est survenue lors de la récupération des payouts.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getPayoutById(order_id: string) {
    try {
      return this.nabooService.getRefundTransactionById(order_id);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        'Une erreur est survenue lors de la récupération du payout.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
