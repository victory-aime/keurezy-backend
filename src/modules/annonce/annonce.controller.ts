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
import { API_URL } from '../../config/api';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { UploadsService } from '../cloudinary/uploads.service';
import { AgencyService } from '../agency/agency.service';
import {
  AnnonceAvailabilityDto,
  AnnonceQuoteDto,
  CreateAnnonceDto,
  FilterAnnonceDto,
  FindAnnonceDto,
  UpdateAnnonceDto,
} from './annonce.dto';
import { AgencyProfileId } from '../../guard/current-user.decorator';
import { MultipartJson } from '../../config/multipart-json.decorator';
import { CLOUDINARY_FOLDER_NAME } from '../../config/enum';

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
    @MultipartJson('data', CreateAnnonceDto) data: CreateAnnonceDto,
    @AgencyProfileId() userId: string,
    @UploadedFiles() files: { galleryImages?: Express.Multer.File[] },
  ) {
    let cloudinaryImagesUrls: string[] = [];

    if (files?.galleryImages?.length) {
      const agency = await this.agencyService.findAgency(data.agencyId, userId);
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

    return this.announceService.createAnnounce(
      {
        ...data,
        galleryImages: cloudinaryImagesUrls,
      },
      userId,
    );
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

  @AllowAnonymous()
  @Get(API_URL.ANNONCE.FIND_ONE)
  @ApiOperation({ summary: 'Détail public d’une annonce active, avec ses modalités de location' })
  @ApiOkResponse({ description: 'Annonce, bien, bâtiment, agence et offres de location' })
  @ApiNotFoundResponse({ description: 'Annonce introuvable ou inactive' })
  async findOne(@Query() query: FindAnnonceDto) {
    return this.announceService.findPublicAnnonce(query.id);
  }

  @AllowAnonymous()
  @Get(API_URL.ANNONCE.AVAILABILITY)
  @ApiOperation({
    summary: 'Créneaux libres d’une annonce pour un type de location',
    description:
      'Périodes de disponibilité moins les réservations confirmées. Les demandes en attente ne bloquent pas les dates.',
  })
  @ApiOkResponse({ description: 'Plages libres au format AAAA-MM-JJ, bornes incluses' })
  @ApiNotFoundResponse({ description: 'Annonce introuvable ou type de location non proposé' })
  async availability(@Query() query: AnnonceAvailabilityDto) {
    return this.announceService.getAnnonceAvailability(query);
  }

  @AllowAnonymous()
  @Post(API_URL.ANNONCE.QUOTE)
  @ApiOperation({ summary: 'Devis d’une location : durée, disponibilité et montant' })
  @ApiBody({ type: AnnonceQuoteDto })
  @ApiOkResponse({ description: 'Dates retenues, prix unitaire, total et caution' })
  @ApiBadRequestResponse({ description: 'Durée hors limites ou date invalide' })
  @ApiNotFoundResponse({ description: 'Annonce introuvable ou type de location non proposé' })
  @ApiConflictResponse({ description: 'Dates déjà réservées ou hors disponibilité' })
  async quote(@Body() dto: AnnonceQuoteDto) {
    return this.announceService.quoteAnnonce(dto);
  }

  @ApiBearerAuth()
  @Get(API_URL.ANNONCE.FIND_BY_AGENCY)
  @ApiOperation({ summary: "Récupérer les annonces d'une agence spécifique" })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: "Annonces de l'agence récupérées avec succès" })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  async findByAgency(@Query('agencyId') agencyId: string, @AgencyProfileId() userId: string) {
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
    @MultipartJson('data', UpdateAnnonceDto) data: UpdateAnnonceDto,
    @AgencyProfileId() userId: string,
    @UploadedFiles() files: { galleryImages?: Express.Multer.File[] },
  ) {
    // Sans nouvel upload, la galerie existante est conservée (undefined ≠ [])
    let cloudinaryImagesUrls: string[] | undefined;

    if (files?.galleryImages?.length) {
      const agency = await this.agencyService.findAgency(data.agencyId!, userId);
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

    return this.announceService.updateAnnonce(
      {
        ...data,
        galleryImages: cloudinaryImagesUrls,
      },
      userId,
    );
  }

  @ApiBearerAuth()
  @Delete(API_URL.ANNONCE.DELETE)
  @ApiOperation({ summary: 'Supprimer une annonce' })
  @ApiQuery({ name: 'id', required: true, description: "Identifiant de l'annonce à supprimer" })
  @ApiOkResponse({ description: 'Annonce supprimée avec succès' })
  @ApiBadRequestResponse({ description: 'Annonce introuvable ou erreur serveur' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  async remove(@Query('id') id: string, @AgencyProfileId() userId: string) {
    return this.announceService.deleteAnnonce(id, userId);
  }
}
