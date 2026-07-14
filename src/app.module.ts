import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as winston from 'winston';
import { utilities as nestWinstonModuleUtilities, WinstonModule } from 'nest-winston';
import { UsersModule } from './modules/users/users.module';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import { APP_GUARD } from '@nestjs/core';
import { AgencyModule } from './modules/agency/agency.module';
import { PropertyModule } from './modules/property/property.module';
import { BetterAuthModule } from './lib/auth.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PackModule } from './modules/packs/pack.module';
import { AuthModule } from './modules/auth/auth.module';
import { BuildingModule } from './modules/building/building.module';
import { LandModule } from './modules/land/land.module';
import { CommonModule } from './modules/common/common.module';
import { InvitationModule } from './modules/invitations/invitation.module';
import { AnnounceModule } from './modules/annonce/annonce.module';
import { TeamModule } from './modules/team/team.module';
import { LeadsModule } from './modules/leads/leads.module';
import { VisitsModule } from './modules/visits/visits.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ChatModule } from './modules/chat/chat.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    WinstonModule.forRoot({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.ms(),
            nestWinstonModuleUtilities.format.nestLike(process.env.APP_NAME, {
              colors: true,
              prettyPrint: true,
              processId: true,
              appName: true,
            }),
          ),
        }),
      ],
    }),
    ConfigModule.forRoot({
      envFilePath: [`.env.${process.env.NODE_ENV}`],
      isGlobal: true,
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 10,
          limit: 100,
        },
      ],
    }),
    BetterAuthModule,
    AuthModule,
    UsersModule,
    AgencyModule,
    PropertyModule,
    BuildingModule,
    PackModule,
    LandModule,
    CommonModule,
    AnnounceModule,
    InvitationModule,
    TeamModule,
    LeadsModule,
    VisitsModule,
    NotificationsModule,
    ChatModule,
    IntegrationsModule,
  ],

  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
