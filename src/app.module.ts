import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as winston from 'winston';
import { utilities as nestWinstonModuleUtilities, WinstonModule } from 'nest-winston';
import { UsersModule } from './modules/users/users.module';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import { APP_GUARD } from '@nestjs/core';
import { AgencyModule } from '_root/modules/agency/agency.module';
import { PropertyModule } from '_root/modules/property/property.module';
import { BetterAuthModule } from '_root/lib/auth.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PackModule } from '_root/modules/packs/pack.module';
import { AuthModule } from '_root/modules/auth/auth.module';
import { BuildingModule } from '_root/modules/building/building.module';
import { LandModule } from '_root/modules/land/land.module';
import { CommonModule } from '_root/modules/common/common.module';
import { InvitationModule } from '_root/modules/invitations/invitation.module';
import { AnnounceModule } from '_root/modules/annonce/annonce.module';
import { TeamModule } from '_root/modules/team/team.module';
import { LeadsModule } from '_root/modules/leads/leads.module';
import { VisitsModule } from '_root/modules/visits/visits.module';
import { StatsModule } from '_root/modules/stats/stats.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { BullModule } from '@nestjs/bullmq';
import { ChatModule } from '_root/modules/chat/chat.module';
import { PushSubscriptionModule } from '_root/modules/push-subscription/push-subscription.module';

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
    StatsModule,
    NotificationsModule,
    // Redis partagé pour BullMQ (le même que PresenceService utilise)
    // BullModule.forRootAsync({
    //   inject: [ConfigService],
    //   useFactory: (config: ConfigService) => ({
    //     connection: { url: config.getOrThrow('REDIS_URL') },
    //     defaultJobOptions: {
    //       removeOnComplete: 100,
    //       removeOnFail: 500,
    //     },
    //   }),
    // }),
    //ChatModule,
    //PushSubscriptionModule,
  ],

  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}