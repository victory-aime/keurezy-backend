import { Injectable, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { HttpError } from '_root/config/http.error';
import { CreateAnnonceDto, UpdateAnnonceDto } from '_root/modules/annonce/annonce.dto';
import { AnnonceStatus } from '../../../prisma/generated/enums';
import { Annonce } from '../../../prisma/generated/client';
import { AgencyService } from '../agency/agency.service';

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
  async findAllAnnonces(): Promise<Annonce[]> {
    const annonces = await this.prisma.annonce.findMany({
      where: {
        status: 'ACTIVE',
      },
      include: {
        property: {
          include: { batiment: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return annonces.map((annonce) => ({
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
      },
      batiment: {
        id: annonce.property.batiment?.id,
        name: annonce.property.batiment?.name,
        address: annonce.property.batiment?.address,
        city: annonce.property.batiment?.city,
        district: annonce.property.batiment?.district,
      },
    }));
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
