// src/modules/users/admin-users.controller.ts

import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import { AuthorizeRoles, MiddlewareGuard } from '_root/guard/middleware.guard';
import { UsersAdminService } from './users-admin.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { API_URL } from '_root/config/api';
import { Role } from '../../../prisma/generated/enums';
import { convertToInteger } from '_root/config/convert';

@ApiTags('Super Admin - Utilisateurs')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, MiddlewareGuard)
@AuthorizeRoles(Role.SUPER_ADMIN)
export class AdminUsersController {
  constructor(private readonly usersAdminService: UsersAdminService) {}

  // GET /api/v1/secure/admin/users
  @Get(API_URL.USER_ADMIN.LIST)
  @AuthorizeRoles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Lister tous les utilisateurs',
    description:
      'Retourne la liste paginée de tous les utilisateurs avec filtrage optionnel par rôle.',
  })
  @ApiQuery({ name: 'initialPage', required: false, example: 1 })
  @ApiQuery({ name: 'limitPerPage', required: false, example: 10 })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: Role,
    description: 'Filtrer par rôle',
  })
  @ApiOkResponse({ description: 'Liste des utilisateurs récupérée avec succès' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  async getAllUsers(
    @Query('initialPage') initialPage: number,
    @Query('limitPerPage') limitPerPage: number,
    @Query('role') role?: Role,
  ) {
    const page = convertToInteger(initialPage) || 1;
    const limit = convertToInteger(limitPerPage) || 10;
    return this.usersAdminService.getAllUsers(page, limit);
  }

  @Get(API_URL.USER_ADMIN.GET_USER_INFO)
  @ApiOperation({ summary: 'Récupérer les informations de utilisateur' })
  @ApiOkResponse({ description: 'Informations utilisateur récupérée.' })
  @ApiNotFoundResponse({ description: 'Aucun Utilisateur.' })
  async getUserById(@Query('userId') userId: string) {
    return this.usersAdminService.getUserById(userId);
  }

  // PATCH /api/v1/secure/admin/users//status
  @Patch(API_URL.USER_ADMIN.UPDATE_STATUS)
  @AuthorizeRoles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Bloquer ou débloquer un utilisateur',
    description:
      "Permet au SUPER_ADMIN de changer le statut d'un utilisateur : ACTIVE, INACTIVE ou BANNED.",
  })
  @ApiQuery({ name: 'id', description: "Identifiant de l'utilisateur" })
  @ApiBody({ type: UpdateUserStatusDto })
  @ApiOkResponse({ description: 'Statut mis à jour avec succès' })
  @ApiBadRequestResponse({ description: 'Utilisateur introuvable ou statut invalide' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  async updateUserStatus(@Query('id') id: string, @Body() dto: UpdateUserStatusDto) {
    return this.usersAdminService.updateUserStatus(id, dto.status);
  }
}
