import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PASSWORD_MESSAGE, PASSWORD_RULE } from './change-password.dto';

export class SignUpDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9-]{8,64}$/, { message: 'Invalid CRM user id' })
  crm_user_id: string;

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
}
