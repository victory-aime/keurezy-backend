// src/notifications/web-push.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';
import { ConfigService } from '@nestjs/config';
import { PushPayload } from './dto/push-job';
import { PushSubscription } from '../../../prisma/generated/client';

@Injectable()
export class WebPushService implements OnModuleInit {
  private readonly logger = new Logger(WebPushService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    webpush.setVapidDetails(
      `mailto:${this.config.getOrThrow('VAPID_EMAIL')}`,
      this.config.getOrThrow('VAPID_PUBLIC_KEY'),
      this.config.getOrThrow('VAPID_PRIVATE_KEY'),
    );
  }

  async send(subs: PushSubscription[], payload: PushPayload): Promise<void> {
    const valid = subs.filter((s) => s.endpoint && s.p256dh && s.authKey);
    if (!valid.length) return;

    const results = await Promise.allSettled(
      valid.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint!, keys: { p256dh: s.p256dh!, auth: s.authKey! } },
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            icon: '/icons/icon-192.png',
            data: payload.data,
          }),
        ),
      ),
    );

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        this.logger.warn(`Web push failed for sub ${valid[i].id}`, r.reason?.statusCode);
      }
    });
  }
}
