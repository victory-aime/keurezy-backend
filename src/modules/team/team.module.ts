import { Module } from '@nestjs/common';
import { AgencyModule } from '../agency/agency.module';
import { TeamService } from './team.service';
import { TeamController } from './team.controller';

@Module({
  imports: [AgencyModule],
  providers: [TeamService],
  controllers: [TeamController],
})
export class TeamModule {}
