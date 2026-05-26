// src/notifications/expo-push.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Expo, { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { PushSubscription } from '../../../prisma/generated/client';
import { PushPayload } from './dto/push-job';

@Injectable()
export class ExpoPushService implements OnModuleInit {
  private expo: Expo;
  private readonly logger = new Logger(ExpoPushService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    // accessToken est optionnel — requis seulement pour les quotas élevés (>600 push/s)
    const accessToken = this.config.get<string>('EXPO_ACCESS_TOKEN');
    this.expo = new Expo(accessToken ? { accessToken } : undefined);
  }

  async send(subs: PushSubscription[], payload: PushPayload): Promise<void> {
    const messages: ExpoPushMessage[] = subs
      .filter((s) => s.expoToken && Expo.isExpoPushToken(s.expoToken))
      .map((s) => ({
        to: s.expoToken!,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        sound: 'default' as const,
        badge: payload.badge ?? 1,
      }));

    if (!messages.length) return;

    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      try {
        const tickets: ExpoPushTicket[] = await this.expo.sendPushNotificationsAsync(chunk);

        tickets.forEach((t) => {
          if (t.status === 'error') {
            this.logger.warn(`Expo error [${t.details?.error}]: ${t.message}`);
          }
        });
      } catch (err) {
        this.logger.error('Expo chunk failed', err);
        throw err; // BullMQ retry
      }
    }
  }
}
