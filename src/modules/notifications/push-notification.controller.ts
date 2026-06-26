import { Body, Controller, Delete, Post, Query } from '@nestjs/common';
import { RegisterPushNotificationTokenDto } from './notifications.dto';
import { API_URL } from '_root/config/api';
import { PushNotificationService } from './push-notification.service';

@Controller()
export class PushNotificationController {
  constructor(private readonly pushNotificationService: PushNotificationService) {}

  @Post(API_URL.NOTIFICATION.REGISTER_PUSH_TOKEN)
  register(@Query('userId') userId: string, @Body() dto: RegisterPushNotificationTokenDto) {
    return this.pushNotificationService.registerDeviceToken(userId, dto);
  }

  @Delete(API_URL.NOTIFICATION.REMOVE_PUSH_TOKEN)
  deactivate(@Query('token') token: string) {
    return this.pushNotificationService.removeDeviceToken(token);
  }
}
