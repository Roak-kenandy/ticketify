import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class BillingDecisionDto {
  @IsBoolean()
  chargeable: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
