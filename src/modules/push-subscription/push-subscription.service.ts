import { Injectable } from '@nestjs/common';
import { RegisterSubscriptionDto } from './register-subscription.dto';
import { PrismaService } from '_root/database/prisma.service';

@Injectable()
export class PushSubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Upsert — même appareil = mise à jour du token, pas de doublon */
  register(userId: string, dto: RegisterSubscriptionDto) {
    const { deviceId, ...rest } = dto;
    return this.prisma.pushSubscription.upsert({
      where: { userId_deviceId: { userId, deviceId } },
      create: { userId, deviceId, ...rest, isActive: true },
      update: { ...rest, isActive: true, updatedAt: new Date() },
    });
  }

  deactivate(userId: string, deviceId: string) {
    return this.prisma.pushSubscription.updateMany({
      where: { userId, deviceId },
      data: { isActive: false },
    });
  }

  forUsers(userIds: string[]) {
    return this.prisma.pushSubscription.findMany({
      where: { userId: { in: userIds }, isActive: true },
    });
  }
}
