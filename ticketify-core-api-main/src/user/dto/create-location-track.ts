import { IsNotEmpty, IsLatitude, IsLongitude } from 'class-validator';

export class CreateLocationTrackDto {
  @IsNotEmpty()
  @IsLatitude()
  latitude: number;

  @IsNotEmpty()
  @IsLongitude()
  longitude: number;
}
