import { Body, Controller, Get, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { API_URL } from '_root/config/api';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { createAgencyOwnerDto, updateAgencyDto } from './agency.dto';
import { AgencyService } from './agency.service';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { UploadsService } from '_root/modules/cloudinary/uploads.service';
import { CLOUDINARY_FOLDER_NAME } from '_root/config/enum';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

@ApiTags('Agency')
@Controller()
@ApiBearerAuth()
export class AgencyController {
  constructor(
    private readonly agencyService: AgencyService,
    private readonly uploadFileService: UploadsService,
  ) {}

  @Get(API_URL.AGENCY.AGENCY_INFO)
  @ApiOperation({ summary: "Infos d'une agence" })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: 'Info récupérer avec success' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async agencyInfo(@Query('agencyId') agencyId: string) {
    return this.agencyService.findAgency(agencyId);
  }

  @Get(API_URL.AGENCY.AGENCY_SUBSCRIPTION_INFO)
  @ApiOperation({ summary: "Récupérer les informations d'abonnement d'une agence" })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: "Informations d'abonnement récupérées avec succès" })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async agencySubscriptionInfo(@Query('agencyId') agencyId: string) {
    return this.agencyService.getAgencyPlanFeatures(agencyId);
  }

  @AllowAnonymous()
  @Post(API_URL.AGENCY.CREATE_AGENCY)
  @ApiOperation({ summary: 'Créer une agence' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: createAgencyOwnerDto })
  @ApiOkResponse({ description: 'Agence créer avec success en attente de validation' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'documents', maxCount: 5 }]))
  async createAgency(
    @Body('data') rawData: string,
    @UploadedFiles()
    files: {
      documents?: Express.Multer.File[];
    },
  ) {
    const data: createAgencyOwnerDto = JSON.parse(rawData);

    let cloudinaryDocumentsFileUrl: string[] = [];

    if (files?.documents?.length) {
      const uploads = await Promise.all(
        files.documents.map((document) =>
          this.uploadFileService.uploadFiles(document, data.name, CLOUDINARY_FOLDER_NAME.DOC),
        ),
      );

      cloudinaryDocumentsFileUrl = uploads.map((file) => file.secure_url);
    }
    return this.agencyService.createAgency({
      ...data,
      documents: cloudinaryDocumentsFileUrl,
    });
  }

  @Post(API_URL.AGENCY.UPDATE_AGENCY)
  @ApiOperation({ summary: "Mettre a jour les informations d'une agence" })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: updateAgencyDto })
  @ApiOkResponse({ description: 'Agence modifiée avec success' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'agencyLogo', maxCount: 1 }]))
  async updateAgency(
    @Body() data: updateAgencyDto,
    @UploadedFiles()
    files: {
      agencyLogo?: Express.Multer.File[];
    },
  ) {
    let cloudinaryAgencyLogoFileUrl: string = '';

    if (files?.agencyLogo?.length) {
      const uploadAgencyLogo = await this.uploadFileService.uploadFiles(
        files.agencyLogo[0],
        data.name,
        CLOUDINARY_FOLDER_NAME.LOGO,
      );
      cloudinaryAgencyLogoFileUrl = uploadAgencyLogo.secure_url;
    }

    return this.agencyService.updateAgency({
      ...data,
      agencyLogo: cloudinaryAgencyLogoFileUrl,
    });
  }

  @Post(API_URL.AGENCY.CLOSE_AGENCY)
  @ApiOperation({ summary: 'Fermée votre agence' })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence à fermer" })
  @ApiQuery({ name: 'ownerId', required: true, description: "Identifiant du propriétaire de l'agence" })
  @ApiOkResponse({ description: 'Agence fermée avec success' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async closeAgency(@Query('agencyId') agencyId: string, @Query('ownerId') ownerId: string) {
    return this.agencyService.closeAgency({ agencyId, ownerId });
  }

  @AllowAnonymous()
  @Post(API_URL.AGENCY.CHECK_NAME)
  @ApiOperation({ summary: 'Verifier si une agence portant ce nom existe deja' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Immo Dakar' },
      },
      required: ['name'],
    },
  })
  @ApiOkResponse({ description: 'return un boolean' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async checkAgencyName(@Body() data: { name: string }) {
    return this.agencyService.checkAgencyName(data?.name);
  }
}
