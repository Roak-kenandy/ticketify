import { PartialType } from '@nestjs/mapped-types';
import { CreateTicketDto } from './create-ticket.dto';

export class UpdateTicketDto extends PartialType(CreateTicketDto) {
  assigned_to: {
    user_id: string;
    team_id: string;
  };
  stage: {
    id: string;
    comment: string;
  };
}
