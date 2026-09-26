import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { BookingStatus, RentalType } from '../../../prisma/generated/enums';
import { CALENDAR_DATE } from '../rentals/calendar-date';

export class CreateBookingDto {
  @ApiProperty({ example: 'uuid-de-l-annonce', description: 'Annonce réservée' })
  @IsUUID()
  annonceId: string;

  @ApiProperty({ enum: RentalType, enumName: 'RentalType', example: RentalType.NIGHTLY })
  @IsEnum(RentalType)
  rentalType: RentalType;

  @ApiProperty({ example: '2026-10-05', description: 'Premier jour de la location' })
  @Matches(CALENDAR_DATE, { message: 'startDate doit être au format AAAA-MM-JJ' })
  startDate: string;

  @ApiProperty({
    example: 3,
    description: 'Nombre d’unités : jours, nuits, mois ou années selon le type',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration: number;

  @ApiPropertyOptional({ example: 'Arrivée prévue vers 18h', description: 'Message à l’agence' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class BookingIdDto {
  @ApiProperty({ example: 'uuid-de-la-reservation' })
  @IsUUID()
  id: string;
}

export class CancelBookingDto {
  @ApiPropertyOptional({ example: 'Changement de programme' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RejectBookingDto {
  @ApiProperty({ example: 'Le bien est en travaux à ces dates' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class AgencyBookingsQueryDto {
  @ApiProperty({ example: 'uuid-de-l-agence' })
  @IsUUID()
  agencyId: string;

  @ApiPropertyOptional({ enum: BookingStatus, enumName: 'BookingStatus' })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
