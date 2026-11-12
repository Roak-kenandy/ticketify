import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { Access } from 'src/auth/access/access';
import { ROLES_MANAGE, USERS_VIEW } from 'src/auth/access/requirements';
import { RoleDto, UpdateRoleDto } from './dto/role.dto';
import { RolesService } from './roles.service';

@UseGuards(JwtGuard)
@Access(ROLES_MANAGE)
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /** Roles with their screens, for the user form as well as role management. */
  @Access(USERS_VIEW)
  @Get()
  list() {
    return this.roles.list();
  }

  @Access(USERS_VIEW)
  @Get('screens')
  catalogue() {
    return this.roles.catalogue();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.roles.get(id);
  }

  @Post()
  create(@Body() dto: RoleDto) {
    return this.roles.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.roles.remove(id);
  }
}
