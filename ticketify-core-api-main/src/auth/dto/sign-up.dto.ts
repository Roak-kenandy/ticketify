import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { UserSource } from '@prisma/client';
import { PermissionOverrideDto } from '../access/permission.dto';
import { PASSWORD_MESSAGE, PASSWORD_RULE } from './change-password.dto';

export class SignUpDto {
  @IsOptional()
  @IsEnum(UserSource)
  source?: UserSource;

  @ValidateIf(
    (dto: SignUpDto) =>
      (dto.source ?? UserSource.MEDIANET) === UserSource.MEDIANET,
  )
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9-]{8,64}$/, { message: 'Invalid CRM user id' })
  crm_user_id?: string;

  /** Numeric FMS user id from the Assign to User dropdown (e.g. 212). */
  @ValidateIf((dto: SignUpDto) => dto.source === UserSource.OOREDOO)
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]{1,12}$/, { message: 'Invalid Ooredoo user id' })
  ooredoo_user_id?: string;

  @IsNotEmpty()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9 ]{6,20}$/, { message: 'Invalid phone number' })
  phone: string;

  @IsString()
  @MinLength(8, { message: PASSWORD_MESSAGE })
  @MaxLength(128)
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  role_id: string;

  /** Per-screen changes from the role's levels; only the role's screens count. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PermissionOverrideDto)
  permissions?: PermissionOverrideDto[];
}
