import { HttpException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import axios, { AxiosError } from 'axios';
import {
  NABOO_ERRORS,
  NabooPayoutByIdResponse,
  NabooPayoutParams,
  NabooPayoutPayload,
  NabooPayoutResponseList,
  NabooProduct,
  NabooTransaction,
  NabooTransactionParams,
  NabooTransactionResponse,
} from '../naboo';

@Injectable()
export class NabooService {
  private readonly logger = new Logger(NabooService.name);
  private readonly baseUrl: string;
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.baseUrl = process.env.NABOOPAY_URL!;
  }

  // ── Headers d'authentification ─────────────────────────────────────────────
  private get authHeaders() {
    return {
      Authorization: `Bearer ${this.config.get<string>('NABOOPAY_API_KEY')}`,
      'Content-Type': 'application/json',
    };
  }
  private get authPayoutHeaders() {
    return {
      Authorization: `Bearer ${this.config.get<string>('NABOOPAY_API_PAYOUT_KEY')}`,
      'Content-Type': 'application/json',
    };
  }

  // ── Gestion centralisée des erreurs Axios/NabooPay ────────────────────────
  private handleError(err: AxiosError, context: string): never {
    this.logger.error(err);
    const status = err.response?.status ?? 503;
    const message = NABOO_ERRORS[status] ?? (err.response?.data as any)?.message ?? err.message;
    this.logger.error(`[${context}] ${status} — ${message}`);
    throw new HttpException(message, status);
  }

  // ── 1. Créer une transaction de collecte ───────────────────────────────────
  /**
   * Initialise une transaction NabooPay pour un abonnement SaaS.
   * fees_customer_side: true → les frais sont ajoutés au total du client.
   */
  async createTransaction(params: {
    products: NabooProduct[];
    successUrl: string;
    errorUrl: string;
  }): Promise<NabooTransaction> {
    try {
      const { data } = await axios.post<NabooTransaction>(
        `${this.baseUrl}/transactions`,
        {
          method_of_payment: ['wave', 'orange_money'],
          products: params.products,
          success_url: params.successUrl,
          error_url: params.errorUrl,
          fees_customer_side: true,
          is_escrow: false,
          is_merchant: false,
        },
        { headers: this.authHeaders },
      );
      this.logger.log(`transaction crée — order_id: ${data}`);
      return data;
    } catch (err) {
      this.handleError(err as AxiosError, 'createTransaction');
    }
  }

  // ── 2. Vérifier le statut d'une transaction (double-check webhook) ─────────
  async getTransactionById(orderId: string): Promise<NabooTransaction> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<NabooTransaction>(`${this.baseUrl}/transactions/${orderId}`, {
          headers: this.authHeaders,
        }),
      );
      this.logger.log(
        `transaction récupérée — order_id: ${data.order_id}, status: ${data.transaction_status}`,
      );
      return data;
    } catch (err) {
      this.handleError(err as AxiosError, 'getTransaction');
    }
  }

  async getAllTransactions(params?: NabooTransactionParams): Promise<{
    transactions: NabooTransactionResponse[];
    pagination: {
      page: number;
      limit: number;
      total_count: number;
      total_pages: number;
    };
  }> {
    try {
      const filters = {
        page: params?.page,
        limit: params?.limit,
        ...(params?.status && { status: params?.status }),
        ...(params?.paymentMethod && { payment_method: params?.paymentMethod }),
        ...(params?.customer_phone && { customer_phone: params?.customer_phone }),
        ...(params?.min_amount && params?.min_amount > 0 && { min_amount: params?.min_amount }),
        ...(params?.max_amount && params?.max_amount > 0 && { max_amount: params?.max_amount }),
        ...(params?.start_date && { start_date: params?.start_date }),
        ...(params?.end_date && { end_date: params?.end_date }),
      };

      this.logger.log(`filters ${JSON.stringify(filters)}`);
      const { data } = await firstValueFrom(
        this.http.get<{
          transactions: NabooTransactionResponse[];
          pagination: {
            page: number;
            limit: number;
            total_count: number;
            total_pages: number;
          };
        }>(`${this.baseUrl}/transactions`, {
          params: filters,
          headers: this.authHeaders,
        }),
      );
      this.logger.log(`transactions récupérées: ${data}`);
      return data;
    } catch (err) {
      this.handleError(err as AxiosError, 'getTransaction');
    }
  }

  async refundTransactionList(params: NabooPayoutParams) {
    const filters = {
      page: params?.page,
      limit: params?.limit,
      ...(params?.status && { status: params?.status }),
      ...(params?.payment_method && { payment_method: params?.payment_method }),
      ...(params?.recipient_phone && { customer_phone: params?.recipient_phone }),
      ...(params?.min_amount && params?.min_amount > 0 && { min_amount: params?.min_amount }),
      ...(params?.max_amount && params?.max_amount > 0 && { max_amount: params?.max_amount }),
      ...(params?.start_date && { start_date: params?.start_date }),
      ...(params?.end_date && { end_date: params?.end_date }),
    };
    try {
      const { data } = await axios.get<NabooPayoutResponseList>(`${this.baseUrl}/payouts`, {
        params: filters,
        headers: this.authHeaders,
      });
      this.logger.log(`payouts récupérés: ${data}`);
      return data;
    } catch (err) {
      this.handleError(err as AxiosError, 'refundTransactionList');
    }
  }

  async getRefundTransactionById(order_id: string) {
    try {
      const { data } = await axios.get<NabooPayoutByIdResponse>(
        `${this.baseUrl}/payouts/${order_id}`,
        {
          headers: this.authPayoutHeaders,
        },
      );
      console.log('data', data);
      this.logger.debug(`transaction recupere — order_id: ${data}`);

      return data;
    } catch (err) {
      this.handleError(err as AxiosError, 'getRefundTransactionById');
    }
  }
  async refundTransaction(payload: NabooPayoutPayload) {
    try {
      const { data } = await axios.post(`${this.baseUrl}/payouts`, payload, {
        headers: this.authHeaders,
      });
      this.logger.log(`transaction remboursé — order_id: ${data}`);
      return data;
    } catch (err) {
      this.handleError(err as AxiosError, 'refundTransaction');
    }
  }
}
