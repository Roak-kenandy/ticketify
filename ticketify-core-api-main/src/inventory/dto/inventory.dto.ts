import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { InventoryDeclarationType } from '@prisma/client';

export class InventoryLineDto {
  @IsString()
  item_id: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100000)
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  serial_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;

  @IsOptional()
  @IsString()
  provisioning_transaction_id?: string;
}

export class InventoryDeclarationDto {
  @IsEnum(InventoryDeclarationType)
  declaration: InventoryDeclarationType;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InventoryLineDto)
  lines?: InventoryLineDto[];

  /** Client-generated per submission so a retried request posts nothing twice. */
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,80}$/)
  idempotency_key: string;
}

export class InventoryReversalDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class InventoryAdjustmentDto extends InventoryReversalDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100000)
  quantity: number;
}

export class InventoryItemDto {
  @IsString()
  @Matches(/^[A-Z0-9_]{2,40}$/, {
    message: 'code must be 2-40 characters: A-Z, 0-9 or _',
  })
  code: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  category: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  stock_uom: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  consumption_uom: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @Max(1000000)
  conversion_factor: number;

  @IsBoolean()
  serialized: boolean;

  @IsBoolean()
  allow_decimal: boolean;

  @IsOptional()
  @IsBoolean()
  remarks_required?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  sort_order?: number;
}

export class InventoryItemUpdateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  stock_uom?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  consumption_uom?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @Max(1000000)
  conversion_factor?: number;

  @IsOptional()
  @IsBoolean()
  serialized?: boolean;

  @IsOptional()
  @IsBoolean()
  allow_decimal?: boolean;

  @IsOptional()
  @IsBoolean()
  remarks_required?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  sort_order?: number;
}
