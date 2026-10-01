import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ASSIGN_STRATEGIES,
  CATEGORY_MODES,
  type AssignStrategy,
  type CategoryMode,
} from '../assignment-settings.service';

export class CategoryModesDto {
  @IsOptional()
  @IsIn(CATEGORY_MODES)
  fault?: CategoryMode;

  @IsOptional()
  @IsIn(CATEGORY_MODES)
  new_connections?: CategoryMode;

  @IsOptional()
  @IsIn(CATEGORY_MODES)
  relocation?: CategoryMode;
}

export class UpdateAutoAssignSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => CategoryModesDto)
  categories?: CategoryModesDto;

  @IsOptional()
  @IsIn(ASSIGN_STRATEGIES)
  strategy?: AssignStrategy;

  @IsOptional()
  @IsBoolean()
  include_busy?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  max_open_jobs?: number;

  @IsOptional()
  @IsObject()
  team_enabled?: Record<string, boolean>;
}
