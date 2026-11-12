import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard/jwt.guard';
import { Access } from 'src/auth/access/access';
import {
  ACTIVITY_DELETE,
  ACTIVITY_EDIT,
  ACTIVITY_VIEW,
  CONSOLE_ANY,
} from 'src/auth/access/requirements';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

@UseGuards(JwtGuard)
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Access(ACTIVITY_EDIT)
  @Post()
  create(@Body() createActivityDto: CreateActivityDto) {
    return this.activitiesService.createActivity(createActivityDto);
  }

  @Access(ACTIVITY_VIEW)
  @Get()
  findAll() {
    return this.activitiesService.findAll();
  }

  /** Technicians use the ticket-scoped GET tickets/:id/activities/:activityId. */
  @Access(CONSOLE_ANY)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.activitiesService.findOne(id);
  }

  @Access(ACTIVITY_EDIT)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateActivityDto: UpdateActivityDto,
  ) {
    return this.activitiesService.update(+id, updateActivityDto);
  }

  @Access(ACTIVITY_DELETE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.activitiesService.remove(+id);
  }
}
