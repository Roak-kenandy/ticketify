import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  LoginDto,
  ResetPasswordDto,
  SignUpDto,
} from './dto';
import { JwtGuard } from './guard';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import { ADMIN_ROLES } from './ops-roles';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(JwtGuard)
  @Roles(ADMIN_ROLES)
  @Post('sign-up')
  signUp(@Body() dto: SignUpDto) {
    return this.authService.signUp(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtGuard)
  @HttpCode(200)
  @Post('logout')
  logout(@Req() req: { user: { id: string } }) {
    return this.authService.logout(req.user.id);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(JwtGuard)
  @Post('change-password')
  changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.authService.changePassword(req.user, dto);
  }

  @UseGuards(JwtGuard)
  @Roles(ADMIN_ROLES)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @UseGuards(JwtGuard)
  @Roles(ADMIN_ROLES)
  @Get('roles')
  getRoles() {
    return this.authService.getRoles();
  }
}
