import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ProvisioningAction } from '@prisma/client';

const INCA_ID = /^\d{1,10}$/;
/** Raw serial as typed or scanned; normalised and checked strictly by the service. */
const RAW_SERIAL = /^[A-Za-z0-9][A-Za-z0-9 :._/-]{3,63}$/;
const SERIAL_MESSAGE = 'ONT serial may use letters, digits and : . _ / -';

/** INCA address of a Terminal Node: city and street picked (ids) or added by name. */
export class LocationDto {
  @Matches(/^\d{1,15}$/, { message: 'Terminal node number must be digits' })
  number: string;

  @IsOptional()
  @Matches(INCA_ID)
  city_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  new_city_name?: string;

  @IsOptional()
  @Matches(/^\d{1,10}$/, { message: 'City area code must be digits' })
  new_city_area_code?: string;

  @IsOptional()
  @Matches(INCA_ID)
  street_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  new_street_name?: string;
}

/** INCA Terminal Node details for a new connection. */
export class TerminalNodeDto extends LocationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @Matches(/^[A-Za-z0-9-]{3,30}$/, {
    message: 'ID card / passport number may use letters, digits and -',
  })
  client_identity: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  client_name: string;

  @IsOptional()
  @Matches(/^\+?[0-9 -]{3,20}$/, {
    message: 'Phone may use digits, spaces, + and -',
  })
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;
}

export class StartProvisioningDto {
  @IsEnum(ProvisioningAction)
  action: ProvisioningAction;

  /** New ONT for New connection / Replacement / Relocation with a new device; confirmed ONT for Signal check. */
  @IsOptional()
  @Matches(RAW_SERIAL, { message: SERIAL_MESSAGE })
  ont_serial?: string;

  /** Replacement / relocation: the customer's current ONT; locates their Terminal Node. */
  @IsOptional()
  @Matches(RAW_SERIAL, { message: SERIAL_MESSAGE })
  old_ont_serial?: string;

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
  @Matches(/^[A-Za-z0-9_-]{1,40}$/, { message: 'Invalid OLT id' })
  confirmed_olt_id?: string;

  @IsOptional()
  @Matches(/^\d{1,3}(\/\d{1,3}){1,3}$/, { message: 'Invalid PON' })
  confirmed_pon?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TerminalNodeDto)
  terminal_node?: TerminalNodeDto;

  /** Relocation: the destination address. */
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;
}

export class DetectOntDto {
  @Matches(RAW_SERIAL, { message: SERIAL_MESSAGE })
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
