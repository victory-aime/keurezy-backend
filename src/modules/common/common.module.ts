import { Module } from '@nestjs/common';
import { PermissionsService } from './services/permissions.service';
import { CommonController } from './common.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { PaymentAdminService } from './services/payment-admin.service';
import { AdminPaymentController } from './admin-payment.controller';
import { FeaturesAdminService } from './services/features-admin.service';
import { AdminFeaturesController } from './admin-features.controller';
import { PlanFeaturePolicyService } from './services/plan-feature-policy.service';
import { CommonService } from './common.service';
import { PaymentService } from './services/payment.service';
import { NabooService } from './services/naboo.service';
import { FirebaseService } from './services/firebase.service';

@Module({
  imports: [
    HttpModule.register({ timeout: 15_000, maxRedirects: 3 }),
    ConfigModule,
    CloudinaryModule,
  ],
  controllers: [CommonController, AdminPaymentController, AdminFeaturesController],
  providers: [
    PermissionsService,
    CommonService,
    PaymentService,
    NabooService,
    FirebaseService,
    PaymentAdminService,
    FeaturesAdminService,
    PlanFeaturePolicyService,
  ],
  exports: [
    PermissionsService,
    PaymentService,
    NabooService,
    FirebaseService,
    PaymentAdminService,
    FeaturesAdminService,
    PlanFeaturePolicyService,
  ],
})
export class CommonModule {}
