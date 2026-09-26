import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { initAuthInstance } from './auth';
import { DatabaseModule } from '../database/database.module';
import { PrismaService } from '../database/prisma.service';

@Module({
  imports: [
    AuthModule.forRootAsync({
      imports: [DatabaseModule],
      inject: [PrismaService],
      // Une seule instance Better Auth, adossée au pool Prisma de l'application
      useFactory: (prisma: PrismaService) => ({
        auth: initAuthInstance(prisma),
      }),
    }),
  ],
  exports: [AuthModule],
})
export class BetterAuthModule {}
