import { Module } from '@nestjs/common';
import { PermissionsService } from './services/permissions.service';
import { CommonController } from './common.controller';
import { CommonService } from '_root/modules/common/common.service';
import { PaymentService } from '_root/modules/common/services/payment.service';
import { NabooService } from '_root/modules/common/services/naboo.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { SubscriptionLimitService } from '_root/modules/common/services/subscription-limit.service';
import { FirebaseService } from '_root/modules/common/services/firebase-admin.service';

@Module({
  imports: [
    HttpModule.register({ timeout: 15_000, maxRedirects: 3 }),
    ConfigModule,
    CloudinaryModule,
  ],
  controllers: [CommonController],
  providers: [
    PermissionsService,
    CommonService,
    PaymentService,
    NabooService,
    SubscriptionLimitService,
    FirebaseService,
  ],
  exports: [
    PermissionsService,
    PaymentService,
    NabooService,
    SubscriptionLimitService,
    FirebaseService,
  ],
})
export class CommonModule {}
