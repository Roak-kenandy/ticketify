import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateInvoiceDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  charge_codes: string[];

  @IsOptional()
  @IsBoolean()
  issue?: boolean;
}
