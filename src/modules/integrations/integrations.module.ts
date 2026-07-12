import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IntegrationsController } from './integrations-provider.controller';
import { IntegrationsService } from './services/integrations.service';
import { IntegrationsRegistry } from './services/integrations-registry.service';
import { EncryptionService } from './services/encryption.service';
import { OAuthStateService } from './services/oauth-state.service';
import { GoogleDriveStrategy } from './providers/google-drive.strategy';
import { DropboxStrategy } from './providers/dropbox.strategy';

@Module({
  imports: [JwtModule.register({})],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    IntegrationsRegistry,
    EncryptionService,
    OAuthStateService,
    GoogleDriveStrategy,
    DropboxStrategy,
  ],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
