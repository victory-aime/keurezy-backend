import { Module } from '@nestjs/common';
import { AnnounceService } from './annonce.service';
import { AnnonceController } from './annonce.controller';
import { DatabaseModule } from '_root/database/database.module';
import { CloudinaryModule } from '_root/modules/cloudinary/cloudinary.module';
import { AgencyModule } from '_root/modules/agency/agency.module';

@Module({
  imports: [DatabaseModule, CloudinaryModule, AgencyModule],
  controllers: [AnnonceController],
  providers: [AnnounceService],
})
export class AnnounceModule {}
