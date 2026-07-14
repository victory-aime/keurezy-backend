import { EmailService } from './mail.service';
import { Module } from '@nestjs/common';
import { AuthMailInitializer } from './mail.initializer';
import { ResendService } from './resend.service';

@Module({
  providers: [EmailService, AuthMailInitializer, ResendService],
  exports: [EmailService],
})
export class EmailModule {}
