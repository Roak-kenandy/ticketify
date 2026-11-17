import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class StartTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  stage_id?: string;
}

export class ProgressTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  stage_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  stage_name?: string;
}

export class CompleteTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  stage_id?: string;

  /**
   * Ooredoo FMS: TT status id from the portal Change_Ticket_Status dropdown
   * (same list as Change TT status — tech picks any status when closing).
   */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  ticket_status?: string;

  /** FMS ticket_sub_comment option value (required with ticket_status). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  closing_sub_comment?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

export class AddNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  note: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

export class AttachmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  file_id?: string;
}
