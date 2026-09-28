import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { PropertyType } from '../../../prisma/generated/enums';
import { NOTIFICATION_SOUNDS, NotificationSound } from './notification-preferences';

export class ChannelPreferenceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  push?: boolean;

  @ApiPropertyOptional({ description: 'Proposé pour les réservations uniquement' })
  @IsOptional()
  @IsBoolean()
  email?: boolean;
}

/** Catégories connues uniquement : toute autre clé est retirée par la whitelist. */
export class CategoriesPreferenceDto {
  @ApiPropertyOptional({ type: ChannelPreferenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelPreferenceDto)
  MESSAGE?: ChannelPreferenceDto;

  @ApiPropertyOptional({ type: ChannelPreferenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelPreferenceDto)
  BOOKING?: ChannelPreferenceDto;

  @ApiPropertyOptional({ type: ChannelPreferenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelPreferenceDto)
  VISIT?: ChannelPreferenceDto;

  @ApiPropertyOptional({ type: ChannelPreferenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelPreferenceDto)
  PAYMENT?: ChannelPreferenceDto;

  @ApiPropertyOptional({ type: ChannelPreferenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelPreferenceDto)
  LISTING?: ChannelPreferenceDto;
}

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ type: CategoriesPreferenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CategoriesPreferenceDto)
  categories?: CategoriesPreferenceDto;

  @ApiPropertyOptional({
    enum: PropertyType,
    isArray: true,
    description: 'Types de bien suivis pour les nouvelles annonces (vide = tous)',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsEnum(PropertyType, { each: true })
  listingPropertyTypes?: PropertyType[];

  @ApiPropertyOptional({ enum: NOTIFICATION_SOUNDS })
  @IsOptional()
  @IsIn(NOTIFICATION_SOUNDS)
  sound?: NotificationSound;

  @ApiPropertyOptional({ description: 'Son d’un nouveau message, application ouverte' })
  @IsOptional()
  @IsBoolean()
  inAppSound?: boolean;
}
