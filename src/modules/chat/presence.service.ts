import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const TTL = 60; // secondes — le client envoie un heartbeat toutes les 30s
const KEY = (uid: string) => `presence:${uid}`;

@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.redis = new Redis(this.config.getOrThrow('REDIS_URL'));
  }
  onModuleDestroy() {
    this.redis.quit();
  }

  async setOnline(userId: string, socketId: string) {
    await this.redis.sadd(KEY(userId), socketId);
    await this.redis.expire(KEY(userId), TTL);
  }

  async setOffline(userId: string, socketId: string) {
    await this.redis.srem(KEY(userId), socketId);
  }

  async refreshTtl(userId: string) {
    await this.redis.expire(KEY(userId), TTL);
  }

  async isOnline(userId: string): Promise<boolean> {
    return (await this.redis.scard(KEY(userId))) > 0;
  }

  /** Batch check — un seul aller-retour Redis */
  async getOnlineMap(userIds: string[]): Promise<Record<string, boolean>> {
    if (!userIds.length) return {};
    const pipeline = this.redis.pipeline();
    userIds.forEach((uid) => pipeline.scard(KEY(uid)));
    const results = await pipeline.exec();
    return Object.fromEntries(
      userIds.map((uid, i) => [uid, ((results?.[i]?.[1] as number) ?? 0) > 0]),
    );
  }
}
