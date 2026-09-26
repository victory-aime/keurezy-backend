import { Module } from '@nestjs/common';
import { InvitationService } from './invitation.service';
import { InvitationController } from './invitation.controller';
import { AgencyModule } from '../agency/agency.module';
import { PackModule } from '../packs/pack.module';
import { ResendService } from '../mail/resend.service';

@Module({
  imports: [AgencyModule, PackModule],
  providers: [InvitationService, ResendService],
  controllers: [InvitationController],
  exports: [InvitationService],
})
export class InvitationModule {}
