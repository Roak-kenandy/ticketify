import { IsNotEmpty } from 'class-validator';

export class CreateTicketDto {
  @IsNotEmpty()
  id: string;

  @IsNotEmpty()
  number: string;

  @IsNotEmpty()
  description: string;

  @IsNotEmpty()
  status: {
    name: string;
  };

  @IsNotEmpty()
  contact_id: string;

  @IsNotEmpty()
  queue: {
    name: string;
  };

  @IsNotEmpty()
  priority: string;
}
