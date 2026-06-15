import { IsEnum, IsNotEmpty } from 'class-validator';
import { AgencyStatus } from '../../../../prisma/generated/enums';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAgencyStatusDto {
  @ApiProperty({
    enum: AgencyStatus,
    description: "Nouveau statut de l'agence",
    example: AgencyStatus.OPEN,
  })
  @IsEnum(AgencyStatus)
  @IsNotEmpty()
  status: AgencyStatus;
}
