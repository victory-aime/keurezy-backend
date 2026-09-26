import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../../prisma/generated/client';
import {
  AnnonceStatus,
  BookingStatus,
  NotificationScope,
  NotificationType,
} from '../../../prisma/generated/enums';
import { HttpError } from '../../config/http.error';
import { AgencyService } from '../agency/agency.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RentalQuoteService } from '../rentals/rental-quote.service';
import { RentalAvailabilityService } from '../rentals/rental-availability.service';
import {
  addDays,
  formatCalendarDate,
  parseCalendarDate,
  todayCalendarDate,
} from '../rentals/calendar-date';
import { AgencyBookingsQueryDto, CreateBookingDto } from './bookings.dto';

const BOOKING_INCLUDE = {
  property: {
    select: {
      id: true,
      title: true,
      type: true,
      city: true,
      district: true,
      address: true,
      batiment: { select: { name: true, city: true, district: true, address: true } },
      annonces: {
        where: { status: AnnonceStatus.ACTIVE },
        select: { id: true, galleryImages: true },
        take: 1,
      },
    },
  },
  agency: { select: { id: true, name: true, phone: true } },
  client: { select: { phone: true, user: { select: { name: true, email: true } } } },
} satisfies Prisma.BookingInclude;

type BookingRecord = Prisma.BookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

// Une demande en attente ne bloque pas les dates : seules les réservations confirmées occupent le bien
const ACTIVE_CLIENT_STATUSES = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

const AUTO_REJECTION_REASON = 'Ces dates ont été attribuées à une autre demande.';

/** Réponse commune aux vues client et agence (dates AAAA-MM-JJ, montants en nombres). */
const toBookingResponse = (booking: BookingRecord) => {
  const [annonce] = booking.property.annonces;
  const location = booking.property.batiment ?? booking.property;

  return {
    id: booking.id,
    status: booking.status,
    rentalType: booking.rentalType,
    startDate: formatCalendarDate(booking.startDate),
    endDate: formatCalendarDate(booking.endDate),
    checkOutDate: formatCalendarDate(addDays(booking.endDate, 1)),
    duration: booking.duration,
    totalAmount: booking.totalAmount.toNumber(),
    depositAmount: booking.depositAmount.toNumber(),
    notes: booking.notes,
    rejectionReason: booking.rejectionReason,
    cancellationReason: booking.cancellationReason,
    confirmedAt: booking.confirmedAt,
    cancelledAt: booking.cancelledAt,
    createdAt: booking.createdAt,
    property: {
      id: booking.property.id,
      title: booking.property.title,
      type: booking.property.type,
      city: location.city,
      district: location.district,
      address: location.address,
      annonceId: annonce?.id ?? null,
      coverImage: annonce?.galleryImages[0] ?? null,
    },
    agency: booking.agency,
    client: booking.client
      ? {
          name: booking.client.user.name,
          email: booking.client.user.email,
          phone: booking.client.phone,
        }
      : null,
  };
};

/**
 * Réservations : demande par un client connecté, puis confirmation ou refus par l'agence.
 * Plusieurs demandes peuvent viser les mêmes dates ; une seule peut être confirmée.
 * Prix, durée et disponibilité sont toujours recalculés par RentalQuoteService.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agencyService: AgencyService,
    private readonly notificationsService: NotificationsService,
    private readonly rentalQuote: RentalQuoteService,
    private readonly rentalAvailability: RentalAvailabilityService,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  // CLIENT
  // ─────────────────────────────────────────────────────────────────

  async createBooking(dto: CreateBookingDto, userId: string) {
    const client = await this.prisma.client.findUnique({ where: { userId } });
    if (!client) {
      throw new HttpError(
        'Seul un compte client peut réserver un bien',
        HttpStatus.FORBIDDEN,
        'CLIENT_NOT_FOUND',
      );
    }

    const annonce = await this.prisma.annonce.findFirst({
      where: { id: dto.annonceId, status: AnnonceStatus.ACTIVE },
      select: { property: { select: { id: true, title: true, agencyId: true } } },
    });
    if (!annonce) {
      throw new HttpError('Annonce introuvable', HttpStatus.NOT_FOUND, 'ANNONCE_NOT_FOUND');
    }
    const { property } = annonce;

    // Durée, dates passées, disponibilité et montant : source de vérité unique
    const quote = await this.rentalQuote.quote(property.id, dto);
    const startDate = parseCalendarDate(quote.startDate)!;
    const endDate = parseCalendarDate(quote.endDate)!;

    const duplicate = await this.prisma.booking.findFirst({
      where: {
        clientId: client.id,
        propertyId: property.id,
        status: { in: ACTIVE_CLIENT_STATUSES },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new HttpError(
        'Vous avez déjà une demande en cours pour ce bien sur ces dates',
        HttpStatus.CONFLICT,
        'BOOKING_ALREADY_REQUESTED',
      );
    }

    const booking = await this.prisma.booking.create({
      data: {
        propertyId: property.id,
        agencyId: property.agencyId,
        clientId: client.id,
        rentalType: dto.rentalType,
        startDate,
        endDate,
        duration: quote.duration,
        totalAmount: quote.totalAmount,
        depositAmount: quote.depositAmount,
        notes: dto.notes,
      },
      include: BOOKING_INCLUDE,
    });

    await this.notifyAgency(
      property.agencyId,
      'Nouvelle demande de réservation',
      `Une demande de réservation a été reçue pour « ${property.title} » du ${this.frDate(startDate)} au ${this.frDate(endDate)}.`,
    );

    return {
      message: 'Votre demande de réservation a été envoyée. L’agence va l’étudier.',
      booking: toBookingResponse(booking),
    };
  }

  async getMyBookings(userId: string) {
    const client = await this.prisma.client.findUnique({ where: { userId } });
    if (!client) return [];

    const bookings = await this.prisma.booking.findMany({
      where: { clientId: client.id },
      include: BOOKING_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return bookings.map(toBookingResponse);
  }

  async cancelBooking(id: string, userId: string, reason?: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { client: { select: { userId: true } }, property: { select: { title: true } } },
    });

    // Même réponse qu'une réservation inexistante : pas d'information sur celles des autres
    if (!booking || booking.client?.userId !== userId) {
      throw new HttpError('Réservation introuvable', HttpStatus.NOT_FOUND, 'BOOKING_NOT_FOUND');
    }

    const cancellable =
      booking.status === BookingStatus.PENDING ||
      (booking.status === BookingStatus.CONFIRMED && booking.startDate > todayCalendarDate());
    if (!cancellable) {
      throw new HttpError(
        'Cette réservation ne peut plus être annulée',
        HttpStatus.BAD_REQUEST,
        'BOOKING_NOT_CANCELLABLE',
      );
    }

    await this.prisma.booking.update({
      where: { id },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    });

    await this.notifyAgency(
      booking.agencyId,
      'Réservation annulée',
      `Le client a annulé sa réservation pour « ${booking.property.title} » du ${this.frDate(booking.startDate)} au ${this.frDate(booking.endDate)}.`,
    );

    return { message: 'Votre réservation a été annulée.' };
  }

  // ─────────────────────────────────────────────────────────────────
  // AGENCE
  // ─────────────────────────────────────────────────────────────────

  async getAgencyBookings(query: AgencyBookingsQueryDto, profileId: string) {
    await this.agencyService.agencyAccessControl(query.agencyId, profileId);

    const bookings = await this.prisma.booking.findMany({
      where: { agencyId: query.agencyId, ...(query.status && { status: query.status }) },
      include: BOOKING_INCLUDE,
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
    });
    return bookings.map(toBookingResponse);
  }

  async confirmBooking(id: string, profileId: string) {
    const booking = await this.findPendingForAgency(id, profileId);
    const range = { start: booking.startDate, end: booking.endDate };

    // Les périodes saisies ont pu changer depuis la demande
    const withinAvailability = await this.rentalAvailability.isRangeFree(
      booking.propertyId,
      booking.rentalType,
      range,
    );
    if (!withinAvailability) {
      throw new HttpError(
        'Ces dates ne sont plus disponibles pour ce bien',
        HttpStatus.CONFLICT,
        'SLOT_UNAVAILABLE',
      );
    }

    const rejected = await this.prisma.$transaction(async (tx) => {
      // Verrou par bien : deux confirmations simultanées ne peuvent pas se chevaucher
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${booking.propertyId}))`;

      const overlapping = {
        propertyId: booking.propertyId,
        id: { not: booking.id },
        startDate: { lte: booking.endDate },
        endDate: { gte: booking.startDate },
      };

      const conflict = await tx.booking.count({
        where: {
          ...overlapping,
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] },
        },
      });
      if (conflict) {
        throw new HttpError(
          'Une autre réservation a déjà été confirmée sur ces dates',
          HttpStatus.CONFLICT,
          'SLOT_UNAVAILABLE',
        );
      }

      await tx.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.CONFIRMED, confirmedAt: new Date() },
      });

      // Les autres demandes sur ces dates ne peuvent plus aboutir
      const others = await tx.booking.findMany({
        where: { ...overlapping, status: BookingStatus.PENDING },
        select: { id: true, client: { select: { userId: true } } },
      });
      if (others.length) {
        await tx.booking.updateMany({
          where: { id: { in: others.map((other) => other.id) } },
          data: { status: BookingStatus.REJECTED, rejectionReason: AUTO_REJECTION_REASON },
        });
      }
      return others;
    });

    const period = `du ${this.frDate(booking.startDate)} au ${this.frDate(booking.endDate)}`;
    await this.notifyClient(
      booking.client?.userId,
      'Réservation confirmée',
      `Votre réservation pour « ${booking.property.title} » ${period} est confirmée.`,
    );
    await Promise.all(
      rejected.map((other) =>
        this.notifyClient(
          other.client?.userId,
          'Réservation non retenue',
          `Votre demande pour « ${booking.property.title} » ${period} n’a pas pu être retenue : ${AUTO_REJECTION_REASON}`,
        ),
      ),
    );

    return { message: 'Réservation confirmée.', autoRejected: rejected.length };
  }

  async rejectBooking(id: string, profileId: string, reason: string) {
    const booking = await this.findPendingForAgency(id, profileId);

    await this.prisma.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.REJECTED, rejectionReason: reason },
    });

    await this.notifyClient(
      booking.client?.userId,
      'Réservation refusée',
      `Votre demande pour « ${booking.property.title} » n’a pas été acceptée : ${reason}`,
    );

    return { message: 'Réservation refusée.' };
  }

  // ─────────────────────────────────────────────────────────────────
  // INTERNE
  // ─────────────────────────────────────────────────────────────────

  private async findPendingForAgency(id: string, profileId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { client: { select: { userId: true } }, property: { select: { title: true } } },
    });
    if (!booking) {
      throw new HttpError('Réservation introuvable', HttpStatus.NOT_FOUND, 'BOOKING_NOT_FOUND');
    }

    await this.agencyService.agencyAccessControl(booking.agencyId, profileId);

    if (booking.status !== BookingStatus.PENDING) {
      throw new HttpError(
        'Seule une demande en attente peut être traitée',
        HttpStatus.BAD_REQUEST,
        'BOOKING_NOT_PENDING',
      );
    }
    return booking;
  }

  private async notifyClient(userId: string | undefined, title: string, content: string) {
    if (!userId) return;
    await this.notificationsService.createNotification({
      type: NotificationType.BOOKING,
      scope: NotificationScope.USER,
      title,
      content,
      recipients: [userId],
    });
  }

  /** Propriétaire et membres actifs de l'agence. */
  private async notifyAgency(agencyId: string, title: string, content: string) {
    const agency = await this.prisma.agency.findUnique({
      where: { id: agencyId },
      select: {
        owner: { select: { userId: true } },
        staff: { where: { isActive: true }, select: { userId: true } },
      },
    });
    if (!agency) return;

    await this.notificationsService.notifyAgency({
      agencyMembers: [agency.owner.userId, ...agency.staff.map((member) => member.userId)],
      payload: { type: NotificationType.BOOKING, title, content },
    });
  }

  private frDate(date: Date) {
    return date.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
  }
}
