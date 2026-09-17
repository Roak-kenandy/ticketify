import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { JwtGuard } from 'src/auth/guard/jwt.guard';

@Controller('feedbacks')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post(':id')
  create(
    @Body()
    createFeedbackDto: {
      userId: string;
      rating: number;
      review: string;
    },
    @Param('id') ticketId: string,
  ) {
    console.log(createFeedbackDto);
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
