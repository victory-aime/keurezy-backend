import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { PropertyController } from './property.controller';
import { PropertyService } from './property.service';
import { AgencyModule } from '../agency/agency.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [DatabaseModule, CloudinaryModule, AgencyModule, CommonModule],
  controllers: [PropertyController],
  providers: [PropertyService],
})
export class PropertyModule {}
