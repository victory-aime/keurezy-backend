import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAssignableFeatures(agencyId: string) {
    return this.prisma.feature.findMany({
      where: {
        planFeatures: {
          some: {
            enabled: true,
            plan: {
              subscriptions: { some: { agencyId, status: 'ACTIVE' } },
            },
          },
        },
      },
      include: {
        planFeatures: {
          where: {
            plan: {
              subscriptions: { some: { agencyId, status: 'ACTIVE' } },
            },
          },
          select: { limit: true, enabled: true },
        },
        permissions: {
          select: {
            id: true,
            name: true,
            description: true,
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { category: 'asc' },
    });
  }
}
