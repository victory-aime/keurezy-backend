import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { API_URL } from '_root/config/api';
import { NotificationsService } from './notifications.service';

@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get(API_URL.NOTIFICATION.GET_ALL)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Récupérer toutes les notifications' })
  @ApiOkResponse({
    description: 'Liste recue avec success',
  })
  @ApiBadRequestResponse({
    description: 'Une erreur est survenue réessayer plus tard',
  })
  async getAllNotifications(@Query('userId') userId: string) {
    return this.notificationsService.getUserNotifications(userId);
  }

  @Post(API_URL.NOTIFICATION.READ_ALL)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lire toutes les notifications' })
  @ApiOkResponse({
    description: 'Toutes les notifications ont ete lues avec success',
  })
  @ApiBadRequestResponse({
    description: 'Une erreur est survenue réessayer plus tard',
  })
  async markAllAsRead(@Query('userId') userId: string) {
    return this.notificationsService.readAllNotifications(userId);
  }

  @Post(API_URL.NOTIFICATION.READ_ONE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lire une notification' })
  @ApiOkResponse({
    description: 'Notification lue avec success',
  })
  @ApiBadRequestResponse({
    description: 'Une erreur est survenue réessayer plus tard',
  })
  async readOneNotification(
    @Query('notificationId') notificationId: string,
    @Query('userId') userId: string,
  ) {
    return this.notificationsService.readOneNotification(notificationId, userId);
  }

  @Get(API_URL.NOTIFICATION.GET_UNREAD_NOTIF)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lire une notification' })
  @ApiOkResponse({
    description: 'Notification lue avec success',
  })
  @ApiBadRequestResponse({
    description: 'Une erreur est survenue réessayer plus tard',
  })
  async getAllUnreadNotification(@Query('userId') userId: string) {
    return this.notificationsService.getUnreadNotifications(userId);
  }
}
