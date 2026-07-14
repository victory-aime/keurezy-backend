import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseInterceptors,
  UploadedFile,
  ParseEnumPipe,
  UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Session } from '@thallesp/nestjs-better-auth';
import { IntegrationsService } from './services/integrations.service';
import { IntegrationProviderType } from '../../../prisma/generated/enums';
import { API_URL } from '../../config/api';

@Controller()
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get(API_URL.PROVIDERS.CONNECT)
  getConnectUrl(
    @Query('provider', new ParseEnumPipe(IntegrationProviderType))
    provider: IntegrationProviderType,
    @Session() session: { user: { id: string } },
  ) {
    const url = this.integrationsService.getConnectUrl(session.user.id, provider);
    return { url };
  }

  /**
   * Callback OAuth — PAS de guard ici : l'utilisateur arrive depuis Google/Dropbox,
   * sans JWT applicatif. La sécurité vient du `state` signé (JWT court, 5min, anti-CSRF).
   */
  @Get(API_URL.PROVIDERS.CALLBACK)
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const { frontRedirectUrl } = await this.integrationsService.handleCallback(code, state);
    return res.redirect(frontRedirectUrl);
  }

  @Get(API_URL.PROVIDERS.STATUS)
  getStatus(
    @Query('provider', new ParseEnumPipe(IntegrationProviderType))
    provider: IntegrationProviderType,
    @Session() session: { user: { id: string } },
  ) {
    return this.integrationsService.getStatus(session.user.id, provider);
  }

  @Post(API_URL.PROVIDERS.DISCONNECT)
  disconnect(
    @Query('provider', new ParseEnumPipe(IntegrationProviderType))
    provider: IntegrationProviderType,
    @Session() session: { user: { id: string } },
  ) {
    return this.integrationsService.disconnect(session.user.id, provider);
  }

  @Post(API_URL.PROVIDERS.UPLOAD_FILES)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'file', maxCount: 5 }]))
  async uploadFile(
    @Query('provider', new ParseEnumPipe(IntegrationProviderType))
    provider: IntegrationProviderType,
    @UploadedFiles() files: { file?: Express.Multer.File[] },
    @Session() session: { user: { id: string } },
  ) {
    if (files?.file?.length) {
      await Promise.all(
        files.file.map((data) =>
          this.integrationsService.uploadFile(session.user.id, provider, data),
        ),
      );
    }
  }

  @Get(API_URL.PROVIDERS.FILES_LIST)
  listFiles(
    @Query('provider', new ParseEnumPipe(IntegrationProviderType))
    provider: IntegrationProviderType,
    @UploadedFile() file: Express.Multer.File,
    @Session() session: { user: { id: string } },
  ) {
    return this.integrationsService.listFiles(session.user.id, provider);
  }

  @Get(API_URL.PROVIDERS.TRASHED_FILES_LIST)
  listTrashedFiles(
    @Query('provider', new ParseEnumPipe(IntegrationProviderType))
    provider: IntegrationProviderType,
    @Session() session: { user: { id: string } },
  ) {
    return this.integrationsService.listTrashedFiles(session.user.id, provider);
  }

  @Post(API_URL.PROVIDERS.TRASHED_FILE)
  trashedFiles(
    @Query('provider', new ParseEnumPipe(IntegrationProviderType))
    provider: IntegrationProviderType,
    @Query('fileId') fileId: string,
    @Session() session: { user: { id: string } },
  ) {
    return this.integrationsService.trashFile(session.user.id, provider, fileId);
  }

  @Post(API_URL.PROVIDERS.DELETE_FILE)
  deleteFiles(
    @Query('provider', new ParseEnumPipe(IntegrationProviderType))
    provider: IntegrationProviderType,
    @Query('fileId') fileId: string,
    @Session() session: { user: { id: string } },
  ) {
    return this.integrationsService.deleteFilePermanently(session.user.id, provider, fileId);
  }
}
