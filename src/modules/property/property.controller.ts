import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { API_URL } from '../../config/api';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PropertyDto, PropertyFilterDto } from './property.dto';
import { PropertyService } from './property.service';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { RequirePermission } from '../../guard/permission.guard';
import { AgencyProfileId } from '../../guard/current-user.decorator';

@ApiTags('Property')
@Controller()
@ApiBearerAuth()
export class PropertyController {
  constructor(private readonly propertyService: PropertyService) {}

  @Get(API_URL.PROPERTY.ALL_PROPERTIES_BY_AGENCY)
  @RequirePermission('view_properties')
  @ApiOperation({ summary: 'Récupérer toutes les propriétés' })
  @ApiOkResponse({ description: 'Liste des propriétés récupérée avec success' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async allProperties(@Query() data: PropertyFilterDto, @AgencyProfileId() userId: string) {
    return this.propertyService.getAllPropertyByAgency(data, userId);
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
  @RequirePermission('create_property')
  @ApiOperation({ summary: 'Créer une nouvelle propriété' })
  @ApiBody({ type: PropertyDto })
  @ApiOkResponse({ description: 'Propriété ajoutée avec success' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async createProperty(@Body() data: PropertyDto, @AgencyProfileId() userId: string) {
    return this.propertyService.createProperty(data, userId);
  }

  @Post(API_URL.PROPERTY.UPDATE_PROPERTY)
  @RequirePermission('update_property')
  @ApiOperation({ summary: 'Mettre a jour une propriété' })
  @ApiBody({ type: PropertyDto })
  @ApiQuery({ name: 'appartId', required: true, description: 'Identifiant de la propriété' })
  @ApiOkResponse({ description: 'Propriété mise a jour avec success' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async updateProperty(
    @Body() data: PropertyDto,
    @Query('appartId') appartId: string,
    @AgencyProfileId() userId: string,
  ) {
    return this.propertyService.updateProperty(appartId, data, userId);
  }

  @Get(API_URL.PROPERTY.OCCUPATION_RATE_BY_PROPERTY_TYPE)
  @RequirePermission('view_properties')
  @ApiOperation({ summary: "Récupérer le taux d'occupation par type de propriété" })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: 'Stats envoyée avec success' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async getOccupationRate(@AgencyProfileId() userId: string, @Query('agencyId') agencyId: string) {
    return this.propertyService.getOccupationRateByType(userId, agencyId);
  }

  @Get(API_URL.PROPERTY.PROPERTY_DETAIL)
  @RequirePermission('view_properties')
  @ApiOperation({ summary: "Détail d'un bien de l'agence (annonces et modalités de location)" })
  @ApiQuery({ name: 'id', required: true, description: 'Identifiant du bien' })
  async getPropertyDetail(@Query('id') id: string, @AgencyProfileId() userId: string) {
    return this.propertyService.getPropertyDetail(id, userId);
  }

  @Post(API_URL.PROPERTY.CLOSE_PROPERTY)
  @RequirePermission('update_property')
  @ApiOperation({ summary: 'Fermer un bien : ses annonces ne sont plus en ligne' })
  @ApiQuery({ name: 'id', required: true, description: 'Identifiant du bien' })
  async closeProperty(@Query('id') id: string, @AgencyProfileId() userId: string) {
    return this.propertyService.closeProperty(id, userId);
  }

  @Delete(API_URL.PROPERTY.DELETE_PROPERTY)
  @RequirePermission('delete_property')
  @ApiOperation({ summary: 'Supprimer un bien sans réservation ni discussion' })
  @ApiQuery({ name: 'id', required: true, description: 'Identifiant du bien' })
  async deleteProperty(@Query('id') id: string, @AgencyProfileId() userId: string) {
    return this.propertyService.deleteProperty(id, userId);
  }
}
