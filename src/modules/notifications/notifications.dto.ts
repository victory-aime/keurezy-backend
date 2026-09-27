import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsEnum, IsString, IsOptional, IsUUID, Length } from 'class-validator';
import { NotificationScope, NotificationType, PushPlatform } from '../../../prisma/generated/enums';

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

  /** Données transmises au push uniquement (navigation à l'ouverture), non enregistrées */
  data?: Record<string, string>;
}

export class PushNotificationsDto {
  @ApiProperty({
    enum: NotificationType,
    example: NotificationType.VISIT,
  })
  @IsNotEmpty()
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiPropertyOptional({
    example: 'Visite planifiée',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({
    example: 'fex',
  })
  @IsOptional()
  @IsUUID()
  notificationId: string;

  @ApiProperty({
    example: 'Votre visite a été planifiée',
  })
  @IsNotEmpty()
  @IsString()
  body: string;

  /** Données complémentaires (ex. conversationId) pour la navigation à l'ouverture */
  @IsOptional()
  data?: Record<string, string>;
}

export class RegisterPushNotificationTokenDto {
  @IsString()
  @IsNotEmpty()
  @Length(10, 512)
  token: string;

  @IsString()
  @IsNotEmpty()
  @Length(64, 64)
  deviceKey: string;

  @ApiPropertyOptional({
    enum: PushPlatform,
    default: PushPlatform.WEB,
    description: 'WEB : jeton FCM du navigateur ; MOBILE_EXPO : jeton Expo de l’application',
  })
  @IsOptional()
  @IsEnum(PushPlatform)
  platform?: PushPlatform;
}
