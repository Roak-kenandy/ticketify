import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    crm_user_id: string;
    Roles: {
      role: any[];
    }[];
  }) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
      select: {
        id: true,
        email: true,
        password: true,
        name: true,
        phone: true,
      },
    });

    if (!user) {
      return null;
    }

    const return_user = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      crm_user_id: payload.crm_user_id,
      role: payload.Roles,
    };

    return return_user;
  }
}
