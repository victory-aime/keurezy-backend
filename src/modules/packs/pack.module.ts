import { Module } from '@nestjs/common';
import { DatabaseModule } from '_root/database/database.module';
import { PackAdminService } from './pack-admin.service';
import { AdminPackController } from './admin-pack.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [AdminPackController],
  providers: [PackAdminService],
  exports: [],
})
export class PackModule {}
