import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { AgencyModule } from '../agency/agency.module';
import { LandController } from './land.controller';
import { LandService } from './land.service';

@Module({
  imports: [CloudinaryModule, AgencyModule, CommonModule],
  controllers: [LandController],
  providers: [LandService],
})
export class LandModule {}
