import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { CreateLocationTrackDto } from './dto/create-location-track';
import { UserService } from './user.service';
import { UpdatePresenceDto } from 'src/config/dto/update-presence.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { Access, UserAccess } from 'src/auth/access/access';
import { FIELD, OPS_VIEW, TEAM_STATS, USERS_VIEW } from 'src/auth/access/requirements';

@UseGuards(JwtGuard)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Access(OPS_VIEW)
  @Get('technicians')
  getTechnicians() {
    return this.userService.getTechnicians();
  }

  @Get('me')
  me(@Req() req: { user: any }) {
    return this.userService.getMe(req.user);
  }

  /** Current screens and capabilities; the console refreshes its menus from this. */
  @Get('me/access')
  myAccess(@Req() req: { user: { access: UserAccess } }) {
    return req.user.access;
  }

  @Access(FIELD)
  @Get('me/tracking')
  myTracking(@Req() req: { user: { id: string } }) {
    return this.userService.getTrackingSetup(req.user.id);
  }

  @Access(FIELD)
  @Post('me/tracking/reset')
  resetMyTracking(@Req() req: { user: { id: string } }) {
    return this.userService.resetTrackingDevice(req.user.id);
  }

  @Get('me/preferences')
  myPreferences(@Req() req: { user: { id: string } }) {
    return this.userService.getPreferences(req.user.id);
  }

  @Patch('me/preferences')
  updateMyPreferences(
    @Req() req: { user: { id: string } },
    @Body() body: UpdatePreferencesDto,
  ) {
    return this.userService.updatePreferences(req.user.id, body);
  }

  @Access(USERS_VIEW)
  @Get()
  getAllUsers(
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('availability')
    availability?: 'AVAILABLE' | 'UNAVAILABLE' | 'BREAK' | 'OFFLINE',
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.userService.getAllUsers({
      search: search?.slice(0, 100),
      role: role?.slice(0, 64),
      availability,
      status:
        status === 'ACTIVE' || status === 'INACTIVE' ? status : undefined,
      page: Math.max(1, Number(page) || 1),
      limit: Math.min(100, Math.max(1, Number(limit) || 20)),
    });
  }

  @Access(TEAM_STATS)
  @Get('stats')
  getUserStats() {
    return this.userService.getUserStats();
  }

  @Access(USERS_VIEW)
  @Get(':id')
  getUserById(@Param('id') id: string) {
    return this.userService.getUserById(id);
  }

  @Access(FIELD)
  @Patch('status')
  updateStatus(
    @Query('status')
    status: 'AVAILABLE' | 'UNAVAILABLE' | 'BREAK' | 'OFFLINE',
    @Req() req: { user: any },
  ) {
    return this.userService.updateStatus({ status }, req.user);
  }

  @Access(FIELD)
  @Patch('presence')
  updatePresence(@Body() body: UpdatePresenceDto, @Req() req: { user: any }) {
    return this.userService.updatePresence(body, req.user);
  }

  @Access(FIELD)
  @Post('location')
  addLocationTracking(
    @Body() location: CreateLocationTrackDto,
    @Req() req: { user: any },
  ) {
    return this.userService.addLocationTracking(location, req.user);
  }

  @Access(OPS_VIEW)
  @Get('technician/:id/details')
  getTechnicianDetails(@Param('id') id: string) {
    return this.userService.getTechnicianDetails(id);
  }
}
