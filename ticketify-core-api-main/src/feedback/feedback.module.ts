import { Module } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { FeedbackController } from './feedback.controller';
import { TicketsModule } from 'src/tickets/tickets.module';
import { UserModule } from 'src/user/user.module';
import { NotificationModule } from 'src/shared/one-signal/notification/notification.module';

@Module({
  controllers: [FeedbackController],
  providers: [FeedbackService],
  imports: [TicketsModule, UserModule, NotificationModule],
})
export class FeedbackModule {}
