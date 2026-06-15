import { Module } from '@nestjs/common';
import { UsersModule } from '_root/modules/users/users.module';
import { DatabaseModule } from '_root/database/database.module';
import { AgencyController } from './agency.controller';
import { AgencyService } from './agency.service';
import { CloudinaryModule } from '_root/modules/cloudinary/cloudinary.module';
import { CommonModule } from '_root/modules/common/common.module';
import { AgencyAdminService } from './agency-admin.service';
import { AdminAgencyController } from './admin-agency.controller';

@Module({
  imports: [UsersModule, DatabaseModule, CloudinaryModule, CommonModule],
  controllers: [AgencyController, AdminAgencyController],
  providers: [AgencyService, AgencyAdminService],
  exports: [AgencyService],
})
export class AgencyModule {}
