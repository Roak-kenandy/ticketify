import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { Access } from 'src/auth/access/access';
import { USERS_EDIT } from 'src/auth/access/requirements';
import { AdminDirectoryService } from './admin-directory.service';

@UseGuards(JwtGuard)
@Access(USERS_EDIT)
@Controller('admin/directory')
export class AdminDirectoryController {
  constructor(private readonly directory: AdminDirectoryService) {}

  @Get('crm/teams')
  crmTeams() {
    return this.directory.crmTeams();
  }

  @Get('crm/users')
  crmUsers(@Query('team_id') team_id: string) {
    return this.directory.crmUsers(team_id);
  }

  @Get('fms/users')
  fmsUsers() {
    return this.directory.fmsUsers();
  }
}
