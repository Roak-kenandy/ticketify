import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import {
  TicketAccessGuard,
  TicketScope,
} from 'src/infrastructure/security/ticket-access.guard';
import { ClosureValidationService } from './closure-validation.service';
import { Access } from 'src/auth/access/access';
import { CLOSURE_VIEW } from 'src/auth/access/requirements';

@Controller('closure')
export class ClosureController {
  constructor(private readonly closure: ClosureValidationService) {}

  @UseGuards(JwtGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Access(CLOSURE_VIEW)
  @Get('tickets/:crmTicketId')
  checks(@Param('crmTicketId') crmTicketId: string) {
    return this.closure.evaluate(crmTicketId);
  }
}
