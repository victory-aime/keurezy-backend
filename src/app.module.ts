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
import { ThrottlerModule } from '@nestjs/throttler';
import { SessionThrottlerGuard } from './guard/throttler.guard';
import { ActiveSubscriptionGuard } from './guard/active-subscription.guard';
import { THROTTLE } from './config/throttle';
import { PermissionGuard } from './guard/permission.guard';
import { PackModule } from './modules/packs/pack.module';
import { AuthModule } from './modules/auth/auth.module';
import { BuildingModule } from './modules/building/building.module';
import { LandModule } from './modules/land/land.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { InvitationModule } from './modules/invitations/invitation.module';
import { AnnounceModule } from './modules/annonce/annonce.module';
import { TeamModule } from './modules/team/team.module';
import { VisitsModule } from './modules/visits/visits.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ChatModule } from './modules/chat/chat.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { DomainEventsModule } from './modules/events/domain-events';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { InvoicingModule } from './modules/invoicing/invoicing.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DomainEventsModule,
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
    // Par utilisateur ou par IP : rafale courte et volume soutenu (voir config/throttle.ts)
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'burst', ...THROTTLE.burst },
        { name: 'sustained', ...THROTTLE.sustained },
      ],
      errorMessage: 'Trop de requêtes, réessayez dans un instant.',
    }),
    BetterAuthModule,
    AuthModule,
    UsersModule,
    AgencyModule,
    PropertyModule,
    BuildingModule,
    PackModule,
    LandModule,
    PaymentsModule,
    AnnounceModule,
    BookingsModule,
    InvitationModule,
    TeamModule,
    VisitsModule,
    NotificationsModule,
    ChatModule,
    IntegrationsModule,
    PreferencesModule,
    InvoicingModule,
  ],

  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    // Après l'authentification : applique les @RequirePermission des routes agence
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: SessionThrottlerGuard },
    // Abonnement expiré : écritures des utilisateurs d'agence refusées, sauf @AllowWhenInactive
    { provide: APP_GUARD, useClass: ActiveSubscriptionGuard },
  ],
})
export class AppModule {}
