import { Injectable } from '@nestjs/common';
import NotificationService from './notification.service';

type TicketRef = { ticketId: string; number?: string | null };

function ticketLabel(ticket: TicketRef, category?: string | null): string {
  const number = ticket.number ? `#${ticket.number}` : '';
  return [category, 'ticket', number].filter(Boolean).join(' ');
}

/**
 * Every push the app receives, in one place. Recipients are Ticketify user ids.
 * All methods are fire-and-forget safe (the sender never throws).
 */
@Injectable()
export class PushNotifierService {
  constructor(private notification: NotificationService) {}

  ticketAssigned(
    userId: string,
    ticket: TicketRef & { category?: string | null },
  ) {
    return this.notification.publishNotification(
      {
        title: 'New job assigned',
        body: `${ticketLabel(ticket, ticket.category)} has been assigned to you. Tap to view the details.`,
        data: { type: 'TICKET_ASSIGNED', ticket_id: ticket.ticketId },
      },
      [userId],
    );
  }

  ticketReassigned(userId: string, ticket: TicketRef) {
    return this.notification.publishNotification(
      {
        title: 'Job reassigned',
        body: `${ticketLabel(ticket)} has been reassigned to another technician. No action is needed from you.`,
        data: { type: 'TICKET_REASSIGNED', ticket_id: ticket.ticketId },
      },
      [userId],
    );
  }

  paymentReceived(userId: string, ticket: TicketRef & { amount: string }) {
    return this.notification.publishNotification(
      {
        title: 'Payment received',
        body: `The customer paid ${ticket.amount} for ${ticketLabel(ticket)}. You can now complete the job.`,
        data: { type: 'PAYMENT_RECEIVED', ticket_id: ticket.ticketId },
      },
      [userId],
    );
  }

  newReview(userId: string, ticket: TicketRef & { rating: number }) {
    const stars = Math.max(1, Math.min(5, Math.round(ticket.rating)));
    return this.notification.publishNotification(
      {
        title: 'New customer review',
        body: `A customer rated your work ${stars}/5 on ${ticketLabel(ticket)}.`,
        data: { type: 'NEW_REVIEW', ticket_id: ticket.ticketId },
      },
      [userId],
    );
  }

  ticketsWaiting(
    userIds: string[],
    summary: { count: number; sample: string },
  ) {
    return this.notification.publishNotification(
      {
        title: 'Tickets waiting for a technician',
        body: `${summary.count} ticket(s) could not be auto-assigned (${summary.sample}). No eligible technician is available.`,
        data: { type: 'TICKETS_WAITING' },
      },
      userIds,
    );
  }
}
