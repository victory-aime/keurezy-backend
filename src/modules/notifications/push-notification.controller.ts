import { Body, Controller, Delete, Post, Query } from '@nestjs/common';
import { RegisterPushNotificationTokenDto } from './notifications.dto';
import { API_URL } from '../../config/api';
import { PushNotificationService } from './push-notification.service';
import { CurrentUserId } from '../../guard/current-user.decorator';
import { AllowWhenInactive } from '../../guard/active-subscription.guard';

@Controller()
export class PushNotificationController {
  constructor(private readonly pushNotificationService: PushNotificationService) {}

  @AllowWhenInactive()
  @Post(API_URL.NOTIFICATION.REGISTER_PUSH_TOKEN)
  register(@CurrentUserId() userId: string, @Body() dto: RegisterPushNotificationTokenDto) {
    return this.pushNotificationService.registerDeviceToken(userId, dto);
  }

  @AllowWhenInactive()
  @Delete(API_URL.NOTIFICATION.REMOVE_PUSH_TOKEN)
  deactivate(@Query('token') token: string, @CurrentUserId() userId: string) {
    return this.pushNotificationService.removeUserDeviceToken(userId, token);
  }
}
