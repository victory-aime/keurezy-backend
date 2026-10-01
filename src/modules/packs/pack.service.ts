import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PackService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllPlans() {
    return this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      include: {
        planFeatures: { include: { feature: true }, orderBy: { limit: 'desc' } },
        pricings: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
