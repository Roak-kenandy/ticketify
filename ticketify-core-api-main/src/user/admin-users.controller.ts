import {
  BadRequestException,
  Controller,
  Delete,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { ADMIN_ROLES } from 'src/auth/ops-roles';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import { UserService } from './user.service';

@UseGuards(JwtGuard)
@Roles(ADMIN_ROLES)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly userService: UserService) {}

  @Delete(':id')
  deleteUser(@Param('id') id: string, @Req() req: { user: { id: string } }) {
    if (id === req.user.id) {
      throw new BadRequestException('You cannot delete your own account');
    }
    return this.userService.deleteUser(id);
  }

  @Patch(':id/toggle-status')
  toggleUserStatus(
    @Param('id') id: string,
    @Req() req: { user: { id: string } },
  ) {
    if (id === req.user.id) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    return this.userService.toggleUserStatus(id);
  }
}
