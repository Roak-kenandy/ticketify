import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateFeedbackDto {
  @IsNotEmpty()
  @IsString()
  userId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  review: string;
}
