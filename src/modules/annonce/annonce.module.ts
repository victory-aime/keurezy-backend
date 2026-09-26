import { Module } from '@nestjs/common';
import { AnnounceService } from './annonce.service';
import { AnnonceController } from './annonce.controller';
import { PackModule } from '../packs/pack.module';
import { DatabaseModule } from '../../database/database.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { AgencyModule } from '../agency/agency.module';
import { RentalsModule } from '../rentals/rentals.module';

@Module({
  imports: [DatabaseModule, CloudinaryModule, AgencyModule, PackModule, RentalsModule],
  controllers: [AnnonceController],
  providers: [AnnounceService],
})
export class AnnounceModule {}
