import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ChargeLineDto {
  @IsString()
  @MaxLength(64)
  code: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  quantity: number;
}

export class ChargePreviewDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChargeLineDto)
  items: ChargeLineDto[];
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
