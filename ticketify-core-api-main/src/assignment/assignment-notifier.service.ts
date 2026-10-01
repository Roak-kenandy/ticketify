import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import NotificationService from 'src/shared/one-signal/notification/notification.service';
import { DISPATCH_MANAGE_ROLES } from 'src/auth/ops-roles';
import { CATEGORY_LABELS, type WaitingTicket } from './assignment-settings.service';

/** Push delivery is best effort: an assignment is never rolled back because a notification failed. */
@Injectable()
export class AssignmentNotifierService {
  private readonly logger = new Logger(AssignmentNotifierService.name);

  constructor(
    private prisma: PrismaService,
    private notification: NotificationService,
  ) {}

  /** OneSignal external ids are Ticketify user ids (set by the mobile app on login). */
  async technicianAssigned(
    technicianUserId: string,
    ticket: { number?: string | null; categoryLabel?: string | null },
  ) {
    const what = [ticket.categoryLabel, 'ticket', ticket.number].filter(Boolean).join(' ');
    await this.send(
      { title: 'New job assigned', body: `${what} has been assigned to you.` },
      [technicianUserId],
    );
  }

  async supervisorsNoTechnician(tickets: WaitingTicket[]) {
    if (!tickets.length) return;
    const supervisors = await this.prisma.user.findMany({
      where: { role: { name: { in: DISPATCH_MANAGE_ROLES } } },
      select: { id: true },
    });
    if (!supervisors.length) return;

    const sample = tickets
      .slice(0, 3)
      .map(t => `${CATEGORY_LABELS[t.category]} ${t.number ?? ''}`.trim())
      .join(', ');
    const more = tickets.length > 3 ? ` and ${tickets.length - 3} more` : '';
    await this.send(
      {
        title: 'Tickets waiting for a technician',
        body: `${tickets.length} ticket(s) could not be auto-assigned (${sample}${more}). No eligible technician is available.`,
      },
      supervisors.map(s => s.id),
    );
  }

  private async send(message: { title: string; body: string }, ids: string[]) {
    try {
      await this.notification.publishNotification(message, ids);
    } catch (error) {
      this.logger.warn(`Notification failed: ${String(error)}`);
    }
  }
}
