import {
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { LoggerService } from 'src/infrastructure/logger/logger.service';
import { SignUpDto } from './dto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import * as argon from 'argon2';
import { ActivitiesService } from 'src/activities/activities.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private logger: LoggerService,
    private jwt: JwtService,
    private config: ConfigService,
    private activity: ActivitiesService,
  ) {}

  async signUp(dto: SignUpDto) {
    try {
      const skipCrmValidation =
        this.config.get('SKIP_CRM_VALIDATION') === 'true';

      if (!skipCrmValidation) {
        const crm_user = await fetch(
          this.config.get('CRM_BACKOFFICE_API_URL') +
            '/users/' +
            dto.crm_user_id,
          {
            headers: {
              content_type: 'application/json',
              api_key: this.config.get('CRM_API_KEY'),
            },
          },
        );

        if (!crm_user.ok) {
          this.logger.error('AuthService', 'CRM User not found');
          throw new NotFoundException('CRM User not found');
        }

        this.logger.log('AuthService', 'CRM User found');
      } else {
        this.logger.log(
          'AuthService',
          'Skipping CRM validation (local development)',
        );
      }

      const user = await this.prisma.user.create({
        data: {
          crm_user_id: dto.crm_user_id,
          email: dto.email,
          name: dto.name,
          phone: dto.phone,
          password: await argon.hash(dto.password),
          role_id: dto.role_id,
        },
      });

      if (!user) {
        this.logger.error('AuthService', 'User not created' + user);
        throw new HttpException('User not created', 500);
      }

      delete user.password;

      this.logger.log('AuthService', 'User created' + user);

      return {
        message: 'User created',
        user,
      };
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError) {
        if (e.code === 'P2002') {
          this.logger.error(
            'AuthService',
            e.meta.target[0] + ' already exists',
          );
          throw new ForbiddenException(e.meta.target[0] + ' already exists');
        }
      }
      throw e;
    }
  }

  async resetPassword(dto: { user_id: string; new_password: string }) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: dto.user_id,
      },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    // change the password
    const updated = await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        password: await argon.hash(dto.new_password),
      },
    });

    if (!updated) {
      throw new ForbiddenException('Password not updated');
    }

    await this.activity.createUserLog('Password reset', user);

    return {
      message: 'Password reset',
    };
  }

  async login(dto: { email: string; password: string }) {
    // TODO: encrypt password before sending to the database
    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email,
      },
      include: {
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user) {
      throw new ForbiddenException('Invalid credentials');
    }

    const match = await argon.verify(user.password, dto.password);

    if (!match) {
      throw new ForbiddenException('Invalid credentials');
    }

    delete user.password;

    if (user.role.name === 'Technician') {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { availability: true, presence: 'ONLINE', busy_comment: null, busy_until: null },
      });
      user.availability = true;
      user.presence = 'ONLINE';
    }

    await this.activity.createUserLog('User logged in', user);

    return {
      statusCode: 200,
      message: 'User logged in',
      access_token: await this.generateToken(
        user.id,
        user.email,
        user.crm_user_id,
        [user.role.name],
      ),
      user,
    };
  }

  async changePassword(
    user: any,
    dto: {
      old_password: string;
      new_password: string;
    },
  ) {
    const existing_user = await this.prisma.user.findFirst({
      where: {
        id: user.id,
      },
    });

    if (!existing_user) {
      throw new ForbiddenException('User not found');
    }

    const match = await argon.verify(existing_user.password, dto.old_password);

    const same = await argon.verify(existing_user.password, dto.new_password);

    if (same) {
      throw new ForbiddenException('New password cannot be the same as old');
    }

    if (!match) {
      throw new ForbiddenException('Invalid credentials');
    }

    // change the password
    const updated = await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        password: await argon.hash(dto.new_password),
      },
    });

    if (!updated) {
      throw new ForbiddenException('Password not updated');
    }

    await this.activity.createUserLog('Password updated', user);

    return {
      message: 'Password updated',
    };
  }

  async getRoles() {
    const roles = await this.prisma.role.findMany({
      select: {
        id: true,
        name: true,
      },
    });

    return roles;
  }

  async generateToken(
    user_id: string,
    email: string,
    crm_user_id: string,
    Roles: any[],
  ) {
    const payload = {
      sub: user_id,
      email,
      crm_user_id,
      Roles,
    };

    const token = await this.jwt.sign(payload, {
      // dont expire the token
      expiresIn: '365d',
      secret: this.config.get('JWT_SECRET'),
    });

    return token;
  }

  async generateRefreshToken(
    user_id: string,
    email: string,
    crm_user_id: string,
    Roles: any,
  ) {
    const payload = {
      sub: user_id,
      email,
      crm_user_id,
      Roles,
    };

    const token = await this.jwt.sign(payload, {
      expiresIn: '365d',
      secret: this.config.get('JWT_REFRESH_SECRET'),
    });

    return token;
  }
}
