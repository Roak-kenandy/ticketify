import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { PushNotifierService } from 'src/shared/one-signal/notification/push-notifier.service';
import { DISPATCH_MANAGE_ROLES } from 'src/auth/ops-roles';
import {
  CATEGORY_LABELS,
  type WaitingTicket,
} from './assignment-settings.service';

/** Push delivery is best effort: an assignment is never rolled back because a notification failed. */
@Injectable()
export class AssignmentNotifierService {
  constructor(
    private prisma: PrismaService,
    private push: PushNotifierService,
  ) {}

  async technicianAssigned(
    technicianUserId: string,
    ticket: {
      ticketId: string;
      number?: string | null;
      categoryLabel?: string | null;
    },
  ) {
    await this.push.ticketAssigned(technicianUserId, {
      ticketId: ticket.ticketId,
      number: ticket.number,
      category: ticket.categoryLabel,
    });
  }

  async technicianUnassigned(
    technicianUserId: string,
    ticket: { ticketId: string; number?: string | null },
  ) {
    await this.push.ticketReassigned(technicianUserId, ticket);
  }

  async supervisorsNoTechnician(tickets: WaitingTicket[]) {
    if (!tickets.length) return;
    const supervisors = await this.prisma.user.findMany({
      where: {
        role: { name: { in: DISPATCH_MANAGE_ROLES } },
        is_active: true,
      },
      select: { id: true },
    });
    if (!supervisors.length) return;

    const sample = tickets
      .slice(0, 3)
      .map((t) => `${CATEGORY_LABELS[t.category]} ${t.number ?? ''}`.trim())
      .join(', ');
    const more = tickets.length > 3 ? ` and ${tickets.length - 3} more` : '';
    await this.push.ticketsWaiting(
      supervisors.map((s) => s.id),
      { count: tickets.length, sample: `${sample}${more}` },
    );
  }
}
