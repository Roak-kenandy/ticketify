import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
export enum PresenceLevel {
  ONLINE = 'ONLINE',
  BUSY = 'BUSY',
  OFFLINE = 'OFFLINE',
}

export class UpdatePresenceDto {
  @IsEnum(PresenceLevel)
  presence: PresenceLevel;

  @ValidateIf(o => o.presence === PresenceLevel.BUSY)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  busy_comment?: string;

  @IsOptional()
  @IsDateString()
  busy_until?: string;
}
