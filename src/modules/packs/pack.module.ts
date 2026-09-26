import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AgencyModule } from '../agency/agency.module';
import { PackAdminService } from './pack-admin.service';
import { AdminPackController } from './admin-pack.controller';
import { PackController } from './pack.controller';
import { PackService } from './pack.service';
import { AdminFeaturesController } from './admin-features.controller';
import { FeaturesAdminService } from './features-admin.service';
import { PlanFeaturePolicyService } from './plan-feature-policy.service';
import { PermissionsService } from './permissions.service';

/**
 * Plans et abonnements : catalogue des plans, fonctionnalités commerciales,
 * politiques de quota et permissions assignables selon le plan.
 */
@Module({
  imports: [DatabaseModule, AgencyModule],
  controllers: [PackController, AdminPackController, AdminFeaturesController],
  providers: [
    PackService,
    PackAdminService,
    FeaturesAdminService,
    PlanFeaturePolicyService,
    PermissionsService,
  ],
  exports: [PlanFeaturePolicyService, PermissionsService],
})
export class PackModule {}
