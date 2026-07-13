import { Module } from '@nestjs/common';
import { DatabaseModule } from '_root/database/database.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { AgencyModule } from '../agency/agency.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatModule } from '_root/modules/chat/chat.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [DatabaseModule, AgencyModule, NotificationsModule, ChatModule, CommonModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
