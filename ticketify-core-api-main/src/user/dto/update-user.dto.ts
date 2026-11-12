import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PermissionOverrideDto } from 'src/auth/access/permission.dto';

/** Admin edit of another user. Overrides replace the user's existing ones. */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9 ]{6,20}$/, { message: 'Invalid phone number' })
  phone?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  role_id?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PermissionOverrideDto)
  permissions?: PermissionOverrideDto[];
}
