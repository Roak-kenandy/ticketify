import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

export class ScheduleVisitDto {
  @IsDateString()
  scheduled_at: string;

  @IsOptional()
  @IsBoolean()
  notify_customer?: boolean;
}
