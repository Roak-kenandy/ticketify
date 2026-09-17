import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, SignUpDto } from './dto';
import { JwtGuard } from './guard';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(JwtGuard)
  @Roles(['Technician', 'Admin'])
  @Post('sign-up')
  signUp(@Body() dto: SignUpDto) {
    return this.authService.signUp(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('change-password')
  @UseGuards(JwtGuard)
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
