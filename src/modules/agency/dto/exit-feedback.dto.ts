import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ExitFeedbackReason } from '../../../../prisma/generated/enums';

/**
 * Questionnaire de départ, facultatif : envoyé avec la résiliation de l'abonnement ou la
 * fermeture de l'agence. Corps vide accepté.
 */
export class ExitFeedbackDto {
  @ApiPropertyOptional({ enum: ExitFeedbackReason, description: 'Raison principale' })
  @IsOptional()
  @IsEnum(ExitFeedbackReason)
  reason?: ExitFeedbackReason;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Commentaire libre' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
