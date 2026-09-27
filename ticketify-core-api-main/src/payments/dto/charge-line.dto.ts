import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class ChargeLineDto {
  @IsString()
  code: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateTicketPaymentDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChargeLineDto)
  items?: ChargeLineDto[];

  /** @deprecated use items */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  charge_codes?: string[];

  @IsOptional()
  @IsString()
  invoice_id?: string;

  @IsOptional()
  @IsString()
  customer_reference?: string;

  @IsOptional()
  @IsString()
  payment_phone?: string;

  @IsOptional()
  phone_override_confirmed?: boolean;

  /** Resend SMS for existing pending payment (same invoice/link) */
  @IsOptional()
  resend_sms?: boolean;
}
