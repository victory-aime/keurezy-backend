import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Plan } from '../../../prisma/generated/enums';

export class PlanFeatureInput {
  @ApiProperty({ example: 'uuid-de-la-feature', description: 'Identifiant de la fonctionnalité' })
  featureId: string;

  @ApiProperty({ example: true, description: 'Indique si la fonctionnalité est activée' })
  enabled: boolean;

  @ApiPropertyOptional({ example: 10, description: "Limite d'utilisation de la fonctionnalité" })
  limit?: number | null;
}

export class CreatePlanInput {
  @ApiProperty({ enum: Plan, example: Plan.BASIC_SUB, description: 'Nom du plan tarifaire' })
  name: Plan;

  @ApiProperty({ example: 5.5, description: 'Taux de commission appliqué au plan (en %)' })
  commissionRate: number;

  @ApiPropertyOptional({ example: true, description: 'Indique si le plan est actif' })
  isActive?: boolean;

  @ApiProperty({
    type: [PlanFeatureInput],
    description: 'Liste des fonctionnalités incluses dans le plan',
  })
  features: PlanFeatureInput[];
}

export class UpdatePlanInput {
  @ApiPropertyOptional({ example: 7.0, description: 'Nouveau taux de commission (en %)' })
  commissionRate?: number;

  @ApiPropertyOptional({ example: false, description: 'Activer ou désactiver le plan' })
  isActive?: boolean;

  @ApiPropertyOptional({
    type: [PlanFeatureInput],
    description: 'Liste mise à jour des fonctionnalités du plan',
  })
  features?: PlanFeatureInput[];
}
