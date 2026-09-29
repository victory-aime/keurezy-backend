import { PrismaService } from '../../database/prisma.service';
import { AnnonceStatus, BookingStatus, VisitStatus } from '../../../prisma/generated/enums';
import { todayCalendarDate } from '../rentals/calendar-date';

/**
 * Impact d'une fermeture ou d'une suppression de bien (`GET property/impact`) : ce qui est lié
 * au bien, pour que l'agence sache ce que son action entraîne avant de la confirmer.
 */
export interface PropertyImpact {
  /** `online` : annonces actuellement en ligne (status ACTIVE) */
  annonces: { total: number; online: number };
  /** `upcoming` : confirmées dont le séjour n'est pas terminé ; `pending` : en attente */
  bookings: { total: number; upcoming: number; pending: number };
  conversations: number;
  /** `upcoming` : planifiées ou confirmées à venir */
  visits: { total: number; upcoming: number };
  /** Vrai seulement sans réservation, discussion ni visite */
  canDelete: boolean;
}

/** Impact d'une suppression de terrain (`GET land/impact`). */
export interface LandImpact {
  batiments: { id: string; name: string }[];
  villas: number;
  /** Vrai seulement sans bâtiment ni villa (ils seraient supprimés en cascade) */
  canDelete: boolean;
}

/** Impact d'une suppression de bâtiment (`GET building/impact`) : ses biens partent avec lui. */
export interface BuildingImpact extends PropertyImpact {
  properties: { id: string; title: string }[];
}

/** Périmètre compté : un bien, ou tous les biens d'un bâtiment. */
export type ImpactScope = { propertyId: string } | { property: { batimentId: string } };

/**
 * Historique lié à un périmètre de biens : annonces, réservations, discussions et visites.
 * Source unique de la règle de suppression (`canDelete`) pour les biens et les bâtiments :
 * les réservations sont conservées, les discussions partiraient en cascade, et les visites
 * sont bloquées par la base.
 */
export async function computeImpact(
  prisma: PrismaService,
  where: ImpactScope,
): Promise<PropertyImpact> {
  const [annonces, online, bookings, upcoming, pending, conversations, visits, upcomingVisits] =
    await Promise.all([
      prisma.annonce.count({ where }),
      prisma.annonce.count({ where: { ...where, status: AnnonceStatus.ACTIVE } }),
      prisma.booking.count({ where }),
      prisma.booking.count({
        where: { ...where, status: BookingStatus.CONFIRMED, endDate: { gte: todayCalendarDate() } },
      }),
      prisma.booking.count({ where: { ...where, status: BookingStatus.PENDING } }),
      prisma.conversation.count({ where }),
      prisma.visit.count({ where }),
      prisma.visit.count({
        where: {
          ...where,
          status: { in: [VisitStatus.PLANNED, VisitStatus.CONFIRMED] },
          scheduledAt: { gte: new Date() },
        },
      }),
    ]);
  return {
    annonces: { total: annonces, online },
    bookings: { total: bookings, upcoming, pending },
    conversations,
    visits: { total: visits, upcoming: upcomingVisits },
    canDelete: bookings === 0 && conversations === 0 && visits === 0,
  };
}
