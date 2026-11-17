import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { CrmApiClient } from 'src/infrastructure/crm/crm-api.client';
import { isFmsTicketId } from 'src/infrastructure/ooredoo-fms/ooredoo-fms.types';
import { hasConsoleAccess, UserAccess } from 'src/auth/access/access';

const MAX_HELPERS = 2;

export type HelperActor = {
  id: string;
  crm_user_id: string;
  source?: string;
  access?: UserAccess;
};

export type HelperRow = {
  id: string;
  user_id: string;
  name: string | null;
  email: string;
  crm_user_id: string;
  added_at: string;
  added_by_user_id: string;
};

@Injectable()
export class TicketHelpersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmApiClient,
  ) {}

  assertMedianetTicket(ticketId: string, actor?: HelperActor) {
    if (isFmsTicketId(ticketId) || actor?.source === 'OOREDOO') {
      throw new BadRequestException(
        'Co-tech helpers are only for Medianet CRM tickets',
      );
    }
  }

  async list(ticketId: string): Promise<HelperRow[]> {
    const rows = await this.prisma.ticketHelper.findMany({
      where: { crm_ticket_id: ticketId },
      include: {
        helper: {
          select: { id: true, name: true, email: true, crm_user_id: true },
        },
      },
      orderBy: { created_at: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      user_id: row.helper.id,
      name: row.helper.name,
      email: row.helper.email,
      crm_user_id: row.helper.crm_user_id,
      added_at: row.created_at.toISOString(),
      added_by_user_id: row.added_by_user_id,
    }));
  }

  async isHelper(ticketId: string, mproUserId: string): Promise<boolean> {
    const row = await this.prisma.ticketHelper.findUnique({
      where: {
        crm_ticket_id_helper_user_id: {
          crm_ticket_id: ticketId,
          helper_user_id: mproUserId,
        },
      },
      select: { id: true },
    });
    return Boolean(row);
  }

  async helperTicketIdsForUser(mproUserId: string): Promise<string[]> {
    const rows = await this.prisma.ticketHelper.findMany({
      where: { helper_user_id: mproUserId },
      select: { crm_ticket_id: true },
    });
    return rows.map((row) => row.crm_ticket_id);
  }

  async candidates(ticketId: string, actor: HelperActor) {
    this.assertMedianetTicket(ticketId, actor);
    await this.assertCanManage(ticketId, actor);

    const ticket = await this.loadTicket(ticketId);
    const primaryCrmId = ticket.assigned_to?.user?.id;
    const existing = await this.prisma.ticketHelper.findMany({
      where: { crm_ticket_id: ticketId },
      select: { helper_user_id: true },
    });
    const exclude = new Set(existing.map((row) => row.helper_user_id));

    // Field techs + supervisors (Medianet only). Primary assignee is excluded.
    const users = await this.prisma.user.findMany({
      where: {
        source: 'MEDIANET',
        is_active: true,
        OR: [
          { role: { field_technician: true } },
          { role: { name: { equals: 'Supervisor', mode: 'insensitive' } } },
        ],
        ...(primaryCrmId ? { NOT: { crm_user_id: primaryCrmId } } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        crm_user_id: true,
        presence: true,
        role: { select: { name: true, field_technician: true } },
      },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      take: 200,
    });

    return users
      .filter((user) => !exclude.has(user.id) && user.id !== actor.id)
      .map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        crm_user_id: user.crm_user_id,
        presence: user.presence,
        role: user.role?.name ?? null,
      }));
  }

  async add(ticketId: string, helperUserId: string, actor: HelperActor) {
    this.assertMedianetTicket(ticketId, actor);
    await this.assertCanManage(ticketId, actor);

    const ticket = await this.loadTicket(ticketId);
    const primaryCrmId = ticket.assigned_to?.user?.id;
    if (!primaryCrmId) {
      throw new BadRequestException(
        'Assign the ticket to a technician before adding a helper',
      );
    }

    const helper = await this.prisma.user.findUnique({
      where: { id: helperUserId },
      include: { role: { select: { name: true, field_technician: true } } },
    });
    if (!helper || !helper.is_active) {
      throw new NotFoundException('Technician not found');
    }
    if (helper.source !== 'MEDIANET') {
      throw new BadRequestException('Only Medianet technicians can help');
    }
    const roleName = helper.role?.name?.trim().toLowerCase() ?? '';
    const allowed =
      Boolean(helper.role?.field_technician) || roleName === 'supervisor';
    if (!allowed) {
      throw new BadRequestException(
        'Only Medianet field technicians or supervisors can be helpers',
      );
    }
    if (helper.crm_user_id === primaryCrmId) {
      throw new BadRequestException(
        'The assigned technician is already the primary on this ticket',
      );
    }

    const count = await this.prisma.ticketHelper.count({
      where: { crm_ticket_id: ticketId },
    });
    if (count >= MAX_HELPERS) {
      throw new BadRequestException(
        `At most ${MAX_HELPERS} helpers can work on one ticket`,
      );
    }

    try {
      await this.prisma.ticketHelper.create({
        data: {
          crm_ticket_id: ticketId,
          helper_user_id: helper.id,
          added_by_user_id: actor.id,
        },
      });
    } catch {
      throw new BadRequestException('That technician is already a helper');
    }

    return this.list(ticketId);
  }

  async remove(ticketId: string, helperUserId: string, actor: HelperActor) {
    this.assertMedianetTicket(ticketId, actor);
    await this.assertCanManage(ticketId, actor);

    const deleted = await this.prisma.ticketHelper.deleteMany({
      where: { crm_ticket_id: ticketId, helper_user_id: helperUserId },
    });
    if (!deleted.count) {
      throw new NotFoundException('Helper not found on this ticket');
    }
    return this.list(ticketId);
  }

  /** mPro user ids that should receive customer feedback credit for this ticket. */
  async creditUserIds(
    ticketId: string,
    primaryMproUserId: string,
  ): Promise<string[]> {
    const helpers = await this.prisma.ticketHelper.findMany({
      where: { crm_ticket_id: ticketId },
      select: { helper_user_id: true },
    });
    return [
      primaryMproUserId,
      ...helpers.map((row) => row.helper_user_id),
    ].filter((id, index, all) => all.indexOf(id) === index);
  }

  private async assertCanManage(ticketId: string, actor: HelperActor) {
    if (hasConsoleAccess(actor.access)) {
      return;
    }
    const ticket = await this.loadTicket(ticketId);
    const primaryCrmId = ticket.assigned_to?.user?.id;
    if (!primaryCrmId || primaryCrmId !== actor.crm_user_id) {
      throw new ForbiddenException(
        'Only the assigned technician can manage helpers on this ticket',
      );
    }
  }

  private async loadTicket(ticketId: string) {
    const result = await this.crm.getServiceRequest(
      encodeURIComponent(ticketId),
    );
    if (!result.ok) {
      throw new NotFoundException('Ticket not found');
    }
    return result.data as {
      state?: string;
      assigned_to?: { user?: { id?: string; name?: string } };
    };
  }
}
