import { Module } from '@nestjs/common';
import { PermissionsService } from './services/permissions.service';
import { CommonController } from './common.controller';
import { CommonService } from '_root/modules/common/common.service';
import { PaymentService } from '_root/modules/common/services/payment.service';
import { NabooService } from '_root/modules/common/services/naboo.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { PaymentAdminService } from './services/payment-admin.service';
import { AdminPaymentController } from './admin-payment.controller';
import { FirebaseService } from '_root/modules/common/services/firebase.service';
import { FeaturesAdminService } from './services/features-admin.service';
import { AdminFeaturesController } from './admin-features.controller';
import { PlanFeaturePolicyService } from './services/plan-feature-policy.service';

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
