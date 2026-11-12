import { IsIn, IsString, MaxLength } from 'class-validator';
import { AccessLevel } from '@prisma/client';
import { ACCESS_LEVELS } from './screens';

export class PermissionEntryDto {
  @IsString()
  @MaxLength(64)
  screen: string;

  @IsIn(ACCESS_LEVELS)
  level: Exclude<AccessLevel, 'NONE'>;
}

export class PermissionOverrideDto {
  @IsString()
  @MaxLength(64)
  screen: string;

  @IsIn(['NONE', ...ACCESS_LEVELS])
  level: AccessLevel;
}
