import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
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
import { Access, UserAccess } from 'src/auth/access/access';
import { USERS_EDIT, USERS_VIEW } from 'src/auth/access/requirements';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(JwtGuard)
  @Access(USERS_EDIT)
  @Post('sign-up')
  signUp(@Body() dto: SignUpDto, @Req() req: { user: { access?: UserAccess } }) {
    return this.authService.signUp(dto, req.user);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.authService.login(dto, ip);
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
  @Access(USERS_EDIT)
  @Post('reset-password')
  resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: { user: { access?: UserAccess } },
  ) {
    return this.authService.resetPassword(dto, req.user);
  }

  @UseGuards(JwtGuard)
  @Access(USERS_VIEW)
  @Get('roles')
  getRoles() {
    return this.authService.getRoles();
  }
}
