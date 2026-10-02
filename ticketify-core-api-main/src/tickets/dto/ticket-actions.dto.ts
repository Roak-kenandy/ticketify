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
