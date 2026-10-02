import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { API_URL } from '../../config/api';
import { AgencyProfileId } from '../../guard/current-user.decorator';
import {
  CreateInvoiceTemplateDto,
  InvoiceSettingsDto,
  PreviewInvoiceTemplateDto,
  UpdateInvoiceTemplateDto,
} from './invoice-templates.dto';
import { InvoiceTemplatesService } from './invoice-templates.service';

/** Modèles de facture de l'agence et réglages de facturation. */
@ApiTags('Invoicing')
@Controller()
@ApiBearerAuth()
@ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
export class InvoiceTemplatesController {
  constructor(private readonly templates: InvoiceTemplatesService) {}

  @Get(API_URL.INVOICING.TEMPLATES)
  @ApiOperation({ summary: 'Modèles communs et modèles de l’agence, avec les réglages' })
  @ApiOkResponse({
    description: '{ templates, settings: { vatRate, invoicePrefix, defaultTemplateId } }',
  })
  list(@Query('agencyId') agencyId: string, @AgencyProfileId() userId: string) {
    return this.templates.list(agencyId, userId);
  }

  @Get(API_URL.INVOICING.TEMPLATE_VARIABLES)
  @ApiOperation({ summary: 'Catalogue des variables insérables dans les textes d’un modèle' })
  variables() {
    return this.templates.variables();
  }

  @Post(API_URL.INVOICING.TEMPLATES)
  @ApiOperation({ summary: 'Ajouter un modèle (propriétaire)' })
  @ApiForbiddenResponse({ description: 'OWNER_ONLY' })
  @ApiUnprocessableEntityResponse({ description: 'UNKNOWN_VARIABLES' })
  create(
    @Query('agencyId') agencyId: string,
    @AgencyProfileId() userId: string,
    @Body() data: CreateInvoiceTemplateDto,
  ) {
    return this.templates.create(agencyId, userId, data);
  }

  @Patch(API_URL.INVOICING.TEMPLATES)
  @ApiOperation({
    summary: 'Modifier un modèle (propriétaire)',
    description:
      'Un modèle commun n’est jamais modifié : une copie propre à l’agence est créée et renvoyée.',
  })
  @ApiQuery({ name: 'id', required: true, description: 'Identifiant du modèle' })
  @ApiNotFoundResponse({ description: 'TEMPLATE_NOT_FOUND' })
  update(
    @Query('agencyId') agencyId: string,
    @Query('id') id: string,
    @AgencyProfileId() userId: string,
    @Body() data: UpdateInvoiceTemplateDto,
  ) {
    return this.templates.update(agencyId, userId, id, data);
  }

  @Delete(API_URL.INVOICING.TEMPLATES)
  @ApiOperation({ summary: 'Supprimer un modèle de l’agence (propriétaire)' })
  @ApiQuery({ name: 'id', required: true, description: 'Identifiant du modèle' })
  @ApiConflictResponse({ description: 'DEFAULT_TEMPLATE_LOCKED : modèle commun' })
  remove(
    @Query('agencyId') agencyId: string,
    @Query('id') id: string,
    @AgencyProfileId() userId: string,
  ) {
    return this.templates.remove(agencyId, userId, id);
  }

  @Patch(API_URL.INVOICING.SETTINGS)
  @ApiOperation({
    summary: 'Réglages de facturation : TVA, préfixe, modèle par défaut (propriétaire)',
  })
  updateSettings(
    @Query('agencyId') agencyId: string,
    @AgencyProfileId() userId: string,
    @Body() data: InvoiceSettingsDto,
  ) {
    return this.templates.updateSettings(agencyId, userId, data);
  }

  @Post(API_URL.INVOICING.TEMPLATE_PREVIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aperçu PDF d’une configuration, avec des données d’exemple' })
  @ApiOkResponse({ description: 'application/pdf' })
  async preview(
    @Query('agencyId') agencyId: string,
    @AgencyProfileId() userId: string,
    @Body() data: PreviewInvoiceTemplateDto,
  ) {
    const pdf = await this.templates.preview(agencyId, userId, data.config);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: 'inline; filename="apercu-facture.pdf"',
    });
  }

  @Post(API_URL.INVOICING.STAMP)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Téléverser le cachet ou la signature de l’agence (propriétaire)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { stamp: { type: 'string', format: 'binary', description: 'PNG ou JPEG, 1 Mo' } },
      required: ['stamp'],
    },
  })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_STAMP_IMAGE' })
  @UseInterceptors(
    FileInterceptor('stamp', {
      limits: { fileSize: 1024 * 1024, files: 1, fields: 0 },
      fileFilter: (_req, file, callback) =>
        callback(null, /^image\/(png|jpeg)$/.test(file.mimetype)),
    }),
  )
  uploadStamp(
    @Query('agencyId') agencyId: string,
    @AgencyProfileId() userId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.templates.uploadStamp(agencyId, userId, file);
  }

  @Delete(API_URL.INVOICING.STAMP)
  @ApiOperation({ summary: 'Retirer le cachet de l’agence (propriétaire)' })
  removeStamp(@Query('agencyId') agencyId: string, @AgencyProfileId() userId: string) {
    return this.templates.removeStamp(agencyId, userId);
  }
}
