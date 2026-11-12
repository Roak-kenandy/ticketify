import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PermissionEntryDto } from 'src/auth/access/permission.dto';

export class RoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @Matches(/^[\p{L}\p{N} .&()/-]+$/u, {
    message: 'Use letters, numbers and spaces',
  })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsBoolean()
  full_access?: boolean;

  @IsOptional()
  @IsBoolean()
  field_technician?: boolean;

  @IsOptional()
  @IsBoolean()
  stock_holder?: boolean;

  @IsOptional()
  @IsBoolean()
  store?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PermissionEntryDto)
  permissions?: PermissionEntryDto[];
}

export class UpdateRoleDto extends PartialType(RoleDto) {}
