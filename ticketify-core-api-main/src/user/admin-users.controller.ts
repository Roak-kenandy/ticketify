import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { Access } from 'src/auth/access/access';
import { USERS_DELETE, USERS_EDIT } from 'src/auth/access/requirements';
import { UpdateUserDto } from './dto/update-user.dto';
import { ManagingUser, UserService } from './user.service';

@UseGuards(JwtGuard)
@Access(USERS_DELETE)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly userService: UserService) {}

  @Access(USERS_EDIT)
  @Patch(':id')
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: { user: ManagingUser },
  ) {
    return this.userService.updateUser(id, dto, req.user);
  }

  @Delete(':id')
  deleteUser(@Param('id') id: string, @Req() req: { user: ManagingUser }) {
    if (id === req.user.id) {
      throw new BadRequestException('You cannot delete your own account');
    }
    return this.userService.deleteUser(id, req.user);
  }

  @Patch(':id/toggle-status')
  toggleUserStatus(
    @Param('id') id: string,
    @Req() req: { user: ManagingUser },
  ) {
    if (id === req.user.id) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    return this.userService.toggleUserStatus(id, req.user);
  }
}
