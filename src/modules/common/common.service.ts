import { Injectable } from '@nestjs/common';
import { PrismaService } from '_root/database/prisma.service';

@Injectable()
export class CommonService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllPlans() {
    return this.prisma.subscriptionPlan.findMany({
      where: {
        planCategory: 'SUBSCRIPTION_BASED',
        isActive: true,
      },
      include: {
        planFeatures: { include: { feature: true }, orderBy: { limit: 'desc' } },
        pricings: true,
      },
      orderBy: { pricingType: 'asc' },
    });
  }
}
