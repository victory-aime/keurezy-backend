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
import { LandService } from '_root/modules/land/land.service';
import { IPaginationDto } from '_root/config/pagination.dto';
import { CreateLandDto, LandFilterDto, UpdateLandDto } from '_root/modules/land/land.dto';
import { AgencyService } from '_root/modules/agency/agency.service';
import { UploadsService } from '_root/modules/cloudinary/uploads.service';
import { CLOUDINARY_FOLDER_NAME } from '_root/config/enum';
import { convertToInteger } from '_root/config/convert';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { API_URL } from '_root/config/api';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

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
  @ApiOperation({ summary: "Récupérer tous les terrains d'une agence" })
  @ApiOkResponse({ description: 'Liste des terrains récupérée avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async getAllLands(@Query() data: LandFilterDto) {
    return this.landService.getAllLandByAgency(data);
  }

  @Post(API_URL.LAND.CREATE_LAND)
  @ApiOperation({ summary: 'Créer un nouveau terrain' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateLandDto })
  @ApiOkResponse({ description: 'Terrain créé avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'documents', maxCount: 4 }]))
  async createLand(
    @Body('data') rawData: string,
    @UploadedFiles()
    files: {
      documents?: Express.Multer.File[];
    },
  ) {
    const data: CreateLandDto = JSON.parse(rawData);

    let cloudinaryDocumentsFilesUrl: string[] = [];
    const getAgencyName = await this.agencyService.findAgency(data?.agencyId, data.userId);
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
    return this.landService.createLand({
      ...data,
      area: convertToInteger(data?.area),
      purchasePrice: convertToInteger(data?.purchasePrice),
      documents: cloudinaryDocumentsFilesUrl,
    });
  }

  @Post(API_URL.LAND.UPDATE)
  @ApiOperation({ summary: 'Mettre à jour un terrain existant' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateLandDto })
  @ApiOkResponse({ description: 'Terrain mis à jour avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'documents', maxCount: 4 }]))
  async updateLand(
    @Body('data') rawData: string,
    @UploadedFiles()
    files: {
      documents?: Express.Multer.File[];
    },
  ) {
    const data: UpdateLandDto = JSON.parse(rawData);

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
    return this.landService.updateLand({
      ...data,
      area: convertToInteger(data?.area),
      purchasePrice: convertToInteger(data?.purchasePrice),
      documents: cloudinaryDocumentsFilesUrl,
    });
  }

  @Delete(API_URL.LAND.DELETE)
  @ApiOperation({ summary: 'Supprimer un terrain (non implémenté)' })
  @ApiOkResponse({ description: 'Delete land not implemented' })
  async deleteLand() {
    return 'Delete land not implemented';
  }
}