import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import NotificationService from 'src/shared/one-signal/notification/notification.service';
import { CreateTicketDto } from 'src/tickets/dto/create-ticket.dto';
import { TicketsService } from 'src/tickets/tickets.service';
import { UserService } from 'src/user/user.service';

@Injectable()
export class FeedbackService {
  constructor(
    private prisma: PrismaService,
    private user: UserService,
    private ticket: TicketsService,
    private notification: NotificationService,
  ) {}

  async create(
    user_id: string,
    ticket_id: string,
    rating: number,
    review: string,
  ) {
    try {
      if (!user_id || !ticket_id || !rating || !review) {
        throw new Error('Invalid input');
      }
      // let ticket = await this.ticket.findOne(ticket_id);
      // if (!ticket) {
      //   throw new Error('Ticket not found');
      // }
      let user = await this.user.findOneByCrmId(user_id);
      console.log(user);
      let exisingFeedback = await this.findOne(ticket_id, user.id);
      console.log(exisingFeedback);
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
          body: `You have received a new feedback from the customer}`,
        },
        [user_id],
      );

      if (feedback) {
        console.log('Feedback submitted');
        return feedback;
      } else {
        throw new Error('Failed to submit feedback');
      }
    } catch (error) {
      throw new ForbiddenException(error.message);
    }
  }

  async findAllByUser(user_id: string) {
    let feedbacks = await this.prisma.userFeedback.findMany({
      where: {
        user_id: user_id,
      },
      // order
      orderBy: {
        created_at: 'desc',
      },
    });

    let feedback_ticket = await Promise.all(
      feedbacks.map(async (feedback) => {
        let ticket = await this.ticket.crmFindServiceRequest(
          feedback.ticket_id,
        );
        return {
          ticket,
          feedback,
        };
      }),
    );

    return feedback_ticket;
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
