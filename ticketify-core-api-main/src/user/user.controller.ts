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
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import { UpdatePresenceDto } from 'src/config/dto/update-presence.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import {
  ADMIN_ROLES,
  DISPATCH_MANAGE_ROLES,
  FIELD_ROLES,
  OPS_VIEW_ROLES,
} from 'src/auth/ops-roles';

@UseGuards(JwtGuard)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Roles(OPS_VIEW_ROLES)
  @Get('technicians')
  getTechnicians() {
    return this.userService.getTechnicians();
  }

  @Get('me')
  me(@Req() req: { user: any }) {
    return this.userService.getMe(req.user);
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

  @Roles([...ADMIN_ROLES, 'Supervisor'])
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

  @Roles(DISPATCH_MANAGE_ROLES)
  @Get('stats')
  getUserStats() {
    return this.userService.getUserStats();
  }

  @Roles([...ADMIN_ROLES, 'Supervisor'])
  @Get(':id')
  getUserById(@Param('id') id: string) {
    return this.userService.getUserById(id);
  }

  @Patch('status')
  updateStatus(
    @Query('status')
    status: 'AVAILABLE' | 'UNAVAILABLE' | 'BREAK' | 'OFFLINE',
    @Req() req: { user: any },
  ) {
    return this.userService.updateStatus({ status }, req.user);
  }

  @Roles(FIELD_ROLES)
  @Patch('presence')
  updatePresence(@Body() body: UpdatePresenceDto, @Req() req: { user: any }) {
    return this.userService.updatePresence(body, req.user);
  }

  @Post('location')
  addLocationTracking(
    @Body() location: CreateLocationTrackDto,
    @Req() req: { user: any },
  ) {
    return this.userService.addLocationTracking(location, req.user);
  }

  @Roles(OPS_VIEW_ROLES)
  @Get('technician/:id/details')
  getTechnicianDetails(@Param('id') id: string) {
    return this.userService.getTechnicianDetails(id);
  }
}
