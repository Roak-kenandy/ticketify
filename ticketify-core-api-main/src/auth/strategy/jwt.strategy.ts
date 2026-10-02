import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';

export type JwtPayload = {
  sub: string;
  email: string;
  crm_user_id: string;
  Roles: string[];
  /** Token version; must match users.token_version. */
  tv: number;
};

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
      algorithms: ['HS256'],
    });
  }

  /**
   * The role, CRM id and active flag come from the database on every request,
   * so demoting, deactivating or logging a user out takes effect immediately
   * instead of when the token expires.
   */
  async validate(payload: JwtPayload) {
    if (!payload?.sub || typeof payload.tv !== 'number') {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        crm_user_id: true,
        is_active: true,
        token_version: true,
        role: { select: { name: true } },
      },
    });

    if (!user || !user.is_active || user.token_version !== payload.tv) {
      throw new UnauthorizedException();
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      crm_user_id: user.crm_user_id,
      role: [user.role.name],
    };
  }
}
