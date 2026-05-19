import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { StatsService } from './stats.service';
import { AllowAnonymous, AuthGuard } from '@thallesp/nestjs-better-auth';
import { MiddlewareGuard } from '_root/guard/middleware.guard';

@ApiTags('Stats')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, MiddlewareGuard)
@AllowAnonymous() // TEMPORAIRE — a retirer quand l'auth sera reglee
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  // GET v1/secure/stats/agency?agencyId=
  // Stats globales de l'agence pour le Owner

  @Get('v1/secure/stats/agency')
  @ApiOperation({ summary: "Statistiques globales de l'agence" })
  @ApiOkResponse({ description: 'Statistiques recuperees avec succes' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue' })
  async getAgencyStats(@Query('agencyId') agencyId: string) {
    return this.statsService.getAgencyStats(agencyId);
  }
}
