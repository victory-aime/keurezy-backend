import { PackService } from '_root/modules/packs/pack.service';
import { PackController } from '_root/modules/packs/pack.controller';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '_root/database/database.module';
import { PackAdminService } from './pack-admin.service';
import { AdminPackController } from './admin-pack.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [PackController, AdminPackController],
  providers: [PackService, PackAdminService],
  exports: [PackService],
})
export class PackModule {}
