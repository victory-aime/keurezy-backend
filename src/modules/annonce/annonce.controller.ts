import {
  Controller,
  Get,
  Post,
  Body,
  Delete,
  Put,
  Query,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { AnnounceService } from './annonce.service';
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
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { UploadsService } from '_root/modules/cloudinary/uploads.service';
import { CLOUDINARY_FOLDER_NAME } from '_root/config/enum';
import {
  CreateAnnonceDto,
  FilterAnnonceDto,
  UpdateAnnonceDto,
} from '_root/modules/annonce/annonce.dto';
import { AgencyService } from '_root/modules/agency/agency.service';

@ApiTags('Annonces')
@Controller()
export class AnnonceController {
  constructor(
    private readonly announceService: AnnounceService,
    private readonly agencyService: AgencyService,
    private readonly uploadFileService: UploadsService,
  ) {}

  @ApiBearerAuth()
  @Post(API_URL.ANNONCE.CREATE)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Publier une nouvelle annonce immobilière avec images' })
  @ApiBody({
    description:
      "Payload Multipart comprenant les données JSON de l'annonce et les images physiques",
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'string',
          description: 'JSON sérialisé (CreateAnnonceDto)',
          example:
            '{"title": "Appartement F3 Almadies", "propertyId": "uuid-bien", "description": "Superbe F3...", "agencyId": "uuid-agence", "userId": "uuid-user"}',
        },
        galleryImages: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: "Images de l'annonce à uploader (Max. 5)",
        },
      },
      required: ['data'],
    },
  })
  @ApiOkResponse({ description: 'Annonce créée avec succès' })
  @ApiBadRequestResponse({ description: 'Données ou fichiers invalides' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'galleryImages', maxCount: 5 }]))
  async create(
    @Body('data') rawData: string,
    @UploadedFiles() files: { galleryImages?: Express.Multer.File[] },
  ) {
    const data: CreateAnnonceDto = JSON.parse(rawData);
    let cloudinaryImagesUrls: string[] = [];

    if (files?.galleryImages?.length) {
      const agency = await this.agencyService.findAgency(data?.agencyId!, data?.userId!);
      const uploads = await Promise.all(
        files.galleryImages.map((file) =>
          this.uploadFileService.uploadFiles(
            file,
            agency?.name || 'agence-anonyme',
            CLOUDINARY_FOLDER_NAME.ANNONCE,
          ),
        ),
      );
      cloudinaryImagesUrls = uploads.map((res) => res.secure_url);
    }

    return this.announceService.createAnnounce({
      ...data,
      galleryImages: cloudinaryImagesUrls,
    });
  }

  @AllowAnonymous()
  @Post(API_URL.ANNONCE.FIND_ALL)
  @ApiOperation({ summary: 'Récupérer toutes les annonces actives avec filtres' })
  @ApiBody({ type: FilterAnnonceDto })
  @ApiOkResponse({ description: 'Liste des annonces récupérée', type: [Object] })
  @ApiBadRequestResponse({ description: 'Paramètres de filtrage invalides' })
  async findAll(@Body() data: FilterAnnonceDto) {
    return this.announceService.findAllAnnounces(data);
  }

  @ApiBearerAuth()
  @Get(API_URL.ANNONCE.FIND_BY_AGENCY)
  @ApiOperation({ summary: "Récupérer les annonces d'une agence spécifique" })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiQuery({
    name: 'userId',
    required: true,
    description: "Identifiant de l'utilisateur/membre de l'agence",
  })
  @ApiOkResponse({ description: "Annonces de l'agence récupérées avec succès" })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  async findByAgency(@Query('agencyId') agencyId: string, @Query('userId') userId: string) {
    return this.announceService.findAnnoncesByAgency(agencyId, userId);
  }

  @ApiBearerAuth()
  @Put(API_URL.ANNONCE.UPDATE)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Mettre à jour une annonce' })
  @ApiBody({
    description:
      'Payload Multipart comprenant les données JSON modifiées et les nouvelles images optionnelles',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'string',
          description: 'JSON sérialisé (UpdateAnnonceDto)',
          example:
            '{"id": "uuid-de-l-annonce", "title": "Titre modifié", "description": "Nouvelle description"}',
        },
        galleryImages: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Nouvelles images à rajouter ou remplacer (Max. 5)',
        },
      },
      required: ['data'],
    },
  })
  @ApiOkResponse({ description: 'Annonce mise à jour avec succès' })
  @ApiBadRequestResponse({ description: 'Données ou fichiers invalides' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'galleryImages', maxCount: 5 }]))
  async updateAnnonce(
    @Body('data') rawData: string,
    @UploadedFiles() files: { galleryImages?: Express.Multer.File[] },
  ) {
    const data: UpdateAnnonceDto = JSON.parse(rawData);
    let cloudinaryImagesUrls: string[] = [];

    if (files?.galleryImages?.length) {
      const agency = await this.agencyService.findAgency(data?.agencyId!, data?.userId!);
      const uploads = await Promise.all(
        files.galleryImages.map((file) =>
          this.uploadFileService.uploadFiles(
            file,
            agency?.name || 'agence-anonyme',
            CLOUDINARY_FOLDER_NAME.ANNONCE,
          ),
        ),
      );
      cloudinaryImagesUrls = uploads.map((res) => res.secure_url);
    }

    return this.announceService.updateAnnonce({
      ...data,
      galleryImages: cloudinaryImagesUrls,
    });
  }

  @ApiBearerAuth()
  @Delete(API_URL.ANNONCE.DELETE)
  @ApiOperation({ summary: 'Supprimer une annonce' })
  @ApiQuery({ name: 'id', required: true, description: "Identifiant de l'annonce à supprimer" })
  @ApiOkResponse({ description: 'Annonce supprimée avec succès' })
  @ApiBadRequestResponse({ description: 'Annonce introuvable ou erreur serveur' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  async remove(@Query('id') id: string) {
    return this.announceService.deleteAnnonce(id);
  }
}
