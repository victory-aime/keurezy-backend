import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainEventBus } from '../events/domain-events';
import { PrismaService } from '../../database/prisma.service';
import { AnnonceStatus, PropertyType } from '../../../prisma/generated/enums';
import { Annonce, Prisma } from '../../../prisma/generated/client';
import { AgencyService } from '../agency/agency.service';
import { PlanFeaturePolicyService } from '../packs/plan-feature-policy.service';
import { HttpError } from '../../config/http.error';
import {
  AnnonceAvailabilityDto,
  AnnonceQuoteDto,
  CreateAnnonceDto,
  FilterAnnonceDto,
  UpdateAnnonceDto,
} from './annonce.dto';
import {
  PUBLIC_RENTAL_OFFERS_INCLUDE,
  toPublicRentalOffer,
} from '../rentals/rental-config.service';
import { RentalAvailabilityService } from '../rentals/rental-availability.service';
import { RentalQuoteService } from '../rentals/rental-quote.service';
import { FeatureCommercial } from '../../config/enum';

const PUBLIC_ANNONCE_INCLUDE = {
  property: {
    include: {
      batiment: true,
      rentalConfigs: PUBLIC_RENTAL_OFFERS_INCLUDE,
    },
  },
} satisfies Prisma.AnnonceInclude;

type PublicAnnonceRecord = Prisma.AnnonceGetPayload<{ include: typeof PUBLIC_ANNONCE_INCLUDE }>;

/** Représentation publique d'une annonce (liste et détail), modalités actives comprises. */
const toPublicAnnonce = (annonce: PublicAnnonceRecord) => ({
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
    // Prix/caution de référence conservés pour les clients existants
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

  rentalOffers: annonce.property.rentalConfigs.map(toPublicRentalOffer),

  batiment: annonce.property.batiment
    ? {
        id: annonce.property.batiment.id,
        name: annonce.property.batiment.name,
        address: annonce.property.batiment.address,
        city: annonce.property.batiment.city,
        district: annonce.property.batiment.district,
      }
    : null,
});

@Injectable()
export class AnnounceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agencyService: AgencyService,
    private readonly planFeaturePolicy: PlanFeaturePolicyService,
    private readonly rentalAvailability: RentalAvailabilityService,
    private readonly rentalQuote: RentalQuoteService,
    private readonly events: DomainEventBus,
  ) {}

  /** Mise en ligne : les clients abonnés à ce type de bien sont notifiés. */
  private announcePublished(
    annonce: { id: string; title: string | null },
    property: { type: PropertyType; title: string; city: string | null; agencyId: string },
  ) {
    this.events.emit('annonce.published', {
      annonceId: annonce.id,
      propertyType: property.type,
      title: annonce.title || property.title,
      city: property.city,
      agencyId: property.agencyId,
    });
  }

  // Vérification centralisée
  private async ensureNoActiveAnnounce(propertyId: string, excludeId?: string) {
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
  async createAnnounce(dto: CreateAnnonceDto, userId: string): Promise<{ message: string }> {
    await this.agencyService.agencyAccessControl(dto.agencyId, userId);

    const context = await this.planFeaturePolicy.getAgencyFeatureContext(dto.agencyId);

    const currentProperties = await this.prisma.annonce.count({
      where: {
        property: {
          agencyId: dto.agencyId,
        },
      },
    });

    const check = this.planFeaturePolicy.checkCapacity(
      context,
      FeatureCommercial.ANNOUNCES,
      currentProperties,
    );

    if (!check.allowed) {
      throw new HttpError(
        'Votre capacité maximale de biens est atteinte.',
        HttpStatus.FORBIDDEN,
        'PROPERTY_CAPACITY_REACHED',
      );
    }

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

    if (!property || property.agencyId !== dto.agencyId) {
      throw new HttpError('Propriété introuvable', HttpStatus.NOT_FOUND, 'PROPERTY_NOT_FOUND');
    }

    const status = dto.status ?? AnnonceStatus.INACTIVE;

    // règle métier
    if (status === AnnonceStatus.ACTIVE) {
      await this.ensureNoActiveAnnounce(dto.propertyId);
    }

    const created = await this.prisma.annonce.create({
      data: {
        title: dto.title,
        propertyId: dto.propertyId,
        description: dto.description,
        galleryImages: dto.galleryImages,
        status,
        publishedAt: status === AnnonceStatus.ACTIVE ? new Date() : null,
      },
      select: { id: true, title: true },
    });
    if (status === AnnonceStatus.ACTIVE) this.announcePublished(created, property);

    return {
      message: 'Annonce créée avec succès',
    };
  }

  // 2. LIST ALL
  async findAllAnnounces(payload: FilterAnnonceDto) {
    const pageInitial = payload.initialPage ?? 1;
    const limitPage = payload.limitPerPage ?? 10;

    const skip = (pageInitial - 1) * limitPage;

    const propertyFilter: Prisma.PropertyWhereInput = {};

    if (payload.city) {
      propertyFilter.city = {
        contains: payload.city,
        mode: Prisma.QueryMode.insensitive,
      };
    }

    if (payload.district) {
      propertyFilter.district = {
        contains: payload.district,
        mode: Prisma.QueryMode.insensitive,
      };
    }

    if (payload.type) {
      propertyFilter.type = payload.type;
    }

    const priceFilter: Prisma.DecimalFilter | undefined =
      payload.minPrice !== undefined || payload.maxPrice !== undefined
        ? {
            ...(payload.minPrice !== undefined && { gte: new Prisma.Decimal(payload.minPrice) }),
            ...(payload.maxPrice !== undefined && { lte: new Prisma.Decimal(payload.maxPrice) }),
          }
        : undefined;

    if (payload.rentalType) {
      // Le prix comparé est celui de la modalité demandée (unités homogènes)
      propertyFilter.rentalConfigs = {
        some: {
          rentalType: payload.rentalType,
          isActive: true,
          ...(priceFilter && { price: priceFilter }),
        },
      };
    } else if (priceFilter) {
      propertyFilter.price = priceFilter;
    }

    if (payload.rooms !== undefined) {
      propertyFilter.rooms = {
        gte: payload.rooms,
      };
    }

    if (payload.features?.length) {
      propertyFilter.features = {
        hasSome: payload.features,
      };
    }

    const filterOptions: Prisma.AnnonceWhereInput = {
      status: 'ACTIVE',
      ...(Object.keys(propertyFilter).length > 0 && {
        property: propertyFilter,
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.annonce.findMany({
        where: filterOptions,
        include: PUBLIC_ANNONCE_INCLUDE,
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
      content: data.map(toPublicAnnonce),
      totalDataPerPages: limitPage,
      totalItems: total,
      currentPage: pageInitial,
      totalPages: Math.ceil(total / limitPage),
    };
  }

  // 2b. DETAIL PUBLIC
  async findPublicAnnonce(id: string) {
    const annonce = await this.prisma.annonce.findFirst({
      where: { id, status: AnnonceStatus.ACTIVE },
      include: {
        ...PUBLIC_ANNONCE_INCLUDE,
        property: {
          include: {
            ...PUBLIC_ANNONCE_INCLUDE.property.include,
            agency: { select: { id: true, name: true, phone: true, isVerified: true } },
          },
        },
      },
    });

    if (!annonce) {
      throw new HttpError('Annonce introuvable', HttpStatus.NOT_FOUND, 'ANNONCE_NOT_FOUND');
    }

    return { ...toPublicAnnonce(annonce), agency: annonce.property.agency };
  }

  // 2c. CRÉNEAUX LIBRES D'UNE ANNONCE
  async getAnnonceAvailability(query: AnnonceAvailabilityDto) {
    const propertyId = await this.findPublicPropertyId(query.id);
    return this.rentalAvailability.getFreeRanges(
      propertyId,
      query.rentalType,
      query.from,
      query.to,
    );
  }

  // 2d. DEVIS D'UNE ANNONCE
  async quoteAnnonce(dto: AnnonceQuoteDto) {
    const propertyId = await this.findPublicPropertyId(dto.annonceId);
    return this.rentalQuote.quote(propertyId, dto);
  }

  /** Bien d'une annonce publiée ; seules les annonces actives sont réservables. */
  private async findPublicPropertyId(annonceId: string): Promise<string> {
    const annonce = await this.prisma.annonce.findFirst({
      where: { id: annonceId, status: AnnonceStatus.ACTIVE },
      select: { propertyId: true },
    });

    if (!annonce) {
      throw new HttpError('Annonce introuvable', HttpStatus.NOT_FOUND, 'ANNONCE_NOT_FOUND');
    }
    return annonce.propertyId;
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
  async updateAnnonce(dto: UpdateAnnonceDto, userId: string): Promise<{ message: string }> {
    const annonce = await this.prisma.annonce.findUnique({
      where: { id: dto.id },
      include: { property: { select: { agencyId: true } } },
    });

    if (!annonce) {
      throw new HttpError('Annonce introuvable', HttpStatus.NOT_FOUND, 'ANNONCE_NOT_FOUND');
    }

    await this.agencyService.agencyAccessControl(annonce.property.agencyId, userId);

    const nextStatus = dto.status ?? annonce.status;

    // vérification si passage en ACTIVE
    if (nextStatus === AnnonceStatus.ACTIVE) {
      await this.ensureNoActiveAnnounce(annonce.propertyId, dto.id);
    }

    const updated = await this.prisma.annonce.update({
      where: { id: dto.id },
      data: {
        title: dto.title ?? annonce.title,
        description: dto.description ?? annonce.description,
        galleryImages: dto.galleryImages?.length ? dto.galleryImages : annonce.galleryImages,
        status: nextStatus,
        publishedAt:
          nextStatus === AnnonceStatus.ACTIVE ? (annonce.publishedAt ?? new Date()) : null,
      },
      include: { property: true },
    });
    // Passage en ligne uniquement (une modification d'annonce déjà en ligne ne notifie pas)
    if (nextStatus === AnnonceStatus.ACTIVE && annonce.status !== AnnonceStatus.ACTIVE) {
      this.announcePublished(updated, updated.property);
    }
    return {
      message: 'Annonce mise a jouur',
    };
  }

  // 5. DELETE
  async deleteAnnonce(id: string, userId: string): Promise<{ success: boolean; message: string }> {
    const annonce = await this.prisma.annonce.findUnique({
      where: { id },
      include: { property: { select: { agencyId: true } } },
    });

    if (!annonce) {
      throw new HttpError(`Impossible de supprimer.`, HttpStatus.NOT_FOUND, 'ANNONCE_NOT_FOUND');
    }

    await this.agencyService.agencyAccessControl(annonce.property.agencyId, userId);

    await this.prisma.annonce.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Annonce supprimée avec succès',
    };
  }
}
