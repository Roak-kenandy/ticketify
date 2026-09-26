import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FeedbackService } from './feedback.service';
import { JwtGuard } from 'src/auth/guard/jwt.guard';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

@Controller('feedbacks')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Throttle({ default: { limit: 10, ttl: 600000 } })
  @Post(':id')
  create(
    @Body() createFeedbackDto: CreateFeedbackDto,
    @Param('id') ticketId: string,
  ) {
    return this.feedbackService.create(
      createFeedbackDto.userId,
      ticketId,
      createFeedbackDto.rating,
      createFeedbackDto.review,
    );
  }

  @UseGuards(JwtGuard)
  @Get()
  async fetchFeedbacks(
    @Req()
    req: {
      user: {
        id: string;
      };
    },
  ) {
    return this.feedbackService.findAllByUser(req.user.id);
  }
}
