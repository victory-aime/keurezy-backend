import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsEnum, IsString, IsOptional } from 'class-validator';
import { NotificationScope, NotificationType } from '../../../prisma/generated/enums';

export class NotificationsDto {
  @ApiProperty({
    enum: NotificationType,
    example: NotificationType.VISIT,
  })
  @IsNotEmpty()
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({
    enum: NotificationScope,
    example: NotificationScope.USER,
  })
  @IsNotEmpty()
  @IsEnum(NotificationScope)
  scope: NotificationScope;

  @ApiPropertyOptional({
    example: 'Visite planifiée',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({
    example: 'Votre visite a été planifiée',
  })
  @IsNotEmpty()
  @IsString()
  content: string;

  recipients?: string[] | undefined;
}
