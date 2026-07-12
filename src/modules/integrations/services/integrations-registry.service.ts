import { Injectable, BadRequestException } from '@nestjs/common';
import { GoogleDriveStrategy } from '../providers/google-drive.strategy';
import { DropboxStrategy } from '../providers/dropbox.strategy';
import { CloudProviderStrategy } from '../interfaces/cloud-provider-strategy.interface';
import { IntegrationProviderType } from '../../../../prisma/generated/enums';

@Injectable()
export class IntegrationsRegistry {
  private strategies: Map<IntegrationProviderType, CloudProviderStrategy>;

  constructor(googleDrive: GoogleDriveStrategy, dropbox: DropboxStrategy) {
    this.strategies = new Map([
      [IntegrationProviderType.GOOGLE_DRIVE, googleDrive],
      //[IntegrationProviderType.DROPBOX, dropbox],
    ]);
  }

  get(provider: IntegrationProviderType): CloudProviderStrategy {
    const strategy = this.strategies.get(provider);
    if (!strategy) {
      throw new BadRequestException(`Provider "${provider}" non supporté`);
    }
    return strategy;
  }
}
