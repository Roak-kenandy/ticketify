import { Global, Module } from '@nestjs/common';
import { LoggerModule } from '../logger/logger.module';
import { TicketAccessGuard } from './ticket-access.guard';
import { TicketAccessService } from './ticket-access.service';

@Global()
@Module({
  imports: [LoggerModule],
  providers: [TicketAccessService, TicketAccessGuard],
  exports: [TicketAccessService, TicketAccessGuard],
})
export class SecurityModule {}
