import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, SignUpDto } from './dto';
import { JwtGuard } from './guard';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import { RolesGuard } from './guard/roles.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(['Technician', 'Admin'])
  @Post('sign-up')
  signUp(@Body() dto: SignUpDto) {
    return this.authService.signUp(dto);
  }

  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(['Technician', 'Admin'])
  @Post('change-password')
  changePassword(
    @Body()
    dto: {
      old_password: string;
      new_password: string;
    },
    @Req() req: { user: any },
  ) {
    return this.authService.changePassword(req.user, dto);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Post('reset-password')
  @Roles(['Admin'])
  resetPassword(
    @Body()
    dto: {
      user_id: string;
      new_password: string;
    },
  ) {
    return this.authService.resetPassword(dto);
  }

  @Get('roles')
  @UseGuards(JwtGuard)
  getRoles() {
    return this.authService.getRoles();
  }
}
