import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { PaymentsController } from './payments.controller';
import { AdminPaymentController } from './admin-payment.controller';
import { PaymentService } from './services/payment.service';
import { NabooService } from './services/naboo.service';
import { PaymentAdminService } from './services/payment-admin.service';

/**
 * Paiements : initiation, webhook et suivi (Naboo), administration des transactions.
 * NabooService encapsule le fournisseur externe.
 */
@Module({
  imports: [
    HttpModule.register({ timeout: 15_000, maxRedirects: 3 }),
    ConfigModule,
    CloudinaryModule,
  ],
  controllers: [PaymentsController, AdminPaymentController],
  providers: [PaymentService, NabooService, PaymentAdminService],
  exports: [PaymentService],
})
export class PaymentsModule {}
