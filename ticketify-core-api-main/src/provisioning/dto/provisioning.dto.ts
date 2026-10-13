import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ProvisioningAction } from '@prisma/client';

export class StartProvisioningDto {
  @IsEnum(ProvisioningAction)
  action: ProvisioningAction;

  /** New ONT for New connection / Replacement / Relocation with a new device; confirmed ONT for Signal check. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ont_serial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  service_area?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  device_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  package?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._@-]{3,64}$/, {
    message: 'PPPoE username may use letters, digits and . _ @ -',
  })
  pppoe_username?: string;

  /** Passed straight to INCA; never stored or logged. */
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  pppoe_password?: string;

  /** Relocation: true when a replacement ONT is installed at the destination. */
  @IsOptional()
  @IsBoolean()
  new_ont?: boolean;

  /** OLT / PON the technician confirmed from Detect; registration must match it. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  confirmed_olt_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  confirmed_pon?: string;
}

export class DetectOntDto {
  @IsString()
  @MaxLength(64)
  ont_serial: string;
}

export class RetryProvisioningDto {
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  pppoe_password?: string;
}

export class SignalAfterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  action_taken: string;

  /** Technician confirmed internet / service works after the fix. */
  @IsOptional()
  @IsBoolean()
  service_confirmed?: boolean;
}
