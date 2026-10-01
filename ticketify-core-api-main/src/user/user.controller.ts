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
import { IsNotEmpty } from 'class-validator';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { UpdatePresenceDto } from 'src/config/dto/update-presence.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}


  @UseGuards(JwtGuard)
  @Get('technicians')
  getTechnicians() {
    return this.userService.getTechnicians();
  }

  @UseGuards(JwtGuard)
  @Get('me')
  me(@Req() req: { user: any }) {
    return this.userService.getMe(req.user);
  }

  @UseGuards(JwtGuard)
  @Get('me/preferences')
  myPreferences(@Req() req: { user: { id: string } }) {
    return this.userService.getPreferences(req.user.id);
  }

  @UseGuards(JwtGuard)
  @Patch('me/preferences')
  updateMyPreferences(
    @Req() req: { user: { id: string } },
    @Body() body: UpdatePreferencesDto,
  ) {
    return this.userService.updatePreferences(req.user.id, body);
  }

  @UseGuards(JwtGuard)
  @Get()
  //   const [filters, setFilters] = useState<UserFilter>({
  //   search: "",
  //   role: "",
  //   availability: undefined,
  //   page: 1,
  //   limit: 20,
  // });
  getAllUsers(
    @Query()
    filters: {
      search?: string;
      role?: string;
      availability?: 'AVAILABLE' | 'UNAVAILABLE' | 'BREAK' | 'OFFLINE';
      page?: number;
      limit?: number;
    },
  ) {
    return this.userService.getAllUsers(
      filters
    );
  }


  @UseGuards(JwtGuard)
  @Roles(['ADMIN', 'SUPERVISOR'])
  @Get('stats')
  getUserStats() {
    return this.userService.getUserStats();
  }

  @UseGuards(JwtGuard)
  @Roles(['ADMIN', 'SUPERVISOR'])
  @Get(':id')
  getUserById(@Param('id') id: string) {
    if (!id) {
      throw new Error('User ID is required');
    }
    return this.userService.getUserById(id);
  }


  
  @Get('technicians/:team_id')
  getTechniciansByTeam(@Param('team_id') team_id: string) {
    console.log('team_id', team_id);
    if (!team_id) {
      throw new Error('Team ID is required');
    }
    return this.userService.getTechniciansByTeam(team_id);
  }

  @UseGuards(JwtGuard)
  @Patch('status')
  updateStatus(
    @Query('status')
    status: 'AVAILABLE' | 'UNAVAILABLE' | 'BREAK' | 'OFFLINE',
    @Req() req: { user: any },
  ) {
    return this.userService.updateStatus({ status }, req.user);
  }

  @UseGuards(JwtGuard)
  @Roles(['TECHNICIAN'])
  @Patch('presence')
  updatePresence(@Body() body: UpdatePresenceDto, @Req() req: { user: any }) {
    return this.userService.updatePresence(body, req.user);
  }

  @UseGuards(JwtGuard)
  @Post('location')
  addLocationTracking(
    @Body()
    location: CreateLocationTrackDto,
    @Req() req: { user: any },
  ) {
    return this.userService.addLocationTracking(location, req.user);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Get('technician/:id/details')
  @Roles(['Admin', 'Supervisor', 'Administrator', 'CEO'])
  getTechnicianDetails(@Param('id') id: string) {
    if (!id) {
      throw new Error('Technician ID is required');
    }
    return this.userService.getTechnicianDetails(id);
  }
}
