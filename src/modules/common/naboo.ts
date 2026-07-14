import { BillingCycle, PricingType } from '../../../prisma/generated/enums';

type NabooPaidStatus =
  | 'pending'
  | 'paid'
  | 'paid_and_blocked'
  | 'refunded'
  | 'cancelled'
  | 'completed'
  | 'failed';

type NabooPaidMethod = ['wave', 'orange_money'];

export interface NabooTransaction {
  paid_at: string;
  order_id: string;
  checkout_url: string;
  amount: number;
  transaction_status: NabooPaidStatus;
  selected_payment_method?: string;
}

export interface NabooProduct {
  name: string;
  price: number; // XOF
  quantity: number;
  description?: string;
}

export const NABOO_ERRORS: Record<number, string> = {
  401: 'Clé API NabooPay invalide ou expirée',
  403: 'Accès refusé — vérifiez les permissions du compte NabooPay',
  404: 'Transaction introuvable sur NabooPay',
  429: 'Limite de taux NabooPay atteinte (100 req/min) — réessayez dans quelques secondes',
  500: 'Erreur interne NabooPay',
};

export interface NabooTransactionParams {
  page?: number;
  limit?: number;
  status?: NabooPaidStatus;
  paymentMethod?: NabooPaidMethod;
  min_amount?: number;
  max_amount?: number;
  start_date?: string;
  end_date?: string;
  customer_phone?: string;
}

export interface NabooTransactionResponse {
  order_id: string;
  amount: number;
  fees: number;
  method_of_payment: ['wave', 'orange_money'];
  selected_payment_method: string;
  currency: string;
  transaction_status: NabooPaidStatus;
  customer: {
    first_name: string;
    last_name: string;
    phone: string;
  };
  products: [
    {
      name: string;
      price: number;
      quantity: number;
    },
  ];
  is_escrow: false;
  is_merchant: false;
  fees_customer_side: false;
  created_at: string;
  updated_at: string;
  paid_at: string;
}

export interface NabooPayoutResponseList {
  payouts: {
    _id: string;
    organization_id: string;
    order_id: string;
    selected_payment_method: NabooPaidMethod;
    amount: number;
    fees: number;
    currency: string;
    payout_status: NabooPaidStatus;
    reason: string;
    created_at: string;
    is_deleted: boolean;
  }[];
  pagination: {
    page: number;
    limit: number;
    total_count: number;
    total_pages: number;
  };
}

export interface NabooPayoutByIdResponse {
  order_id: string;
  amount: number;
  fees: number;
  selected_payment_method: NabooPaidMethod;
  currency: string;
  payout_status: NabooPaidStatus;
  recipient: {
    first_name: string;
    last_name: string;
    phone: string;
  };
  reason: string;
  provider_reference: string;
  ip_address: string;
  browser: string;
  created_at: string;
  updated_at: string;
  paid_at: string;
  is_deleted: boolean;
}

export interface NabooPayoutParams {
  page?: number;
  limit?: number;
  status?: NabooPaidStatus;
  payment_method?: NabooPaidMethod;
  min_amount?: number;
  max_amount?: number;
  start_date?: string;
  end_date?: string;
  recipient_phone?: string;
}

export interface NabooPayoutPayload {
  selected_payment_method: NabooPaidMethod;
  amount: number;
  recipient: {
    first_name: string;
    last_name: string;
    phone: string;
  };
  reason: string;
}

export interface NabooWebhookPayload {
  order_id: string;
  transaction_status: string;
  amount: number;
  currency: string;
  selected_payment_method: string;
  customer?: { first_name: string; last_name: string; phone: string };
  fees: number;
  fees_customer_side: boolean;
  paid_at: string;
}

export interface AgencyOnboardingMetadata {
  userId?: string; // ID BetterAuth créé à l'initiation
  username: string;
  uploadSessionId: string;
  userEmail: string;
  password: string;
  agencyName: string;
  agencyEmail: string;
  description: string;
  address: string;
  phone: string;
  acceptTerms: boolean;
  documents: string[];
  planId: string;
  billingCycle: BillingCycle | null;
  pricingType: PricingType;
  commissionRate: string | null; // Decimal sérialisé en string pour le JSON
  pricingId: string | null; // ID du PlanPricing sélectionné
  priceXOF: number;
}
