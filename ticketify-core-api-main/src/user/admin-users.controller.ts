import { Controller, Delete, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import { UserService } from './user.service';

@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly userService: UserService) {}

  @UseGuards(JwtGuard)
  @Roles(['Admin'])
  @Delete(':id')
  deleteUser(@Param('id') id: string) {
    return this.userService.deleteUser(id);
  }

  @UseGuards(JwtGuard)
  @Roles(['Admin'])
  @Patch(':id/toggle-status')
  toggleUserStatus(@Param('id') id: string) {
    return this.userService.toggleUserStatus(id);
  }
}
