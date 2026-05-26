import { Body, Controller, Delete, Param, Post, Query } from '@nestjs/common';
import { PushSubscriptionService } from './push-subscription.service';
import { RegisterSubscriptionDto } from './register-subscription.dto';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

@Controller('push-subscription')
@AllowAnonymous()
export class PushSubscriptionController {
  constructor(private readonly svc: PushSubscriptionService) {}

  @Post('register')
  register(@Query('id') userId: string, @Body() dto: RegisterSubscriptionDto) {
    return this.svc.register(userId, dto);
  }

  @Delete(':deviceId')
  deactivate(@Query('id') userId: string, @Param('deviceId') deviceId: string) {
    return this.svc.deactivate(userId, deviceId);
  }
}
