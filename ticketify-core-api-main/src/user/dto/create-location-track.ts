import {
  IsBoolean,
  IsLatitude,
  MaxLength,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateLocationTrackDto {
  @IsNotEmpty()
  @IsLatitude()
  latitude: number;

  @IsNotEmpty()
  @IsLongitude()
  longitude: number;

  /** Client GPS time (ISO). Used as `created_at` so map “current” is not skewed by offline sync. */
  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsOptional()
  @IsNumber()
  accuracy?: number;

  /** Android: fix came from a mock-location app. */
  @IsOptional()
  @IsBoolean()
  mock?: boolean;

  /** Location provider that produced the fix (gps, network, fused). */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  provider?: string;
}
