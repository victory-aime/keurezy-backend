// src/notifications/notifications.controller.ts
import { Body, Controller, Post, Query, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PUSH_QUEUE, PushJobData } from './dto/push-job';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { FirebaseService } from '_root/modules/common/services/firebase-admin.service';
import { firebaseAdmin } from '_root/lib/firebase-admin';

class TestPushDto {
  @IsOptional()
  @IsUUID()
  targetUserId?: string; // si absent → s'envoie à soi-même

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;
}

@Controller('notifications')
@AllowAnonymous()
export class NotificationsTestController {
  //constructor(@InjectQueue(PUSH_QUEUE) private readonly pushQueue: Queue<PushJobData>) {}
  constructor(private readonly firebaseService: FirebaseService) {}

  /**
   * POST /notifications/test
   * Permet de tester la livraison push sans envoyer de vrai message.
   * Body : { targetUserId?, title?, body? }
   */
  // @Post('test')
  // async testPush(@Query('id') currentUserId: string, @Body() dto: TestPushDto) {
  //   const userId = dto.targetUserId ?? currentUserId;
  //
  //   await this.pushQueue.add(
  //     'test-push',
  //     {
  //       userIds: [userId],
  //       payload: {
  //         title: dto.title ?? '🔔 Test notification',
  //         body: dto.body ?? 'Push notification fonctionnelle !',
  //         data: { type: 'test', ts: Date.now() },
  //       },
  //     },
  //     { attempts: 1, removeOnComplete: true },
  //   );
  //
  //   return { queued: true, targetUserId: userId };
  // }

  @Post('push')
  async sendTestNotification(@Body() body: { token: string }) {
    const message = {
      token: body.token,
      notification: {
        title: '🔥 Test Notification',
        body: 'Hello from NestJS + FCM',
      },
      data: {
        type: 'TEST',
      },
    };

    const response = await this.firebaseService.getMessaging().send(message);

    return {
      success: true,
      messageId: response,
    };
  }
}
