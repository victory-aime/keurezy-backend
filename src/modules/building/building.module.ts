import { Module } from '@nestjs/common';
import { CloudinaryModule } from '_root/modules/cloudinary/cloudinary.module';
import { AgencyModule } from '_root/modules/agency/agency.module';
import { BuildingService } from '_root/modules/building/building.service';
import { BuildingController } from '_root/modules/building/building.controller';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CloudinaryModule, AgencyModule, CommonModule],
  providers: [BuildingService],
  controllers: [BuildingController],
})
export class BuildingModule {}
