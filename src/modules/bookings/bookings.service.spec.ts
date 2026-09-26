jest.mock('../agency/agency.service', () => ({ AgencyService: jest.fn() }));
jest.mock('../notifications/notifications.service', () => ({ NotificationsService: jest.fn() }));

import { BookingsService } from './bookings.service';
import { HttpError } from '../../config/http.error';
import { Prisma } from '../../../prisma/generated/client';
import { BookingStatus, RentalType } from '../../../prisma/generated/enums';
import { addDays, todayCalendarDate } from '../rentals/calendar-date';

const errorCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return ((error as HttpError).getResponse() as { errorCode: string }).errorCode;
  }
  return null;
};

/** Champ `data` du premier appel d'un mock Prisma. */
const firstCallData = (mock: jest.Mock) =>
  (mock.mock.calls as [{ data: Record<string, unknown> }][])[0][0].data;

const inDays = (days: number) => addDays(todayCalendarDate(), days);

const bookingRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'booking-1',
  propertyId: 'property-1',
  agencyId: 'agency-1',
  rentalType: RentalType.NIGHTLY,
  startDate: inDays(5),
  endDate: inDays(7),
  status: BookingStatus.PENDING,
  client: { userId: 'user-1' },
  property: { title: 'Studio Mermoz' },
  ...overrides,
});

const setup = () => {
  const tx = {
    $executeRaw: jest.fn(),
    booking: {
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
  };
  const prisma = {
    client: { findUnique: jest.fn().mockResolvedValue({ id: 'client-1' }) },
    annonce: {
      findFirst: jest.fn().mockResolvedValue({
        property: { id: 'property-1', title: 'Studio Mermoz', agencyId: 'agency-1' },
      }),
    },
    agency: {
      findUnique: jest.fn().mockResolvedValue({ owner: { userId: 'owner-1' }, staff: [] }),
    },
    booking: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(bookingRecord()),
      create: jest.fn().mockResolvedValue({
        ...bookingRecord(),
        duration: 2,
        totalAmount: new Prisma.Decimal(50000),
        depositAmount: new Prisma.Decimal(0),
        notes: null,
        rejectionReason: null,
        cancellationReason: null,
        confirmedAt: null,
        cancelledAt: null,
        createdAt: new Date(),
        property: {
          id: 'property-1',
          title: 'Studio Mermoz',
          type: 'STUDIO',
          city: 'Dakar',
          district: 'Mermoz',
          address: null,
          batiment: null,
          annonces: [{ id: 'annonce-1', galleryImages: ['https://img/1.jpg'] }],
        },
        agency: { id: 'agency-1', name: 'Agence', phone: null },
        client: { phone: null, user: { name: 'Awa', email: 'awa@example.com' } },
      }),
      update: jest.fn(),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const agencyService = { agencyAccessControl: jest.fn() };
  const notifications = { createNotification: jest.fn(), notifyAgency: jest.fn() };
  const quote = {
    quote: jest.fn().mockResolvedValue({
      startDate: '2026-10-05',
      endDate: '2026-10-06',
      duration: 2,
      totalAmount: 50000,
      depositAmount: 0,
    }),
  };
  const availability = { isRangeFree: jest.fn().mockResolvedValue(true) };

  const service = new BookingsService(
    prisma as never,
    agencyService as never,
    notifications as never,
    quote as never,
    availability as never,
  );
  return { service, prisma, tx, agencyService, notifications, quote, availability };
};

const request = {
  annonceId: 'annonce-1',
  rentalType: RentalType.NIGHTLY,
  startDate: '2026-10-05',
  duration: 2,
};

describe('BookingsService', () => {
  describe('createBooking', () => {
    it('crée une demande en attente au prix du devis et prévient l’agence', async () => {
      const { service, prisma, notifications } = setup();
      const result = await service.createBooking(request, 'user-1');

      expect(firstCallData(prisma.booking.create)).toMatchObject({
        clientId: 'client-1',
        duration: 2,
        totalAmount: 50000,
      });
      expect(result.booking.property.annonceId).toBe('annonce-1');
      expect(notifications.notifyAgency).toHaveBeenCalledTimes(1);
    });

    it('réserve la réservation aux comptes client', async () => {
      const { service, prisma } = setup();
      prisma.client.findUnique.mockResolvedValue(null);
      expect(await errorCode(service.createBooking(request, 'agent-1'))).toBe('CLIENT_NOT_FOUND');
    });

    it('refuse une seconde demande du même client sur les mêmes dates', async () => {
      const { service, prisma } = setup();
      prisma.booking.findFirst.mockResolvedValue({ id: 'booking-0' });
      expect(await errorCode(service.createBooking(request, 'user-1'))).toBe(
        'BOOKING_ALREADY_REQUESTED',
      );
    });
  });

  describe('cancelBooking', () => {
    it('refuse d’annuler la réservation d’un autre client', async () => {
      const { service } = setup();
      expect(await errorCode(service.cancelBooking('booking-1', 'user-2'))).toBe(
        'BOOKING_NOT_FOUND',
      );
    });

    it('refuse d’annuler une réservation confirmée déjà commencée', async () => {
      const { service, prisma } = setup();
      prisma.booking.findUnique.mockResolvedValue(
        bookingRecord({ status: BookingStatus.CONFIRMED, startDate: inDays(0) }),
      );
      expect(await errorCode(service.cancelBooking('booking-1', 'user-1'))).toBe(
        'BOOKING_NOT_CANCELLABLE',
      );
    });
  });

  describe('confirmBooking', () => {
    it('confirme et refuse automatiquement les autres demandes sur ces dates', async () => {
      const { service, tx, notifications } = setup();
      tx.booking.findMany.mockResolvedValue([{ id: 'booking-2', client: { userId: 'user-2' } }]);

      const result = await service.confirmBooking('booking-1', 'owner-profile');

      expect(tx.$executeRaw).toHaveBeenCalled();
      expect(firstCallData(tx.booking.update)).toMatchObject({ status: BookingStatus.CONFIRMED });
      expect(firstCallData(tx.booking.updateMany)).toMatchObject({
        status: BookingStatus.REJECTED,
      });
      expect(result.autoRejected).toBe(1);
      // Client confirmé + client dont la demande n'est pas retenue
      expect(notifications.createNotification).toHaveBeenCalledTimes(2);
    });

    it('refuse de confirmer si une réservation confirmée chevauche déjà ces dates', async () => {
      const { service, tx } = setup();
      tx.booking.count.mockResolvedValue(1);
      expect(await errorCode(service.confirmBooking('booking-1', 'owner-profile'))).toBe(
        'SLOT_UNAVAILABLE',
      );
      expect(tx.booking.update).not.toHaveBeenCalled();
    });

    it('ne traite que les demandes en attente', async () => {
      const { service, prisma } = setup();
      prisma.booking.findUnique.mockResolvedValue(
        bookingRecord({ status: BookingStatus.CANCELLED }),
      );
      expect(await errorCode(service.rejectBooking('booking-1', 'owner-profile', 'Motif'))).toBe(
        'BOOKING_NOT_PENDING',
      );
    });
  });
});
