import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { BillingCycle, Plan } from '../../../prisma/generated/enums';

export class PlanFeatureDto {
  @ApiProperty({ example: 'uuid-de-la-feature', description: 'Identifiant de la fonctionnalité' })
  @IsString()
  featureId: string;

  @ApiProperty({ example: true, description: 'Indique si la fonctionnalité est activée' })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ example: 10, description: "Limite d'utilisation de la fonctionnalité" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number | null;
}

export class PlanPricingDto {
  @ApiProperty({
    enum: BillingCycle,
    example: BillingCycle.MONTHLY,
    description: 'Cycle de facturation',
  })
  @IsEnum(BillingCycle)
  billingCycle: BillingCycle;

  @ApiProperty({ example: 5000, description: 'Prix du cycle (XOF)' })
  @Type(() => Number)
  @IsNumber()
  price: number;

  @ApiProperty({ example: 0, description: 'Remise appliquée (en %)' })
  @Type(() => Number)
  @IsNumber()
  discountPercentage: number;
}

export class CreatePlanDto {
  @ApiProperty({ enum: Plan, example: Plan.BASIC_SUB, description: 'Nom du plan tarifaire' })
  @IsEnum(Plan)
  name: Plan;

  @ApiProperty({ example: 5.5, description: 'Taux de commission appliqué au plan (en %)' })
  @Type(() => Number)
  @IsNumber()
  commissionRate: number;

  @ApiPropertyOptional({ example: true, description: 'Indique si le plan est actif' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: { billingCycle: BillingCycle.MONTHLY, price: 5000, currency: 'XOF' },
    description: 'Indique si le plan est actif',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanPricingDto)
  pricing: PlanPricingDto[];

  @ApiProperty({
    type: [PlanFeatureDto],
    description: 'Liste des fonctionnalités incluses dans le plan',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanFeatureDto)
  features: PlanFeatureDto[];
}

export class UpdatePlanDto {
  @ApiPropertyOptional({ description: 'Nouveau taux de commission (en %)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanPricingDto)
  pricing: PlanPricingDto[];

  @ApiPropertyOptional({ example: false, description: 'Activer ou désactiver le plan' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    type: [PlanFeatureDto],
    description: 'Liste mise à jour des fonctionnalités du plan',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanFeatureDto)
  features?: PlanFeatureDto[];
}
