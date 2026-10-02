import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class LmHandoffDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  description: string;

  @IsUUID()
  address_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string;

  /** ISO date (visit day). Defaults to today (all-day activity date in CRM). */
  @IsOptional()
  @IsDateString()
  activity_date?: string;

  /** Working days quoted to the customer. Defaults to 7. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  resolution_days?: number;

  /** SMS the customer about the handoff. Defaults to true. */
  @IsOptional()
  @IsBoolean()
  notify_customer?: boolean;
}
