import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TicketAccessService, TicketScopeKind } from './ticket-access.service';

const TICKET_SCOPE = 'ticket_scope';

type TicketScopeOptions = { param: string; kind: TicketScopeKind };

/**
 * Declares which route param identifies the ticket (directly or through a
 * payment reference, invoice id or receipt number). Use with
 * `@UseGuards(JwtGuard, TicketAccessGuard)`.
 */
export const TicketScope = (param = 'id', kind: TicketScopeKind = 'ticket') =>
  SetMetadata(TICKET_SCOPE, { param, kind } satisfies TicketScopeOptions);

@Injectable()
export class TicketAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: TicketAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.getAllAndOverride<TicketScopeOptions>(
      TICKET_SCOPE,
      [context.getHandler(), context.getClass()],
    ) ?? { param: 'id', kind: 'ticket' };
    const request = context.switchToHttp().getRequest();
    const value = request.params?.[scope.param];
    if (!request.user || typeof value !== 'string' || !value) {
      throw new ForbiddenException('You do not have access to this ticket');
    }
    if (!(await this.access.canAccess(request.user, scope.kind, value))) {
      throw new ForbiddenException('You do not have access to this ticket');
    }
    return true;
  }
}
