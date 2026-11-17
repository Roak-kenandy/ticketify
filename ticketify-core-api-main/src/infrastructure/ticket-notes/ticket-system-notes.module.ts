import { Global, Module } from '@nestjs/common';
import { TicketSystemNotesService } from './ticket-system-notes.service';

@Global()
@Module({
  providers: [TicketSystemNotesService],
  exports: [TicketSystemNotesService],
})
export class TicketSystemNotesModule {}
