import { IsNotEmpty } from 'class-validator';

export class CreateActivityDto {
  @IsNotEmpty()
  assigned_to_team_id: string;

  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  description: string;

  @IsNotEmpty()
  type_id: string;

  @IsNotEmpty()
  linked_to: {
    id: string;
    type: string;
  };
}
