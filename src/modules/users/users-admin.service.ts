import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '_root/database/prisma.service';
import { UserStatus } from '../../../prisma/generated/enums';
import { HttpError } from '_root/config/http.error';
import { User } from '../../../prisma/generated/client';

@Injectable()
export class UsersAdminService {
  constructor(private readonly prismaService: PrismaService) {}

  async getAllUsers(
    page: number,
    limit: number,
  ): Promise<{
    content: User[];
    totalDataPerPages: number;
    currentPage: number;
    totalItems: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    const [data, total] = await this.prismaService.$transaction([
      this.prismaService.user.findMany({
        where: { role: { in: ['USER', 'OWNER'] } },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),

      this.prismaService.user.count({
        where: { role: { in: ['USER', 'OWNER'] } },
      }),
    ]);

    return {
      content: data,
      totalDataPerPages: limit,
      totalItems: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserById(id: string) {
    return this.prismaService.user.findUnique({
      where: { id },
      include: {
        accounts: true,
        sessions: true,
        passkeys: true,
        owner: {
          include: {
            agency: true,
          },
        },
      },
    });
  }

  async updateUserStatus(userId: string, status: UserStatus): Promise<{ message: string }> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new HttpError(`Utilisateur introuvable`, HttpStatus.NOT_FOUND, 'USER_NOT_FOUND');
    }
    try {
      await this.prismaService.user.update({
        where: { id: userId },
        data: { status },
      });
      return {
        message: `Le statut de l'utilisateur a été modifié avec succès.`,
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        'Une erreur est survenue lors de la mise à jour du statut.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
