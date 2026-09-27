import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
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
}
