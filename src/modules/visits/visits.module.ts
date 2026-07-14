import { Module } from '@nestjs/common';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';
import { DatabaseModule } from '../../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgencyModule } from '../agency/agency.module';
import { VisiteJobService } from './visite-job.service';

@Module({
  imports: [DatabaseModule, NotificationsModule, AgencyModule],
  controllers: [VisitsController],
  providers: [VisitsService, VisiteJobService],
  exports: [VisitsService],
})
export class VisitsModule {}
