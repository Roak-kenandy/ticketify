import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;
export const PASSWORD_MESSAGE =
  'Password must be 8–128 characters and include at least one letter and one number';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  old_password: string;

  @IsString()
  @MinLength(8, { message: PASSWORD_MESSAGE })
  @MaxLength(128)
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  new_password: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  user_id: string;

  @IsString()
  @MinLength(8, { message: PASSWORD_MESSAGE })
  @MaxLength(128)
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  new_password: string;
}
