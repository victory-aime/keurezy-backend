import { SIGNUP_THROTTLE } from '../../config/throttle';
import { Throttle } from '@nestjs/throttler';
import { ExitFeedbackDto } from './dto/exit-feedback.dto';
import { Body, Controller, Get, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { API_URL } from '../../config/api';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CreateAgencyOwnerDto, UpdateAgencyDto } from './agency.dto';
import { AgencyService } from './agency.service';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { UploadsService } from '../cloudinary/uploads.service';
import { CLOUDINARY_FOLDER_NAME } from '../../config/enum';
import { AgencyProfileId } from '../../guard/current-user.decorator';
import { MultipartJson } from '../../config/multipart-json.decorator';
import { AllowWhenInactive } from '../../guard/active-subscription.guard';

@ApiTags('Agency')
@Controller()
@ApiBearerAuth()
export class AgencyController {
  constructor(
    private readonly agencyService: AgencyService,
    private readonly uploadFileService: UploadsService,
  ) {}

  @Get(API_URL.AGENCY.AGENCY_INFO)
  @ApiOperation({ summary: "Récupérer les informations d'une agence" })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: "Informations de l'agence récupérées avec succès" })
  @ApiBadRequestResponse({ description: 'Agence introuvable ou erreur serveur' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  async agencyInfo(@Query('agencyId') agencyId: string, @AgencyProfileId() userId: string) {
    return this.agencyService.findAgency(agencyId, userId);
  }

  @Get(API_URL.AGENCY.AGENCY_SUBSCRIPTION_INFO)
  @ApiOperation({ summary: "Récupérer les informations d'abonnement d'une agence" })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: "Informations d'abonnement récupérées avec succès" })
  @ApiBadRequestResponse({ description: 'Agence introuvable ou erreur serveur' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  async agencySubscriptionInfo(
    @Query('agencyId') agencyId: string,
    @AgencyProfileId() userId: string,
  ) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    return this.agencyService.getAgencyPlanFeatures(agencyId);
  }

  @AllowAnonymous()
  @Post(API_URL.AGENCY.CREATE_AGENCY)
  @ApiOperation({ summary: 'Créer une agence (accessible sans authentification)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description:
      "Payload Multipart comprenant les données JSON de l'agence et les documents d'identité",
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'string',
          description: 'JSON sérialisé (CreateAgencyOwnerDto)',
          example:
            '{"name": "NANA Beauty Salon", "email": "contact@nana.sn", "address": "123 Avenue Habib Bourguiba", "phone": "+221 77 000 00 00", "description": "Agence spécialisée en location résidentielle", "acceptTerms": true, "userEmail": "owner@example.com", "username": "mamadou.diallo", "password": "motdepasse123456", "plan": {"planId": "uuid-du-plan", "billingCycle": "MONTHLY"}}',
        },
        documents: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: "Documents d'identité à uploader pour validation (Max. 5)",
        },
      },
      required: ['data'],
    },
  })
  @ApiOkResponse({ description: 'Agence créée avec succès, en attente de validation' })
  @ApiBadRequestResponse({ description: 'Données ou fichiers invalides' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'documents', maxCount: 5 }]))
  @Throttle(SIGNUP_THROTTLE)
  async createAgency(
    @MultipartJson('data', CreateAgencyOwnerDto) data: CreateAgencyOwnerDto,
    @UploadedFiles()
    files: {
      documents?: Express.Multer.File[];
    },
  ) {
    return this.agencyService.createAgency({
      ...data,
      documents: files?.documents,
    });
  }

  @Post(API_URL.AGENCY.UPDATE_AGENCY)
  @ApiOperation({ summary: "Mettre à jour les informations d'une agence" })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description:
      'Payload Multipart comprenant les données JSON à modifier et le nouveau logo optionnel',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'string',
          description: 'JSON sérialisé (UpdateAgencyDto)',
          example:
            '{"agencyId": "uuid-de-l-agence", "userId": "uuid-du-user", "name": "Nouveau nom"}',
        },
        agencyLogo: {
          type: 'string',
          format: 'binary',
          description: "Nouveau logo de l'agence (optionnel)",
        },
      },
      required: ['data'],
    },
  })
  @ApiOkResponse({ description: 'Agence mise à jour avec succès' })
  @ApiBadRequestResponse({ description: 'Données ou fichiers invalides' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'agencyLogo', maxCount: 1 }]))
  async updateAgency(
    @Body() data: UpdateAgencyDto,
    @AgencyProfileId() userId: string,
    @UploadedFiles()
    files: {
      agencyLogo?: Express.Multer.File[];
    },
  ) {
    // Contrôle d'accès avant tout upload vers Cloudinary
    const agency = await this.agencyService.findAgency(data.agencyId, userId);

    let cloudinaryAgencyLogoFileUrl: string = '';

    if (files?.agencyLogo?.length) {
      const uploadAgencyLogo = await this.uploadFileService.uploadFiles(
        files.agencyLogo[0],
        data.name ?? agency.name,
        CLOUDINARY_FOLDER_NAME.LOGO,
      );
      cloudinaryAgencyLogoFileUrl = uploadAgencyLogo.secure_url;
    }

    return this.agencyService.updateAgency(
      {
        ...data,
        agencyLogo: cloudinaryAgencyLogoFileUrl,
      },
      userId,
    );
  }

  @Get(API_URL.AGENCY.CLOSE_IMPACT)
  @ApiOperation({ summary: "Impact de la fermeture de l'agence (propriétaire uniquement)" })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: 'Membres, biens, réservations et abonnement concernés' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  async closeImpact(@Query('agencyId') agencyId: string, @AgencyProfileId() userId: string) {
    return this.agencyService.getCloseImpact(agencyId, userId);
  }

  @AllowWhenInactive()
  @Post(API_URL.AGENCY.CLOSE_AGENCY)
  @ApiOperation({
    summary: "Programmer la fermeture de l'agence (propriétaire uniquement)",
    description:
      'La fermeture est effective après le délai de grâce (15 jours), exécutée par un cron ; annulable d’ici là.',
  })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence à fermer" })
  @ApiOkResponse({ description: 'Date de fermeture programmée' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  async closeAgency(
    @Query('agencyId') agencyId: string,
    @AgencyProfileId() userId: string,
    @Body() feedback: ExitFeedbackDto,
  ) {
    return this.agencyService.scheduleClose({ agencyId, userId, feedback });
  }

  @AllowWhenInactive()
  @Post(API_URL.AGENCY.CANCEL_CLOSE)
  @ApiOperation({
    summary: "Annuler la fermeture programmée de l'agence (propriétaire uniquement)",
  })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: 'Fermeture annulée' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  async cancelClose(@Query('agencyId') agencyId: string, @AgencyProfileId() userId: string) {
    return this.agencyService.cancelScheduledClose({ agencyId, userId });
  }

  @AllowAnonymous()
  @Post(API_URL.AGENCY.CHECK_NAME)
  @ApiOperation({
    summary: 'Vérifier si une agence portant ce nom existe déjà (accessible sans authentification)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Immo Dakar' },
      },
      required: ['name'],
    },
  })
  @ApiOkResponse({ description: 'Retourne true si le nom est déjà pris, false sinon' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  async checkAgencyName(@Body() data: { name: string }) {
    return this.agencyService.checkAgencyName(data?.name);
  }

  @Get(API_URL.AGENCY.STATS)
  @ApiOperation({ summary: "Statistiques globales de l'agence" })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: 'Statistiques recuperees avec succes' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue' })
  async getAgencyStats(@Query('agencyId') agencyId: string, @AgencyProfileId() userId: string) {
    return this.agencyService.getAgencyStats(agencyId, userId);
  }
}
