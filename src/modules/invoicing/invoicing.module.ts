import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AgencyModule } from '../agency/agency.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { PackModule } from '../packs/pack.module';
import { InvoiceTemplatesController } from './invoice-templates.controller';
import { InvoiceTemplatesService } from './invoice-templates.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

/**
 * Facturation de l'agence à ses clients : modèles personnalisables (I1), puis factures (I2),
 * quotas (I3) et envoi (I4). Spec : keurezy-front/docs/agency-invoicing.
 */
@Module({
  imports: [DatabaseModule, AgencyModule, CloudinaryModule, PackModule],
  controllers: [InvoiceTemplatesController, InvoicesController],
  providers: [InvoiceTemplatesService, InvoicesService],
})
export class InvoicingModule {}
