import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CrmApiClient } from '../crm/crm-api.client';
import { PrismaService } from '../config/prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import { hasAnyRole, OPS_VIEW_ROLES } from 'src/auth/ops-roles';

export type TicketScopeKind = 'ticket' | 'payment' | 'invoice' | 'receipt';

type AccessUser = { id: string; crm_user_id?: string; role?: unknown };

const TICKET_TTL_MS = 30_000;
const TEAMS_TTL_MS = 5 * 60_000;
const MAX_CACHE = 5000;

/**
 * Decides whether a user may read or act on a CRM service request.
 * Operations roles see everything; field staff only see tickets assigned to
 * them or sitting in one of their CRM teams.
 */
@Injectable()
export class TicketAccessService {
  private readonly tickets = new Map<
    string,
    { at: number; userId?: string; teamId?: string; exists: boolean }
  >();
  private readonly teams = new Map<string, { at: number; ids: Set<string> }>();

  constructor(
    private readonly crm: CrmApiClient,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  /** Roles that may see every ticket (also used for finance documents). */
  static readonly ALL_TICKET_ROLES = [...OPS_VIEW_ROLES, 'Finance'];

  async canAccess(user: AccessUser, kind: TicketScopeKind, value: string) {
    if (hasAnyRole(TicketAccessService.ALL_TICKET_ROLES, user.role)) {
      return true;
    }
    const ticketId = await this.resolveTicketId(kind, value);
    if (!ticketId || !user.crm_user_id) {
      return false;
    }
    const ticket = await this.ticket(ticketId);
    if (!ticket.exists) {
      return false;
    }
    if (ticket.userId && ticket.userId === user.crm_user_id) {
      return true;
    }
    if (ticket.teamId) {
      const teams = await this.userTeams(user.crm_user_id);
      return teams.has(ticket.teamId);
    }
    return false;
  }

  private async resolveTicketId(kind: TicketScopeKind, value: string) {
    switch (kind) {
      case 'ticket':
        return value;
      case 'payment':
        return (
          await this.prisma.ticketPayment.findUnique({
            where: { reference: value },
            select: { crm_ticket_id: true },
          })
        )?.crm_ticket_id;
      case 'invoice':
        return (
          await this.prisma.ticketInvoice.findUnique({
            where: { id: value },
            select: { crm_ticket_id: true },
          })
        )?.crm_ticket_id;
      case 'receipt':
        return (
          await this.prisma.ticketReceipt.findUnique({
            where: { receipt_number: value },
            select: { crm_ticket_id: true },
          })
        )?.crm_ticket_id;
    }
  }

  private async ticket(ticketId: string) {
    const cached = this.tickets.get(ticketId);
    if (cached && Date.now() - cached.at < TICKET_TTL_MS) {
      return cached;
    }
    const result = await this.crm
      .getServiceRequest(encodeURIComponent(ticketId))
      .catch(() => null);
    if (!result || (!result.ok && result.status >= 500)) {
      throw new ServiceUnavailableException(
        'Could not verify access to this ticket. Try again.',
      );
    }
    const data = result.data as {
      assigned_to?: { user?: { id?: string }; team?: { id?: string } };
    } | null;
    const entry = {
      at: Date.now(),
      exists: result.ok,
      userId: data?.assigned_to?.user?.id,
      teamId: data?.assigned_to?.team?.id,
    };
    this.remember(this.tickets, ticketId, entry);
    return entry;
  }

  private async userTeams(crmUserId: string): Promise<Set<string>> {
    const cached = this.teams.get(crmUserId);
    if (cached && Date.now() - cached.at < TEAMS_TTL_MS) {
      return cached.ids;
    }
    const result = await this.crm
      .request('GET', `/users/${encodeURIComponent(crmUserId)}`)
      .catch(() => null);
    if (!result?.ok) {
      this.logger.error('TicketAccess', `Could not load CRM teams for user`);
      return new Set();
    }
    const teams = (result.data as { teams?: { id?: string }[] })?.teams ?? [];
    const ids = new Set(
      teams.map((team) => team?.id).filter((id): id is string => Boolean(id)),
    );
    this.remember(this.teams, crmUserId, { at: Date.now(), ids });
    return ids;
  }

  private remember<V>(map: Map<string, V>, key: string, value: V) {
    if (map.size >= MAX_CACHE) {
      const oldest = map.keys().next().value;
      if (oldest !== undefined) map.delete(oldest);
    }
    map.set(key, value);
  }
}
