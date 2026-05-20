import { Module } from '@nestjs/common';
import { PermissionsService } from './services/permissions.service';
import { CommonController } from './common.controller';
import { CommonService } from '_root/modules/common/common.service';
import { SubscriptionLimitService } from './services/subscription-limit.service';

@Module({
  imports: [],
  controllers: [CommonController],
  providers: [PermissionsService, CommonService, SubscriptionLimitService], // ✅
  exports: [PermissionsService, SubscriptionLimitService], // ✅
})
export class CommonModule {}
