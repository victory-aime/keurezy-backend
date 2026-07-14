import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { AgencyModule } from '../agency/agency.module';
import { BuildingService } from './building.service';
import { BuildingController } from './building.controller';

@Module({
  imports: [CloudinaryModule, AgencyModule, CommonModule],
  providers: [BuildingService],
  controllers: [BuildingController],
})
export class BuildingModule {}
