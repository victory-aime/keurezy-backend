import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { PackService } from '_root/modules/packs/pack.service';
import { AuthorizeRoles, MiddlewareGuard } from '_root/guard/middleware.guard';
import { Role } from '../../../prisma/generated/enums';
import { AllowAnonymous, AuthGuard } from '@thallesp/nestjs-better-auth';
import { API_URL } from '_root/config/api';
import { CreatePlanInput } from '_root/modules/packs/pack.dto';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Packs')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, MiddlewareGuard)
export class PackController {
  constructor(private readonly packService: PackService) {}

  @Get(API_URL.PACKS.ALL_PACKS)
  @AllowAnonymous()
  @ApiOperation({ summary: 'Récupérer tous les plans tarifaires disponibles' })
  @ApiOkResponse({ description: 'Liste des plans récupérée avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async getAllPacks() {
    return this.packService.getAllPlans();
  }

  @Post(API_URL.PACKS.CREATE_PACK)
  @AuthorizeRoles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Créer un nouveau plan tarifaire (Super Admin uniquement)' })
  @ApiBody({ type: CreatePlanInput })
  @ApiOkResponse({ description: 'Plan créé avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async addPacks(@Body() data: CreatePlanInput) {
    return this.packService.createSubscriptionPlan(data);
  }
}
