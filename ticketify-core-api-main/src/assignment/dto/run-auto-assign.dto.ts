import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class RunAutoAssignDto {
  @IsOptional()
  @IsString()
  team_id?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  max_assignments?: number;
}
