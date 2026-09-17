import { IsNotEmpty, IsString, IsOptional, IsNumber, IsArray } from 'class-validator';

export class CreateActivityDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNotEmpty()
  @IsString()
  type_id: string;

  @IsOptional()
  @IsNumber()
  date?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  custom_fields?: any[];

  @IsOptional()
  assigned_to?: {
    user_id?: string;
    team_id?: string;
  };

  @IsOptional()
  @IsArray()
  linked_to?: {
    type: 'CONTACT' | 'SERVICE_REQUEST' | 'TICKET';
    id: string;
  }[];
}
