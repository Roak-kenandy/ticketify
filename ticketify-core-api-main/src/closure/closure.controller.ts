import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import {
  TicketAccessGuard,
  TicketScope,
} from 'src/infrastructure/security/ticket-access.guard';
import { FIELD_ROLES, OPS_VIEW_ROLES } from 'src/auth/ops-roles';
import { ClosureValidationService } from './closure-validation.service';

@Controller('closure')
export class ClosureController {
  constructor(private readonly closure: ClosureValidationService) {}

  @UseGuards(JwtGuard, RolesGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Roles([...new Set([...FIELD_ROLES, ...OPS_VIEW_ROLES])])
  @Get('tickets/:crmTicketId')
  checks(@Param('crmTicketId') crmTicketId: string) {
    return this.closure.evaluate(crmTicketId);
  }
}
