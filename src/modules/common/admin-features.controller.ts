import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthorizeRoles, MiddlewareGuard } from '../../guard/middleware.guard';
import { Role, FeatureCategory } from '../../../prisma/generated/enums';
import { FeaturesAdminService } from './services/features-admin.service';
import { API_URL } from '../../config/api';
import { AuthGuard } from '@thallesp/nestjs-better-auth';

@ApiTags('Super Admin - Fonctionnalités')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, MiddlewareGuard)
@AuthorizeRoles(Role.SUPER_ADMIN)
export class AdminFeaturesController {
  constructor(private readonly featuresAdminService: FeaturesAdminService) {}

  // GET /api/v1/secure/admin/features
  @Get(API_URL.FEATURES_ADMIN.LIST)
  @ApiOperation({
    summary: 'Lister toutes les fonctionnalités',
    description:
      "Retourne toutes les features de l'application avec leurs permissions associées. Filtrage optionnel par catégorie.",
  })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: FeatureCategory,
    description: 'Filtrer par catégorie',
  })
  @ApiOkResponse({ description: 'Liste des fonctionnalités récupérée avec succès' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  async getAllFeatures(@Query('category') category?: FeatureCategory) {
    return this.featuresAdminService.getAllFeatures(category);
  }

  // GET /api/v1/secure/admin/features/:id
  @Get(API_URL.FEATURES_ADMIN.DETAIL)
  @ApiOperation({
    summary: "Détail d'une fonctionnalité",
    description:
      "Retourne le détail d'une feature avec ses permissions et les plans qui l'incluent.",
  })
  @ApiQuery({ name: 'id', description: 'Identifiant de la fonctionnalité' })
  @ApiOkResponse({ description: 'Fonctionnalité récupérée avec succès' })
  @ApiBadRequestResponse({ description: 'Fonctionnalité introuvable' })
  async getFeatureById(@Query('id') id: string) {
    return this.featuresAdminService.getFeatureById(id);
  }
}
