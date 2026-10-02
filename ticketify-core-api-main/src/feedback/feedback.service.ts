import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyReviewLink } from 'src/infrastructure/security/review-link';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { CrmApiClient } from 'src/infrastructure/crm/crm-api.client';
import NotificationService from 'src/shared/one-signal/notification/notification.service';
import { TicketsService } from 'src/tickets/tickets.service';
import { UserService } from 'src/user/user.service';

type TicketSummary = {
  id: string;
  number: string;
  contact: { person_name: { full_name: string } };
  resolved: boolean;
};

@Injectable()
export class FeedbackService {
  constructor(
    private prisma: PrismaService,
    private user: UserService,
    private ticket: TicketsService,
    private notification: NotificationService,
    private crm: CrmApiClient,
    private config: ConfigService,
  ) {}

  async create(
    user_id: string,
    ticket_id: string,
    rating: number,
    review: string,
    token?: string,
  ) {
    try {
      if (!user_id || !ticket_id || !rating || !review) {
        throw new Error('Invalid input');
      }
      const secret = this.config.get<string>('FEEDBACK_LINK_SECRET')?.trim();
      if (secret && !verifyReviewLink(ticket_id, user_id, token, secret)) {
        throw new ForbiddenException('Invalid review link for this ticket');
      }

      const crmTicket = await this.crm.getServiceRequest(
        encodeURIComponent(ticket_id),
      );
      if (!crmTicket.ok) {
        throw new ForbiddenException('Ticket not found');
      }
      const ticketData = crmTicket.data as {
        state?: string;
        assigned_to?: { user?: { id?: string } };
      };
      if (ticketData?.state !== 'CLOSED') {
        throw new ForbiddenException(
          'Feedback is only allowed for closed tickets',
        );
      }
      const assignedCrmUserId = ticketData?.assigned_to?.user?.id;
      if (!assignedCrmUserId || String(assignedCrmUserId) !== String(user_id)) {
        throw new ForbiddenException('Invalid review link for this ticket');
      }
      // let ticket = await this.ticket.findOne(ticket_id);
      // if (!ticket) {
      //   throw new Error('Ticket not found');
      // }
      let user = await this.user.findOneByCrmId(user_id);
      let exisingFeedback = await this.findOne(ticket_id, user.id);
      if (exisingFeedback) {
        throw new ForbiddenException('Feedback already submitted');
      }

      let feedback = await this.prisma.userFeedback.create({
        data: {
          user_id: user?.id,
          ticket_id: ticket_id,
          rating: rating,
          feedback: review,
        },
      });

      // create notifcation

      await this.notification.publishNotification(
        {
          title: 'New Feedback',
          body: `You received a ${rating}-star review from a customer`,
        },
        [user_id],
      );

      if (feedback) {
        return feedback;
      } else {
        throw new Error('Failed to submit feedback');
      }
    } catch (error) {
      throw new ForbiddenException(error.message);
    }
  }

  /** Ticket number and customer name never change, so summaries are cached for the process lifetime. */
  private readonly summaryCache = new Map<string, TicketSummary>();

  private async ticketSummaryForFeedbackList(
    ticketId: string,
  ): Promise<TicketSummary> {
    const cached = this.summaryCache.get(ticketId);
    if (cached) return cached;
    const summary = await this.loadTicketSummary(ticketId);
    if (summary.resolved) {
      if (this.summaryCache.size >= 5000) this.summaryCache.clear();
      this.summaryCache.set(ticketId, summary);
    }
    return summary;
  }

  /** Lightweight ticket shape for feedback list (avoids full crmFindServiceRequest per row). */
  private async loadTicketSummary(ticketId: string): Promise<TicketSummary> {
    const crmResult = await this.crm
      .getServiceRequest(encodeURIComponent(ticketId))
      .catch(() => null);
    if (!crmResult?.ok) {
      return {
        id: ticketId,
        number: ticketId,
        contact: { person_name: { full_name: 'Customer' } },
        resolved: false,
      };
    }

    const ticket = crmResult.data as {
      id?: string;
      number?: string;
      contact?: {
        id?: string;
        person_name?: { full_name?: string };
      };
    };

    const fullName = ticket?.contact?.person_name?.full_name;

    return {
      id: ticket?.id ?? ticketId,
      number: ticket?.number ?? ticketId,
      contact: {
        person_name: { full_name: fullName ?? 'Customer' },
      },
      resolved: true,
    };
  }

  async findAllByUser(user_id: string) {
    const feedbacks = await this.prisma.userFeedback.findMany({
      where: { user_id },
      orderBy: { created_at: 'desc' },
      take: 100,
    });

    const results = new Array(feedbacks.length);
    const CONCURRENCY = 6;
    let next = 0;
    await Promise.all(
      Array.from(
        { length: Math.min(CONCURRENCY, feedbacks.length) },
        async () => {
          while (next < feedbacks.length) {
            const index = next++;
            const feedback = feedbacks[index];
            const { resolved: _resolved, ...ticket } =
              await this.ticketSummaryForFeedbackList(feedback.ticket_id);
            results[index] = { feedback, ticket };
          }
        },
      ),
    );
    return results;
  }

  async findOneByTicketId(ticket_id: string) {
    return this.prisma.userFeedback.findFirst({
      where: {
        ticket_id: ticket_id,
      },
    });
  }

  async findOne(ticket_id: string, user_id: string) {
    let feedback = await this.prisma.userFeedback.findFirst({
      where: {
        ticket_id: ticket_id,
        user_id: user_id,
      },
    });

    // for each feedback find ticket deta

    return feedback;
  }
}
