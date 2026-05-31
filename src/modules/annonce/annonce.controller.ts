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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiConsumes,
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

  // 1. CRÉER UNE ANNONCE (Avec Upload d'images)

  @ApiBearerAuth()
  @Post(API_URL.ANNONCE.CREATE)
  @ApiConsumes('multipart/form-data') //  Précise à Swagger qu'on envoie des fichiers
  @ApiOperation({
    summary: 'Publier une nouvelle annonce immobilière avec images',
  })
  @ApiBody({
    type: CreateAnnonceDto,
  })
  @ApiOkResponse({ description: 'Annonce créée avec succès' })
  @ApiBadRequestResponse({ description: 'Données ou fichiers invalides' })
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

  // 2. LISTE GLOBALE
  @AllowAnonymous()
  @Post(API_URL.ANNONCE.FIND_ALL)
  @ApiOperation({ summary: 'Récupérer toutes les annonces actives' })
  @ApiOkResponse({ description: 'Liste des annonces récupérée' })
  async findAll(@Body() data: FilterAnnonceDto) {
    return this.announceService.findAllAnnounces(data);
  }

  // 3. LISTE PAR AGENCE
  @Get(API_URL.ANNONCE.FIND_BY_AGENCY)
  @ApiOperation({ summary: 'Récupérer les annonces d’une agence spécifique' })
  async findByAgency(@Query('agencyId') agencyId: string, @Query('userId') userId: string) {
    return this.announceService.findAnnoncesByAgency(agencyId, userId);
  }

  // 4. MODIFIER
  @ApiBearerAuth()
  @Put(API_URL.ANNONCE.UPDATE)
  @ApiOperation({ summary: 'Mettre à jour une annonce' })
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

  // 5. SUPPRIMER
  @ApiBearerAuth()
  @Delete(API_URL.ANNONCE.DELETE)
  @ApiOperation({ summary: 'Supprimer une annonce' })
  async remove(@Query('id') id: string) {
    return this.announceService.deleteAnnonce(id);
  }
}
