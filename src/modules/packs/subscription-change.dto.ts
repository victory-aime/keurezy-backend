import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { BillingCycle } from '../../../prisma/generated/enums';

/** Plan et cycle visés par un changement d'abonnement. */
export class SubscriptionTargetDto {
  @ApiProperty({ description: "Identifiant de l'agence" })
  @IsString()
  @IsNotEmpty()
  agencyId: string;

  @ApiProperty({ description: 'Plan visé' })
  @IsString()
  @IsNotEmpty()
  planId: string;

  @ApiProperty({ enum: BillingCycle })
  @IsEnum(BillingCycle)
  billingCycle: BillingCycle;
}

/** Éléments gardés actifs pour une fonctionnalité limitée en surplus. */
export class KeepSelectionDto {
  @ApiProperty({ example: 'manage_users' })
  @IsString()
  @IsNotEmpty()
  feature: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids: string[];
}

/** Paiement d'un renouvellement, d'un upgrade ou d'une réactivation. */
export class CheckoutDto extends SubscriptionTargetDto {
  @ApiProperty({
    type: [KeepSelectionDto],
    required: false,
    description: 'Réactivation sur un plan plus petit : éléments gardés actifs',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KeepSelectionDto)
  keep?: KeepSelectionDto[];
}
