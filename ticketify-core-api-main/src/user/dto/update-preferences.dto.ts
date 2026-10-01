import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export const THEMES = ['light', 'dark', 'system'] as const;
export const DENSITIES = ['comfortable', 'compact'] as const;
export const TEXT_SIZES = ['default', 'large'] as const;
export const START_PAGES = ['map', 'operations', 'finance'] as const;

export type UserPreferences = {
  theme: (typeof THEMES)[number];
  density: (typeof DENSITIES)[number];
  textSize: (typeof TEXT_SIZES)[number];
  reduceMotion: boolean;
  sidebarCollapsed: boolean;
  startPage: (typeof START_PAGES)[number];
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  density: 'comfortable',
  textSize: 'default',
  reduceMotion: false,
  sidebarCollapsed: false,
  startPage: 'map',
};

export class UpdatePreferencesDto {
  @IsOptional()
  @IsIn(THEMES)
  theme?: UserPreferences['theme'];

  @IsOptional()
  @IsIn(DENSITIES)
  density?: UserPreferences['density'];

  @IsOptional()
  @IsIn(TEXT_SIZES)
  textSize?: UserPreferences['textSize'];

  @IsOptional()
  @IsBoolean()
  reduceMotion?: boolean;

  @IsOptional()
  @IsBoolean()
  sidebarCollapsed?: boolean;

  @IsOptional()
  @IsIn(START_PAGES)
  startPage?: UserPreferences['startPage'];
}
