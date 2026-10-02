import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateFeedbackDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(64)
  userId: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  token?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  review: string;
}
