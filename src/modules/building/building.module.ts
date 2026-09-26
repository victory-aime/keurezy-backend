import { Module } from '@nestjs/common';
import { PackModule } from '../packs/pack.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { AgencyModule } from '../agency/agency.module';
import { BuildingService } from './building.service';
import { BuildingController } from './building.controller';

@Module({
  imports: [CloudinaryModule, AgencyModule, PackModule],
  providers: [BuildingService],
  controllers: [BuildingController],
})
export class BuildingModule {}
