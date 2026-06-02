import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { API_URL } from '_root/config/api';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { propertyDto, PropertyFilterDto } from './property.dto';
import { PropertyService } from './property.service';
import { AllowAnonymous, AuthGuard } from '@thallesp/nestjs-better-auth';
import { Throttle } from '@nestjs/throttler';
import { PermissionGuard, RequirePermission } from '_root/guard/permission.guard';

@ApiTags('Property')
@Controller()
@ApiBearerAuth()
export class PropertyController {
  constructor(private readonly propertyService: PropertyService) {}

  @Throttle({ default: { limit: 3, ttl: 60 } })
  @Get(API_URL.PROPERTY.ALL_PROPERTIES_BY_AGENCY)
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('view_properties')
  @ApiOperation({ summary: 'Récupérer toutes les propriétés' })
  @ApiOkResponse({ description: 'Liste des propriétés récupérée avec success' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async allProperties(@Query() data: PropertyFilterDto) {
    return this.propertyService.getAllPropertyByAgency(data);
  }

  @Get(API_URL.PROPERTY.ALL_PROPERTIES_PUBLIC)
  @AllowAnonymous()
  @ApiOperation({ summary: 'Récupérer toutes les propriétés publiques' })
  @ApiOkResponse({ description: 'Liste des propriétés récupérée avec success' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async publicProperties() {
    return this.propertyService.getAllPublicProperties();
  }

  @Post(API_URL.PROPERTY.CREATE_PROPERTY)
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('create_property')
  @ApiOperation({ summary: 'Créer une nouvelle propriété' })
  @ApiBody({ type: propertyDto })
  @ApiOkResponse({ description: 'Propriété ajoutée avec success' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async createProperty(@Body() data: propertyDto) {
    return this.propertyService.createProperty(data); // ✅ ownerId supprimé
  }

  @Post(API_URL.PROPERTY.UPDATE_PROPERTY)
  @ApiOperation({ summary: 'Mettre a jour une propriété' })
  @ApiBody({ type: propertyDto })
  @ApiQuery({ name: 'appartId', required: true, description: 'Identifiant de la propriété' })
  @ApiOkResponse({ description: 'Propriété mise a jour avec success' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async updateProperty(@Body() data: propertyDto, @Query('appartId') appartId: string) {
    return this.propertyService.updateProperty(appartId, { ...data }); // ✅ ownerId supprimé
  }

  @Get(API_URL.PROPERTY.OCCUPATION_RATE_BY_PROPERTY_TYPE)
  @ApiOperation({ summary: "Récupérer le taux d'occupation par type de propriété" })
  @ApiQuery({ name: 'userId', required: true, description: "Identifiant de l'utilisateur" })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: 'Stats envoyée avec success' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async getOccupationRate(@Query('userId') userId: string, @Query('agencyId') agencyId: string) {
    return this.propertyService.getOccupationRateByType(userId, agencyId);
  }
}
