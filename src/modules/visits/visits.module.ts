import { Module } from '@nestjs/common';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';
import { DatabaseModule } from '_root/database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgencyModule } from '_root/modules/agency/agency.module';
import { VisiteJobService } from '_root/modules/visits/visite-job.service';

@Module({
  imports: [DatabaseModule, NotificationsModule, AgencyModule],
  controllers: [VisitsController],
  providers: [VisitsService, VisiteJobService],
  exports: [VisitsService],
})
export class VisitsModule {}
