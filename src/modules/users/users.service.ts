import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { User } from '../../../prisma/generated/client';
import { HttpError } from '../../config/http.error';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findUser(where: { id?: string; email?: string }) {
    if (!where.id && !where.email) return null;

    const uniqueWhere = where.id ? { id: where.id } : { email: where.email };

    const user = await this.prisma.user.findUnique({
      where: uniqueWhere,
      include: {
        accounts: {
          select: {
            providerId: true,
          },
        },
        owner: {
          select: {
            id: true,
            agency: {
              select: {
                id: true,
              },
            },
          },
        },
        client: {
          select: {
            id: true,
          },
        },
        staff: {
          include: {
            agency: {
              select: {
                id: true,
              },
            },
            permissions: {
              where: { granted: true },
              include: {
                permission: {
                  select: {
                    id: true,
                    name: true,
                    feature: { select: { name: true, category: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      theme_color: user?.theme_color,
      theme_mode: user?.theme_mode,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      accounts: user.accounts,
      ownerId: user.owner?.id ?? null,
      staffId: user.staff?.id ?? null,
      clientId: user?.client?.id ?? null,
      agencyId: user.owner?.agency?.id ?? user.staff?.agency?.id ?? null,
    };
  }

  async userInfo(id: string) {
    try {
      const user = await this.findUser({ id });
      if (!user) {
        throw new NotFoundException('No user');
      }
      return user;
    } catch (error) {
      throw new NotFoundException(error);
    }
  }

  async checkUserEmail(email: string): Promise<boolean> {
    const user = await this.findUser({ email });
    return !!user;
  }

  async updateUser(data: User): Promise<{ message: string }> {
    if (!data?.id) {
      throw new HttpError('Informations utilisateur manquantes', HttpStatus.BAD_REQUEST);
    }

    const existingUser = await this.findUser({ id: data.id });

    if (!existingUser) {
      throw new HttpError('Informations utilisateur manquantes', HttpStatus.BAD_REQUEST);
    }

    await this.prisma.user.update({
      where: { id: existingUser.id },
      data: {
        ...data,
        email: existingUser.email,
      },
    });

    return {
      message:
        data.email && data.email !== existingUser.email
          ? 'Modification enregistrée. Veuillez confirmer votre nouvelle adresse e-mail.'
          : 'Utilisateur mis à jour',
    };
  }
}
