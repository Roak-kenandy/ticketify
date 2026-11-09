import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { StockReturnCondition } from '@prisma/client';

export const STOCK_UNITS = ['STOCK', 'CONSUMPTION'] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];

export class StockLineDto {
  @IsString()
  @MaxLength(40)
  item_id: string;

  /** Bulk items only; serialized items count one unit per serial. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100000)
  quantity?: number;

  /** STOCK = the item's stock UOM (e.g. rolls), converted to its consumption UOM. */
  @IsOptional()
  @IsIn(STOCK_UNITS)
  unit?: StockUnit;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  serial_numbers?: string[];
}

export class StockReturnLineDto extends StockLineDto {
  @IsEnum(StockReturnCondition)
  condition: StockReturnCondition;
}

class StockSlipDto {
  @IsString()
  @MaxLength(40)
  technician_user_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** Client-generated per slip so a retried request records nothing twice. */
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,80}$/)
  idempotency_key: string;
}

export class StockIssueDto extends StockSlipDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => StockLineDto)
  lines: StockLineDto[];

  /** The supervisor's stock request this slip fulfils. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  request_id?: string;
}

/** Supervisor → technician, and technician → supervisor (unused, good items). */
export class StockHandoverDto extends StockSlipDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => StockLineDto)
  lines: StockLineDto[];
}

export class StockRequestLineDto {
  @IsString()
  @MaxLength(40)
  item_id: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100000)
  quantity: number;
}

export class StockRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => StockRequestLineDto)
  lines: StockRequestLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class StockReturnDto extends StockSlipDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => StockReturnLineDto)
  lines: StockReturnLineDto[];
}
