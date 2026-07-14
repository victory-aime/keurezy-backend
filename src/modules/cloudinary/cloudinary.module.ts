import { Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';
import { ConfigModule } from '@nestjs/config';
import { UploadsService } from './uploads.service';
import { UploadRecoveryCron } from './upload.recovery.service';

@Module({
  imports: [ConfigModule],
  providers: [CloudinaryService, UploadsService, UploadRecoveryCron],
  exports: [CloudinaryService, UploadsService, UploadRecoveryCron],
})
export class CloudinaryModule {}
