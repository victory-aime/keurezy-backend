import { Module } from '@nestjs/common';
import { AgencyController } from './agency.controller';
import { AgencyService } from './agency.service';
import { AgencyAdminService } from './agency-admin.service';
import { AdminAgencyController } from './admin-agency.controller';
import { DatabaseModule } from '../../database/database.module';
import { UsersModule } from '../users/users.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [UsersModule, DatabaseModule, CloudinaryModule, PaymentsModule],
  controllers: [AgencyController, AdminAgencyController],
  providers: [AgencyService, AgencyAdminService],
  exports: [AgencyService],
})
export class AgencyModule {}
