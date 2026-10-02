import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { LoggerService } from 'src/infrastructure/logger/logger.service';
import { ChangePasswordDto, ResetPasswordDto, SignUpDto } from './dto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import * as argon from 'argon2';
import { ActivitiesService } from 'src/activities/activities.service';
import { CrmApiClient } from 'src/infrastructure/crm/crm-api.client';

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  /** email -> recent failures; per-process, complements the per-IP throttle. */
  private readonly failedLogins = new Map<
    string,
    { count: number; lockedUntil: number; last: number }
  >();
  private dummyHash: Promise<string> | null = null;

  constructor(
    private prisma: PrismaService,
    private logger: LoggerService,
    private jwt: JwtService,
    private config: ConfigService,
    private activity: ActivitiesService,
    private crmApi: CrmApiClient,
  ) {}

  async signUp(dto: SignUpDto) {
    const role = await this.prisma.role.findUnique({
      where: { id: dto.role_id },
      select: { id: true, deleted_at: true },
    });
    if (!role || role.deleted_at) {
      throw new BadRequestException('Unknown role');
    }

    const skipCrmValidation =
      this.config.get('SKIP_CRM_VALIDATION') === 'true' &&
      this.config.get('NODE_ENV') !== 'production';
    if (!skipCrmValidation) {
      const crmUser = await this.crmApi.request(
        'GET',
        `/users/${encodeURIComponent(dto.crm_user_id)}`,
      );
      if (!crmUser.ok) {
        throw new NotFoundException('CRM user not found');
      }
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          crm_user_id: dto.crm_user_id,
          email: dto.email.trim().toLowerCase(),
          name: dto.name.trim(),
          phone: dto.phone.trim(),
          password: await argon.hash(dto.password),
          role_id: role.id,
        },
      });
      delete user.password;
      delete user.token_version;
      this.logger.log('AuthService', `User created ${user.id}`);
      return { message: 'User created', user };
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ForbiddenException(
          'A user with these details already exists',
        );
      }
      throw e;
    }
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.user_id },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: await argon.hash(dto.new_password),
        token_version: { increment: 1 },
      },
    });
    this.failedLogins.delete(user.email.toLowerCase());
    await this.activity.createUserLog('Password reset', user);
    return { message: 'Password reset' };
  }

  async login(dto: { email: string; password: string }) {
    const email = String(dto.email ?? '')
      .trim()
      .toLowerCase();
    this.assertNotLocked(email);

    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      include: { role: { select: { id: true, name: true } } },
    });

    // Verify against a dummy hash for unknown emails so response time does not
    // reveal which accounts exist.
    const hash = user?.password ?? (await this.getDummyHash());
    const match = await argon
      .verify(hash, String(dto.password ?? ''))
      .catch(() => false);

    if (!user || !match) {
      this.recordFailedLogin(email);
      throw new ForbiddenException('Invalid credentials');
    }
    if (!user.is_active) {
      throw new ForbiddenException(
        'This account has been deactivated. Contact your administrator.',
      );
    }
    this.failedLogins.delete(email);

    delete user.password;

    if (user.role.name === 'Technician') {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          availability: true,
          presence: 'ONLINE',
          busy_comment: null,
          busy_until: null,
        },
      });
      user.availability = true;
      user.presence = 'ONLINE';
    }

    await this.activity.createUserLog('User logged in', user);

    const { token_version, ...publicUser } = user;
    return {
      statusCode: 200,
      message: 'User logged in',
      access_token: await this.generateToken(
        user.id,
        user.email,
        user.crm_user_id,
        [user.role.name],
        token_version,
      ),
      user: publicUser,
    };
  }

  /** Revokes every token issued to the user (all devices). */
  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { token_version: { increment: 1 } },
    });
    return { message: 'Logged out' };
  }

  async changePassword(user: { id: string }, dto: ChangePasswordDto) {
    const existing = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { role: { select: { name: true } } },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const match = await argon
      .verify(existing.password, dto.old_password)
      .catch(() => false);
    if (!match) {
      throw new ForbiddenException('Current password is incorrect');
    }
    if (dto.old_password === dto.new_password) {
      throw new BadRequestException('New password cannot be the same as old');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: await argon.hash(dto.new_password),
        token_version: { increment: 1 },
      },
    });

    await this.activity.createUserLog('Password updated', existing);

    // Other sessions are revoked; this device continues with a fresh token.
    return {
      message: 'Password updated',
      access_token: await this.generateToken(
        updated.id,
        updated.email,
        updated.crm_user_id,
        [existing.role.name],
        updated.token_version,
      ),
    };
  }

  async getRoles() {
    return this.prisma.role.findMany({
      where: { deleted_at: null },
      select: { id: true, name: true },
    });
  }

  async generateToken(
    user_id: string,
    email: string,
    crm_user_id: string,
    Roles: string[],
    tokenVersion: number,
  ) {
    return this.jwt.sign(
      { sub: user_id, email, crm_user_id, Roles, tv: tokenVersion },
      {
        expiresIn: this.config.get<string>('JWT_EXPIRES_IN') || '7d',
        secret: this.config.get('JWT_SECRET'),
        algorithm: 'HS256',
      },
    );
  }

  private assertNotLocked(email: string) {
    const entry = this.failedLogins.get(email);
    if (entry && entry.lockedUntil > Date.now()) {
      const minutes = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
      throw new HttpException(
        `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailedLogin(email: string) {
    const now = Date.now();
    const entry = this.failedLogins.get(email);
    const count = entry && now - entry.last < LOCKOUT_MS ? entry.count + 1 : 1;
    this.failedLogins.set(email, {
      count,
      last: now,
      lockedUntil: count >= MAX_FAILED_LOGINS ? now + LOCKOUT_MS : 0,
    });
    if (count >= MAX_FAILED_LOGINS) {
      this.logger.error(
        'AuthService',
        'Account temporarily locked after failed logins',
      );
    }
    if (this.failedLogins.size > 10000) {
      for (const [key, value] of this.failedLogins) {
        if (now - value.last > LOCKOUT_MS) this.failedLogins.delete(key);
      }
    }
  }

  private getDummyHash() {
    if (!this.dummyHash) {
      this.dummyHash = argon.hash(`dummy-${Math.random()}`);
    }
    return this.dummyHash;
  }
}
