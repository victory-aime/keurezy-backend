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
import { BuildingService } from '_root/modules/building/building.service';
import {
  BuildingFilterDto,
  CreateBuildingDto,
  UpdateBuildingDto,
} from '_root/modules/building/building.dto';
import { API_URL } from '_root/config/api';
import { CLOUDINARY_FOLDER_NAME } from '_root/config/enum';
import { AgencyService } from '_root/modules/agency/agency.service';
import { UploadsService } from '_root/modules/cloudinary/uploads.service';
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
  @ApiOperation({ summary: "Récupérer tous les bâtiments d'une agence" })
  @ApiOkResponse({ description: 'Liste des bâtiments récupérée avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async getBuildingByAgency(@Query() data: BuildingFilterDto) {
    console.log('data', data);
    return this.buildingService.getAllBuildingByAgency(data);
  }

  @Post(API_URL.BUILDING.CREATE_BUILDING)
  @ApiOperation({ summary: 'Créer un nouveau bâtiment' })
  @ApiQuery({ name: 'ownerId', required: true, description: 'Identifiant du propriétaire' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateBuildingDto })
  @ApiOkResponse({ description: 'Bâtiment créé avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'documents', maxCount: 4 }]))
  async createBuilding(
    @Body('data') rawData: string,
    @UploadedFiles()
    files: {
      documents?: Express.Multer.File[];
    },
  ) {
    const data: CreateBuildingDto = JSON.parse(rawData);
    let cloudinaryDocumentsFilesUrl: string[] = [];
    const getAgencyName = await this.agencyService.findAgency(data?.agencyId, data?.userId);
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
    return this.buildingService.createBuilding({
      ...data,
      documents: cloudinaryDocumentsFilesUrl,
    });
  }

  @Post(API_URL.BUILDING.UPDATE)
  @ApiOperation({ summary: 'Mettre à jour un bâtiment existant' })
  @ApiQuery({ name: 'ownerId', required: true, description: 'Identifiant du propriétaire' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateBuildingDto })
  @ApiOkResponse({ description: 'Bâtiment mis à jour avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'documents', maxCount: 4 }]))
  async updateBuilding(
    @Body('data') rawData: string,
    @Query('ownerId') ownerId: string,
    @UploadedFiles()
    files: {
      documents?: Express.Multer.File[];
    },
  ) {
    const data: UpdateBuildingDto = JSON.parse(rawData);

    let cloudinaryDocumentsFilesUrl: string[] = [];
    const getAgencyName = await this.agencyService.findAgency(data?.agencyId, data?.userId);
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

    return this.buildingService.updateBuilding({ ...data, documents: cloudinaryDocumentsFilesUrl });
  }

  @Delete(API_URL.BUILDING.DELETE)
  @ApiOperation({ summary: 'Supprimer un bâtiment' })
  @ApiQuery({ name: 'ownerId', required: true, description: 'Identifiant du propriétaire' })
  @ApiQuery({ name: 'id', required: true, description: 'Identifiant du bâtiment à supprimer' })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: 'Bâtiment supprimé avec succès' })
  @ApiBadRequestResponse({ description: 'Bâtiment introuvable ou erreur serveur' })
  async deleteBuilding(
    @Query('userId') userId: string,
    @Query('id') id: string,
    @Query('agencyId') agencyId: string,
  ) {
    return this.buildingService.deleteBuilding(id, agencyId, userId);
  }
}
