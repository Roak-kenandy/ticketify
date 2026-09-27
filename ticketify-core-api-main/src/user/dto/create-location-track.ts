import {
  IsLatitude,
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
}
