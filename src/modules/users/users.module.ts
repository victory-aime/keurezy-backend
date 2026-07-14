import { UsersService } from './users.service';
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { DatabaseModule } from '../../database/database.module';
import { UsersAdminService } from './users-admin.service';
import { AdminUsersController } from './admin-users.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService, UsersAdminService],
  exports: [UsersService],
})
export class UsersModule {}
