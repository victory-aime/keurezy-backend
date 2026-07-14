import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { AgencyModule } from '../agency/agency.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../../database/database.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [DatabaseModule, AgencyModule, NotificationsModule, ChatModule, CommonModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
