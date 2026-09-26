import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { RentalType } from '../../../prisma/generated/enums';

// Date calendaire sans heure : évite tout décalage de fuseau horaire
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class RentalAvailabilityDto {
  @ApiProperty({ example: '2026-08-01', description: 'Premier jour disponible (inclus)' })
  @Matches(CALENDAR_DATE, { message: 'startDate doit être au format AAAA-MM-JJ' })
  startDate: string;

  @ApiProperty({ example: '2026-08-30', description: 'Dernier jour disponible (inclus)' })
  @Matches(CALENDAR_DATE, { message: 'endDate doit être au format AAAA-MM-JJ' })
  endDate: string;
}

/** Modalité de location d'un bien : chaque type a son prix, sa caution et ses disponibilités. */
export class RentalConfigDto {
  @ApiProperty({ enum: RentalType, example: RentalType.MONTHLY })
  @IsEnum(RentalType)
  rentalType: RentalType;

  @ApiProperty({
    example: 150000,
    description: 'Prix par unité de location (jour, nuit, mois, an)',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 300000, description: 'Caution demandée' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deposit?: number;

  @ApiPropertyOptional({ example: 1, description: 'Durée minimale, dans l’unité du type' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minDuration?: number | null;

  @ApiPropertyOptional({ example: 12, description: 'Durée maximale, dans l’unité du type' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxDuration?: number | null;

  @ApiPropertyOptional({ example: true, description: 'Modalité proposée à la location' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    type: [RentalAvailabilityDto],
    description:
      'Fenêtres de disponibilité ; aucune fenêtre = disponible sans restriction de dates',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RentalAvailabilityDto)
  availabilities?: RentalAvailabilityDto[];
}
