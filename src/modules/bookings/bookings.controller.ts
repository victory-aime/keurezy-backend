import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { API_URL } from '../../config/api';
import { AgencyProfileId, CurrentUserId } from '../../guard/current-user.decorator';
import { BookingsService } from './bookings.service';
import {
  AgencyBookingsQueryDto,
  BookingIdDto,
  CancelBookingDto,
  CreateBookingDto,
  RejectBookingDto,
} from './bookings.dto';
import { RequirePermission } from '../../guard/permission.guard';

@ApiTags('Réservations')
@ApiBearerAuth()
@Controller()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // ─── Client connecté ────────────────────────────────────────────

  @Post(API_URL.BOOKINGS.CREATE)
  @ApiOperation({
    summary: 'Demander une réservation (client connecté)',
    description:
      'Le prix et la disponibilité sont recalculés par le serveur. La demande ne bloque pas les dates tant que l’agence ne l’a pas confirmée.',
  })
  @ApiBody({ type: CreateBookingDto })
  @ApiOkResponse({ description: 'Demande créée, en attente de l’agence' })
  @ApiBadRequestResponse({ description: 'Durée hors limites ou date invalide' })
  @ApiForbiddenResponse({ description: 'Le compte connecté n’est pas un compte client' })
  @ApiConflictResponse({ description: 'Dates indisponibles ou demande déjà en cours' })
  async create(@Body() dto: CreateBookingDto, @CurrentUserId() userId: string) {
    return this.bookingsService.createBooking(dto, userId);
  }

  @Get(API_URL.BOOKINGS.MY_BOOKINGS)
  @ApiOperation({ summary: 'Mes réservations (client connecté)' })
  @ApiOkResponse({ description: 'Réservations du client, les plus récentes d’abord' })
  async myBookings(@CurrentUserId() userId: string) {
    return this.bookingsService.getMyBookings(userId);
  }

  @Patch(API_URL.BOOKINGS.CANCEL)
  @ApiOperation({ summary: 'Annuler ma réservation (en attente, ou confirmée avant son début)' })
  @ApiBody({ type: CancelBookingDto })
  @ApiOkResponse({ description: 'Réservation annulée' })
  @ApiNotFoundResponse({ description: 'Réservation introuvable' })
  @ApiBadRequestResponse({ description: 'Réservation déjà commencée, terminée ou traitée' })
  async cancel(
    @Query() query: BookingIdDto,
    @Body() dto: CancelBookingDto,
    @CurrentUserId() userId: string,
  ) {
    return this.bookingsService.cancelBooking(query.id, userId, dto.reason);
  }

  // ─── Agence (Owner + Staff) ─────────────────────────────────────

  @Get(API_URL.BOOKINGS.AGENCY_BOOKINGS)
  @RequirePermission('view_bookings')
  @ApiOperation({ summary: 'Réservations d’une agence, filtrables par statut' })
  @ApiOkResponse({ description: 'Réservations de l’agence' })
  async agencyBookings(
    @Query() query: AgencyBookingsQueryDto,
    @AgencyProfileId() profileId: string,
  ) {
    return this.bookingsService.getAgencyBookings(query, profileId);
  }

  @Patch(API_URL.BOOKINGS.CONFIRM)
  @RequirePermission('manage_bookings')
  @ApiOperation({
    summary: 'Confirmer une demande',
    description:
      'Les autres demandes en attente sur les mêmes dates sont automatiquement refusées.',
  })
  @ApiOkResponse({ description: 'Réservation confirmée' })
  @ApiConflictResponse({ description: 'Dates déjà attribuées ou plus disponibles' })
  async confirm(@Query() query: BookingIdDto, @AgencyProfileId() profileId: string) {
    return this.bookingsService.confirmBooking(query.id, profileId);
  }

  @Patch(API_URL.BOOKINGS.REJECT)
  @RequirePermission('manage_bookings')
  @ApiOperation({ summary: 'Refuser une demande avec un motif' })
  @ApiBody({ type: RejectBookingDto })
  @ApiOkResponse({ description: 'Réservation refusée' })
  async reject(
    @Query() query: BookingIdDto,
    @Body() dto: RejectBookingDto,
    @AgencyProfileId() profileId: string,
  ) {
    return this.bookingsService.rejectBooking(query.id, profileId, dto.reason);
  }

  @Patch(API_URL.BOOKINGS.AGENCY_CANCEL)
  @RequirePermission('manage_bookings')
  @ApiOperation({
    summary: 'Annuler une réservation confirmée qui n’a pas commencé, avec un motif',
  })
  @ApiBody({ type: RejectBookingDto })
  @ApiOkResponse({ description: 'Réservation annulée, client prévenu' })
  @ApiBadRequestResponse({ description: 'Réservation non confirmée ou déjà commencée' })
  async agencyCancel(
    @Query() query: BookingIdDto,
    @Body() dto: RejectBookingDto,
    @AgencyProfileId() profileId: string,
  ) {
    return this.bookingsService.agencyCancelBooking(query.id, profileId, dto.reason);
  }
}
