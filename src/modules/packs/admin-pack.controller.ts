import { Body, Controller, Delete, Get, Query, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AllowAnonymous, AuthGuard } from '@thallesp/nestjs-better-auth';
import { AuthorizeRoles, MiddlewareGuard } from '_root/guard/middleware.guard';
import { Role } from '../../../prisma/generated/enums';
import { PackAdminService } from './pack-admin.service';
import { CreatePlanInput, UpdatePlanInput } from './pack.dto';
import { API_URL } from '_root/config/api';

@ApiTags('Super Admin - Plans')
@ApiBearerAuth()
@Controller()
@AllowAnonymous()
@UseGuards(AuthGuard, MiddlewareGuard)
export class AdminPackController {
  constructor(private readonly packAdminService: PackAdminService) {}

  // GET /api/v1/secure/admin/plans
  @Get(API_URL.PLANS_ADMIN.LIST)
  @AuthorizeRoles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Lister tous les plans avec leurs features et limites' })
  @ApiOkResponse({ description: 'Liste des plans récupérée avec succès' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  async getAllPlans() {
    return this.packAdminService.getAllPlans();
  }

  // GET /api/v1/secure/admin/plans/:id
  @Get(API_URL.PLANS_ADMIN.DETAIL)
  @AuthorizeRoles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: "Détail d'un plan par ID" })
  @ApiQuery({ name: 'id', description: 'Identifiant du plan' })
  @ApiOkResponse({ description: 'Plan récupéré avec succès' })
  @ApiBadRequestResponse({ description: 'Plan introuvable' })
  async getPlanById(@Query('id') id: string) {
    return this.packAdminService.getPlanById(id);
  }

  // POST /api/v1/secure/admin/plans
  @Post(API_URL.PLANS_ADMIN.CREATE)
  @AuthorizeRoles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Créer un nouveau plan' })
  @ApiBody({ type: CreatePlanInput })
  @ApiOkResponse({ description: 'Plan créé avec succès' })
  @ApiBadRequestResponse({ description: 'Plan déjà existant ou features introuvables' })
  async createPlan(@Body() dto: CreatePlanInput) {
    return this.packAdminService.createPlan(dto);
  }

  // PATCH /api/v1/secure/admin/plans/update-plan
  @Patch(API_URL.PLANS_ADMIN.UPDATE)
  @AuthorizeRoles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Mettre à jour un plan et ses features/limites' })
  @ApiQuery({ name: 'id', description: 'Identifiant du plan' })
  @ApiBody({ type: UpdatePlanInput })
  @ApiOkResponse({ description: 'Plan mis à jour avec succès' })
  @ApiBadRequestResponse({ description: 'Plan introuvable ou features invalides' })
  async updatePlan(@Query('id') id: string, @Body() dto: UpdatePlanInput) {
    return this.packAdminService.updatePlan(id, dto);
  }

  // PATCH /api/v1/secure/admin/plans/toggle-status
  @Patch(API_URL.PLANS_ADMIN.TOGGLE_STATUS)
  @AuthorizeRoles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Activer ou désactiver un plan' })
  @ApiQuery({ name: 'id', description: 'Identifiant du plan' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        isActive: { type: 'boolean', example: true },
      },
    },
  })
  @ApiOkResponse({ description: 'Statut du plan mis à jour avec succès' })
  async togglePlanStatus(@Query('id') id: string, @Body('isActive') isActive: boolean) {
    return this.packAdminService.togglePlanStatus(id, isActive);
  }

  // DELETE /api/v1/secure/admin/plans/:id
  @Delete(API_URL.PLANS_ADMIN.DELETE)
  @AuthorizeRoles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Supprimer un plan (impossible si des agences y sont abonnées)' })
  @ApiQuery({ name: 'id', description: 'Identifiant du plan' })
  @ApiOkResponse({ description: 'Plan supprimé avec succès' })
  @ApiBadRequestResponse({ description: 'Plan introuvable ou abonnements actifs' })
  async deletePlan(@Query('id') id: string) {
    return this.packAdminService.deletePlan(id);
  }
}
