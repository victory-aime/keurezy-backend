import { Injectable, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { HttpError } from '_root/config/http.error';
import {
  CreateAnnonceDto,
  FilterAnnonceDto,
  UpdateAnnonceDto,
} from '_root/modules/annonce/annonce.dto';
import { AnnonceStatus, PropertyFeature, PropertyType } from '../../../prisma/generated/enums';
import { Annonce, Prisma } from '../../../prisma/generated/client';
import { AgencyService } from '../agency/agency.service';
import { convertToInteger } from '_root/config/convert';

@Injectable()
export class AnnonceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agencyService: AgencyService,
  ) {}

  // Vérification centralisée
  private async ensureNoActiveAnnonce(propertyId: string, excludeId?: string) {
    const existing = await this.prisma.annonce.findFirst({
      where: {
        propertyId,
        status: AnnonceStatus.ACTIVE,
        ...(excludeId && { id: { not: excludeId } }),
      },
    });

    if (existing) {
      throw new HttpError(
        'Une annonce ACTIVE existe déjà pour cette propriété',
        HttpStatus.CONFLICT,
        'ACTIVE_ANNONCE_EXISTS',
      );
    }
  }

  // 1. CREATE
  async createAnnonce(dto: CreateAnnonceDto): Promise<{ message: string }> {
    await this.agencyService.agencyAccessControl(dto.agencyId!, dto.userId!);
    if (!dto.galleryImages?.length) {
      throw new HttpError(
        'Vous devez fournir au moins une image.',
        HttpStatus.BAD_REQUEST,
        'IMAGES_REQUIRED',
      );
    }

    const property = await this.prisma.property.findUnique({
      where: { id: dto.propertyId },
    });

    if (!property) {
      throw new HttpError('Propriété introuvable', HttpStatus.NOT_FOUND, 'PROPERTY_NOT_FOUND');
    }

    const status = dto.status ?? AnnonceStatus.INACTIVE;

    // règle métier
    if (status === AnnonceStatus.ACTIVE) {
      await this.ensureNoActiveAnnonce(dto.propertyId);
    }

    await this.prisma.annonce.create({
      data: {
        title: dto.title,
        propertyId: dto.propertyId,
        description: dto.description,
        galleryImages: dto.galleryImages,
        status,
        publishedAt: status === AnnonceStatus.ACTIVE ? new Date() : null,
      },
    });

    return {
      message: 'Annonce créée avec succès',
    };
  }

  // 2. LIST ALL
  async findAllAnnonces(query: FilterAnnonceDto) {
    const pageInitial = convertToInteger(query?.initialPage) || 1;
    const limitPage = convertToInteger(query?.limitPerPage) || 10;
    const minPrice = convertToInteger(query?.minPrice!);
    const maxPrice = convertToInteger(query?.maxPrice!);

    const skip = (pageInitial - 1) * limitPage;

    const filterOptions: Prisma.AnnonceWhereInput = {
      status: 'ACTIVE',
      property: {
        ...(query.city && {
          city: {
            contains: query.city,
            mode: Prisma.QueryMode.insensitive,
          },
        }),

        ...(query.district && {
          district: {
            contains: query.district,
            mode: Prisma.QueryMode.insensitive,
          },
        }),

        ...(query.type && {
          type: query.type,
        }),

        ...((minPrice || maxPrice) && {
          price: {
            ...(query.minPrice && {
              gte: minPrice,
            }),

            ...(query.maxPrice && {
              lte: maxPrice,
            }),
          },
        }),

        ...(query.rooms && {
          rooms: {
            gte: query.rooms,
          },
        }),

        ...(query.features?.length && {
          features: {
            hasSome: query.features,
          },
        }),
      },
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.annonce.findMany({
        where: filterOptions,
        include: {
          property: {
            include: { batiment: true },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limitPage,
      }),

      this.prisma.annonce.count({
        where: filterOptions,
      }),
    ]);

    return {
      content: data.map((annonce) => ({
        id: annonce.id,
        title: annonce.title,
        propertyId: annonce.propertyId,
        description: annonce.description,
        galleryImages: annonce.galleryImages,
        status: annonce.status,
        publishedAt: annonce.publishedAt,
        createdAt: annonce.createdAt,
        updatedAt: annonce.updatedAt,
        property: {
          id: annonce.property.id,
          title: annonce.property.title,
          type: annonce.property.type,
          price: annonce.property.price,
          propertyOwner: annonce.property.propertyOwner,
          address: annonce.property.address,
          city: annonce.property.city,
          district: annonce.property.district,
          caution: annonce.property.caution,
          rooms: annonce.property.rooms,
          bathrooms: annonce.property.bathrooms,
          area: annonce.property.area,
          status: annonce.property.status,
          features: annonce.property.features,
        },
        batiment: {
          id: annonce.property.batiment?.id,
          name: annonce.property.batiment?.name,
          address: annonce.property.batiment?.address,
          city: annonce.property.batiment?.city,
          district: annonce.property.batiment?.district,
        },
      })),
      totalDataPerPages: limitPage,
      totalItems: total,
      currentPage: pageInitial,
      totalPages: Math.ceil(total / limitPage),
    };
  }

  // 3. LIST BY AGENCY
  async findAnnoncesByAgency(agencyId: string, userId: string): Promise<Annonce[]> {
    await this.agencyService.agencyAccessControl(agencyId, userId);

    return this.prisma.annonce.findMany({
      where: {
        property: { agencyId },
      },
      include: { property: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 4. UPDATE
  async updateAnnonce(dto: UpdateAnnonceDto): Promise<{ message: string }> {
    await this.agencyService.agencyAccessControl(dto.agencyId!, dto.userId!);

    const annonce = await this.prisma.annonce.findUnique({
      where: { id: dto.id },
    });

    if (!annonce) {
      throw new HttpError('Annonce introuvable', HttpStatus.NOT_FOUND, 'ANNONCE_NOT_FOUND');
    }

    const nextStatus = dto.status ?? annonce.status;

    // vérification si passage en ACTIVE
    if (nextStatus === AnnonceStatus.ACTIVE) {
      await this.ensureNoActiveAnnonce(annonce.propertyId, dto.id);
    }

    await this.prisma.annonce.update({
      where: { id: dto.id },
      data: {
        description: dto.description ?? annonce.description,
        galleryImages: dto.galleryImages ?? annonce.galleryImages,
        status: nextStatus,
        publishedAt:
          nextStatus === AnnonceStatus.ACTIVE ? (annonce.publishedAt ?? new Date()) : null,
      },
      include: { property: true },
    });
    return {
      message: 'Annonce mise a jouur',
    };
  }

  // 5. DELETE
  async deleteAnnonce(id: string): Promise<{ success: boolean; message: string }> {
    const annonce = await this.prisma.annonce.findUnique({
      where: { id },
    });

    if (!annonce) {
      throw new HttpError(`Impossible de supprimer.`, HttpStatus.NOT_FOUND, 'ANNONCE_NOT_FOUND');
    }

    await this.prisma.annonce.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Annonce supprimée avec succès',
    };
  }
}
