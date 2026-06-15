import { IsEnum, IsNotEmpty } from 'class-validator';
import { UserStatus } from '../../../../prisma/generated/enums';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserStatusDto {
  @ApiProperty({
    enum: UserStatus,
    description: "Nouveau statut de l'utilisateur",
    example: UserStatus.BANNED,
  })
  @IsEnum(UserStatus)
  @IsNotEmpty()
  status: UserStatus;
}
