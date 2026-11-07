import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from 'src/auth/guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import {
  TicketAccessGuard,
  TicketScope,
} from 'src/infrastructure/security/ticket-access.guard';
import { FIELD_ROLES, OPS_VIEW_ROLES } from 'src/auth/ops-roles';
import {
  DetectOntDto,
  RetryProvisioningDto,
  SignalAfterDto,
  StartProvisioningDto,
} from './dto/provisioning.dto';
import { ProvisioningService } from './provisioning.service';

type AuthedRequest = {
  user: { id: string; crm_user_id?: string; role?: unknown };
};

const VIEW_ROLES = [
  ...new Set([...FIELD_ROLES, ...OPS_VIEW_ROLES, 'Inventory']),
];

@Controller('provisioning')
export class ProvisioningController {
  constructor(private readonly provisioning: ProvisioningService) {}

  @UseGuards(JwtGuard, RolesGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Roles(VIEW_ROLES)
  @Get('tickets/:crmTicketId')
  context(@Param('crmTicketId') crmTicketId: string) {
    return this.provisioning.context(crmTicketId);
  }

  @UseGuards(JwtGuard, RolesGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Roles(FIELD_ROLES)
  @Post('tickets/:crmTicketId/start')
  start(
    @Req() req: AuthedRequest,
    @Param('crmTicketId') crmTicketId: string,
    @Body() body: StartProvisioningDto,
  ) {
    return this.provisioning.start(crmTicketId, req.user, body);
  }

  // Each detect is a live INCA query; cap it so serials cannot be enumerated through it.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(JwtGuard, RolesGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Roles(FIELD_ROLES)
  @Post('tickets/:crmTicketId/detect')
  detect(
    @Req() req: AuthedRequest,
    @Param('crmTicketId') crmTicketId: string,
    @Body() body: DetectOntDto,
  ) {
    return this.provisioning.detect(crmTicketId, req.user, body.ont_serial);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseGuards(JwtGuard, RolesGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Roles(FIELD_ROLES)
  @Get('tickets/:crmTicketId/inca/streets')
  streets(@Query('city_id') cityId = '') {
    return this.provisioning.streets(cityId);
  }

  // Client lookup reveals whether an ID card is an INCA customer; keep it slow and ticket-scoped.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(JwtGuard, RolesGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Roles(FIELD_ROLES)
  @Get('tickets/:crmTicketId/inca/clients')
  client(
    @Req() req: AuthedRequest,
    @Param('crmTicketId') crmTicketId: string,
    @Query('identity') identity = '',
  ) {
    return this.provisioning.findClient(crmTicketId, req.user, identity);
  }

  // Reveals which customer an ONT serial belongs to; keep it slow and ticket-scoped.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(JwtGuard, RolesGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Roles(FIELD_ROLES)
  @Get('tickets/:crmTicketId/inca/subscriber')
  subscriberBySerial(
    @Req() req: AuthedRequest,
    @Param('crmTicketId') crmTicketId: string,
    @Query('serial') serial = '',
  ) {
    return this.provisioning.subscriberBySerial(crmTicketId, req.user, serial);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(OPS_VIEW_ROLES)
  @Get('transactions')
  log(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('action') action?: string,
    @Query('sr') sr?: string,
  ) {
    return this.provisioning.log({ from, to, status, action, sr });
  }

  /** Ticket access for the routes below is checked once the run's ticket is known. */
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(VIEW_ROLES)
  @Get('transactions/:id')
  transaction(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.provisioning.viewForActor(id, req.user);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(FIELD_ROLES)
  @Post('transactions/:id/retry')
  retry(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: RetryProvisioningDto,
  ) {
    return this.provisioning.retry(id, req.user, body);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(FIELD_ROLES)
  @Post('transactions/:id/signal-after')
  signalAfter(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: SignalAfterDto,
  ) {
    return this.provisioning.signalAfter(id, req.user, body);
  }
}
