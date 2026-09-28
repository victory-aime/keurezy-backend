import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import Expo, { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { NotificationType } from '../../../prisma/generated/enums';
import { PrismaService } from '../../database/prisma.service';
import { NotificationSound } from '../preferences/notification-preferences';

/** Canaux Android créés par l'application mobile (même identifiants). */
export const MOBILE_PUSH_CHANNELS = {
  MESSAGES: 'messages',
  BOOKINGS: 'bookings',
  DEFAULT: 'default',
} as const;

export interface MobilePushMessage {
  token: string;
  title: string;
  body: string;
  type: NotificationType;
  data: Record<string, string>;
  badge?: number;
  /** Son choisi par l'utilisateur (défaut du système sinon) */
  sound?: NotificationSound;
}

/**
 * Fichiers embarqués par l'application (iOS : nom du fichier ; Android : le son est porté
 * par le canal, décliné en `<canal>_<son>`, créé par l'application).
 */
const SOUND_FILES: Record<Exclude<NotificationSound, 'DEFAULT' | 'NONE'>, string> = {
  SOFT: 'soft.wav',
  CHIME: 'chime.wav',
};

const soundFor = (sound: NotificationSound = 'DEFAULT') =>
  sound === 'NONE' ? null : sound === 'DEFAULT' ? 'default' : SOUND_FILES[sound];

const channelWithSound = (channel: string, sound: NotificationSound = 'DEFAULT') =>
  sound === 'DEFAULT' ? channel : `${channel}_${sound.toLowerCase()}`;

/** Jeton masqué pour les logs (6 derniers caractères) */
const maskToken = (token: string) => `…${token.replace(/\]$/, '').slice(-6)}`;

/** Accusés en attente de vérification : borne mémoire (au-delà, les plus anciens sont ignorés). */
const MAX_PENDING_RECEIPTS = 10_000;

const channelFor = (type: NotificationType) =>
  type === NotificationType.MESSAGE
    ? MOBILE_PUSH_CHANNELS.MESSAGES
    : type === NotificationType.BOOKING
      ? MOBILE_PUSH_CHANNELS.BOOKINGS
      : MOBILE_PUSH_CHANNELS.DEFAULT;

/**
 * Envoi des notifications mobiles par le service Expo Push (relais vers FCM et APNs).
 * Les jetons refusés (application désinstallée, autorisation retirée) sont supprimés,
 * à l'envoi comme à la vérification différée des accusés.
 */
@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);
  private readonly expo: Expo;
  /** receiptId → jeton concerné */
  private readonly pendingReceipts = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    // Jeton d'accès facultatif : active la « sécurité renforcée » des envois côté Expo
    this.expo = new Expo({ accessToken: config.get<string>('EXPO_ACCESS_TOKEN') || undefined });
  }

  static isExpoToken(token: string): boolean {
    return Expo.isExpoPushToken(token);
  }

  async send(messages: MobilePushMessage[]): Promise<void> {
    const valid = messages.filter((message) => Expo.isExpoPushToken(message.token));
    if (!valid.length) return;

    const expoMessages: ExpoPushMessage[] = valid.map((message) => ({
      to: message.token,
      title: message.title,
      body: message.body,
      data: { ...message.data, type: message.type },
      sound: soundFor(message.sound),
      priority: message.type === NotificationType.MESSAGE ? 'high' : 'default',
      channelId: channelWithSound(channelFor(message.type), message.sound),
      ...(message.badge !== undefined && { badge: message.badge }),
    }));

    // Diagnostic : son demandé (iOS) et canal (Android, qui porte le son) de chaque envoi
    for (const message of expoMessages) {
      this.logger.log(
        `[push] → ${maskToken(message.to as string)} type=${String(message.data?.type)} ` +
          `sound=${JSON.stringify(message.sound ?? null)} channel=${message.channelId} badge=${message.badge ?? '-'}`,
      );
    }

    for (const chunk of this.expo.chunkPushNotifications(expoMessages)) {
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
        await this.handleTickets(
          tickets,
          chunk.map((message) => message.to as string),
        );
      } catch (error) {
        this.logger.error(`Envoi Expo Push en échec : ${String(error)}`);
      }
    }
  }

  private async handleTickets(tickets: ExpoPushTicket[], tokens: string[]) {
    const deadTokens: string[] = [];
    tickets.forEach((ticket, index) => {
      if (ticket.status === 'ok') {
        this.logger.log(
          `[push] ✓ accepté par Expo ${maskToken(tokens[index])} ticket=${ticket.id}`,
        );
        if (this.pendingReceipts.size < MAX_PENDING_RECEIPTS) {
          this.pendingReceipts.set(ticket.id, tokens[index]);
        }
      } else if (ticket.details?.error === 'DeviceNotRegistered') {
        deadTokens.push(tokens[index]);
      } else {
        this.logger.warn(
          `[push] ✗ refusé par Expo ${maskToken(tokens[index])} : ` +
            `${ticket.details?.error ?? '-'} — ${ticket.message}`,
        );
      }
    });
    await this.removeTokens(deadTokens);
  }

  /** Vérification différée des accusés (Expo les publie quelques minutes après l'envoi). */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async checkReceipts(): Promise<void> {
    if (!this.pendingReceipts.size) return;
    const pending = new Map(this.pendingReceipts);
    this.pendingReceipts.clear();

    const deadTokens: string[] = [];
    for (const ids of this.expo.chunkPushNotificationReceiptIds([...pending.keys()])) {
      try {
        const receipts = await this.expo.getPushNotificationReceiptsAsync(ids);
        for (const [id, receipt] of Object.entries(receipts)) {
          if (receipt.status !== 'error') {
            this.logger.log(`[push] ✓ livré à FCM/APNs ticket=${id}`);
            continue;
          }
          if (receipt.details?.error === 'DeviceNotRegistered') {
            const token = pending.get(id);
            if (token) deadTokens.push(token);
          } else {
            this.logger.warn(
              `Accusé Expo en erreur : ${receipt.details?.error ?? receipt.message}`,
            );
          }
        }
      } catch (error) {
        this.logger.error(`Lecture des accusés Expo en échec : ${String(error)}`);
      }
    }
    await this.removeTokens(deadTokens);
  }

  private async removeTokens(tokens: string[]) {
    if (!tokens.length) return;
    await this.prisma.deviceToken.deleteMany({ where: { token: { in: tokens } } });
    this.logger.warn(`${tokens.length} jeton(s) mobile(s) obsolète(s) supprimé(s)`);
  }
}
