import { Module } from '@nestjs/common';
import { InvitationService } from './invitation.service';
import { InvitationController } from './invitation.controller';
import { AgencyModule } from '../agency/agency.module';
import { CommonModule } from '../common/common.module';
import { ResendService } from '../mail/resend.service';

@Module({
  imports: [AgencyModule, CommonModule],
  providers: [InvitationService, ResendService],
  controllers: [InvitationController],
  exports: [InvitationService],
})
export class InvitationModule {}
