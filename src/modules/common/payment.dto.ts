import { IsString, IsOptional, IsEnum } from 'class-validator';
import { BillingCycle } from '../../../prisma/generated/enums';
import { createAgencyOwnerDto } from '../agency/agency.dto';

class PlanSelectionDto {
  @IsString()
  planId: string;

  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;
}

export class InitiateAgencyPaymentDto extends createAgencyOwnerDto {}
