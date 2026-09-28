import {
  Controller,
  Delete,
  Get,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { LandService } from './land.service';
import { AgencyService } from '../agency/agency.service';
import { UploadsService } from '../cloudinary/uploads.service';
import { API_URL } from '../../config/api';
import { AgencyProfileId } from '../../guard/current-user.decorator';
import { CreateLandDto, LandFilterDto, UpdateLandDto } from './land.dto';
import { CLOUDINARY_FOLDER_NAME } from '../../config/enum';
import { MultipartJson } from '../../config/multipart-json.decorator';
import { RequirePermission } from '../../guard/permission.guard';

@ApiTags('Land')
@ApiBearerAuth()
@Controller()
export class LandController {
  constructor(
    private readonly landService: LandService,
    private readonly agencyService: AgencyService,
    private readonly uploadFileService: UploadsService,
  ) {}

  @Get(API_URL.LAND.ALL_LAND_BY_AGENCY)
  @RequirePermission('manage_land')
  @ApiOperation({ summary: "Récupérer tous les terrains d'une agence" })
  @ApiOkResponse({ description: 'Liste des terrains récupérée avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async getAllLands(@Query() data: LandFilterDto, @AgencyProfileId() userId: string) {
    return this.landService.getAllLandByAgency(data, userId);
  }

  @Post(API_URL.LAND.CREATE_LAND)
  @RequirePermission('manage_land')
  @ApiOperation({ summary: 'Créer un nouveau terrain' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateLandDto })
  @ApiOkResponse({ description: 'Terrain créé avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'documents', maxCount: 4 }]))
  async createLand(
    @MultipartJson('data', CreateLandDto) data: CreateLandDto,
    @AgencyProfileId() userId: string,
    @UploadedFiles()
    files: {
      documents?: Express.Multer.File[];
    },
  ) {
    let cloudinaryDocumentsFilesUrl: string[] = [];
    const getAgencyName = await this.agencyService.findAgency(data.agencyId, userId);
    if (files?.documents?.length) {
      const uploads = await Promise.all(
        files.documents.map((document) =>
          this.uploadFileService.uploadFiles(
            document,
            getAgencyName?.name,
            CLOUDINARY_FOLDER_NAME.DOC,
          ),
        ),
      );

      cloudinaryDocumentsFilesUrl = uploads.map((file) => file.secure_url);
    }
    return this.landService.createLand({ ...data, documents: cloudinaryDocumentsFilesUrl }, userId);
  }

  @Post(API_URL.LAND.UPDATE)
  @RequirePermission('manage_land')
  @ApiOperation({ summary: 'Mettre à jour un terrain existant' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateLandDto })
  @ApiOkResponse({ description: 'Terrain mis à jour avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'documents', maxCount: 4 }]))
  async updateLand(
    @MultipartJson('data', UpdateLandDto) data: UpdateLandDto,
    @AgencyProfileId() userId: string,
    @UploadedFiles()
    files: {
      documents?: Express.Multer.File[];
    },
  ) {
    // Sans nouvel upload, les documents existants sont conservés (undefined ≠ [])
    let cloudinaryDocumentsFilesUrl: string[] | undefined;

    const getAgencyName = await this.agencyService.findAgency(data.agencyId, userId);

    if (files?.documents?.length) {
      const uploads = await Promise.all(
        files.documents.map((document) =>
          this.uploadFileService.uploadFiles(
            document,
            getAgencyName?.name,
            CLOUDINARY_FOLDER_NAME.DOC,
          ),
        ),
      );

      cloudinaryDocumentsFilesUrl = uploads.map((file) => file.secure_url);
    }
    return this.landService.updateLand({ ...data, documents: cloudinaryDocumentsFilesUrl }, userId);
  }

  @Delete(API_URL.LAND.DELETE)
  @RequirePermission('manage_land')
  @ApiOperation({ summary: 'Supprimer un terrain (non implémenté)' })
  @ApiOkResponse({ description: 'Delete land not implemented' })
  async deleteLand() {
    return 'Delete land not implemented';
  }
}
