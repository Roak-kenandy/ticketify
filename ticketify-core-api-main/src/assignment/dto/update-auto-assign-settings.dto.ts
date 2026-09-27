import { IsBoolean, IsObject, IsOptional } from 'class-validator';

export class UpdateAutoAssignSettingsDto {
  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsObject()
  team_enabled?: Record<string, boolean>;
}
