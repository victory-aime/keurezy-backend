import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { API_URL } from '../../config/api';
import { CurrentUserId } from '../../guard/current-user.decorator';
import { PreferencesService } from './preferences.service';
import { UpdateNotificationPreferencesDto } from './preferences.dto';

@ApiTags('Préférences')
@ApiBearerAuth()
@Controller()
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get(API_URL.PREFERENCES.ME)
  @ApiOperation({
    summary: 'Mes préférences',
    description:
      'Préférences complétées par les valeurs par défaut, et options proposées (catégories, canaux, sons, types de bien).',
  })
  @ApiOkResponse({ description: '{ notifications, options }' })
  getMine(@CurrentUserId() userId: string) {
    return this.preferencesService.getMyPreferences(userId);
  }

  @Patch(API_URL.PREFERENCES.NOTIFICATIONS)
  @ApiOperation({
    summary: 'Mettre à jour mes préférences de notification',
    description:
      'Mise à jour partielle. « Compte et sécurité » reste toujours actif ; l’e-mail n’est proposé que pour les réservations.',
  })
  @ApiBody({ type: UpdateNotificationPreferencesDto })
  updateNotifications(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.preferencesService.updateNotificationPreferences(userId, dto);
  }
}
