import { Module } from '@nestjs/common';
import { PushSubscriptionService } from './push-subscription.service';
import { PushSubscriptionController } from './push-subscription.controller';

@Module({
  controllers: [PushSubscriptionController],
  providers: [PushSubscriptionService],
  exports: [PushSubscriptionService],
})
export class PushSubscriptionModule {}
