import {
  Body,
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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AgencyService } from '../agency/agency.service';
import { BuildingService } from './building.service';
import { UploadsService } from '../cloudinary/uploads.service';
import { API_URL } from '../../config/api';
import { MultipartJson } from '../../config/multipart-json.decorator';
import { AgencyProfileId } from '../../guard/current-user.decorator';
import { BuildingFilterDto, CreateBuildingDto, UpdateBuildingDto } from './building.dto';
import { CLOUDINARY_FOLDER_NAME } from '../../config/enum';
import { RequirePermission } from '../../guard/permission.guard';

@ApiTags('Building')
@ApiBearerAuth()
@Controller()
export class BuildingController {
  constructor(
    private readonly buildingService: BuildingService,
    private readonly agencyService: AgencyService,
    private readonly uploadFileService: UploadsService,
  ) {}

  @Get(API_URL.BUILDING.ALL_BUILDING_BY_AGENCY)
  @RequirePermission('manage_batiment')
  @ApiOperation({ summary: "Récupérer tous les bâtiments d'une agence" })
  @ApiOkResponse({ description: 'Liste des bâtiments récupérée avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async getBuildingByAgency(@Query() data: BuildingFilterDto, @AgencyProfileId() userId: string) {
    return this.buildingService.getAllBuildingByAgency(data, userId);
  }

  @Post(API_URL.BUILDING.CREATE_BUILDING)
  @RequirePermission('manage_batiment')
  @ApiOperation({ summary: 'Créer un nouveau bâtiment' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateBuildingDto })
  @ApiOkResponse({ description: 'Bâtiment créé avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'documents', maxCount: 4 }]))
  async createBuilding(
    @MultipartJson('data', CreateBuildingDto) data: CreateBuildingDto,
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
    return this.buildingService.createBuilding(
      { ...data, documents: cloudinaryDocumentsFilesUrl },
      userId,
    );
  }

  @Post(API_URL.BUILDING.UPDATE)
  @RequirePermission('manage_batiment')
  @ApiOperation({ summary: 'Mettre à jour un bâtiment existant' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateBuildingDto })
  @ApiOkResponse({ description: 'Bâtiment mis à jour avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'documents', maxCount: 4 }]))
  async updateBuilding(
    @MultipartJson('data', UpdateBuildingDto) data: UpdateBuildingDto,
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

    return this.buildingService.updateBuilding(
      { ...data, documents: cloudinaryDocumentsFilesUrl },
      userId,
    );
  }

  @Delete(API_URL.BUILDING.DELETE)
  @RequirePermission('manage_batiment')
  @ApiOperation({ summary: 'Supprimer un bâtiment' })
  @ApiQuery({ name: 'id', required: true, description: 'Identifiant du bâtiment à supprimer' })
  @ApiOkResponse({ description: 'Bâtiment supprimé avec succès' })
  @ApiBadRequestResponse({ description: 'Bâtiment introuvable ou erreur serveur' })
  async deleteBuilding(@Query('id') id: string, @AgencyProfileId() userId: string) {
    return this.buildingService.deleteBuilding(id, userId);
  }

  @Get(API_URL.BUILDING.IMPACT)
  @RequirePermission('manage_batiment')
  @ApiOperation({ summary: 'Biens et historique supprimés avec le bâtiment, avant confirmation' })
  @ApiQuery({ name: 'id', required: true, description: 'Identifiant du bâtiment' })
  async getBuildingImpact(@Query('id') id: string, @AgencyProfileId() userId: string) {
    return this.buildingService.getBuildingImpact(id, userId);
  }
}
