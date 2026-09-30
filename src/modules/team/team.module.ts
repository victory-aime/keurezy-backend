import { Module } from '@nestjs/common';
import { AgencyModule } from '../agency/agency.module';
import { PackModule } from '../packs/pack.module';
import { TeamService } from './team.service';
import { TeamController } from './team.controller';
import { EmailModule } from '../mail/mail.module';

@Module({
  imports: [AgencyModule, PackModule, EmailModule],
  providers: [TeamService],
  controllers: [TeamController],
})
export class TeamModule {}
