import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
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
