import { Module } from '@nestjs/common';
import { PackModule } from '../packs/pack.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { AgencyModule } from '../agency/agency.module';
import { LandController } from './land.controller';
import { LandService } from './land.service';

@Module({
  imports: [CloudinaryModule, AgencyModule, PackModule],
  controllers: [LandController],
  providers: [LandService],
})
export class LandModule {}
