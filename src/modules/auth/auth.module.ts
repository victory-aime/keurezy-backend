import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { EmailModule } from '../mail/mail.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AccountRecoveryService } from './account-recovery.service';

@Module({
  imports: [UsersModule, EmailModule],
  providers: [AuthService, AccountRecoveryService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
