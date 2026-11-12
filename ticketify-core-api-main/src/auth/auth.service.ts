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
import { canSignIn, resolveAccess, UserAccess } from './access/access';
import { normalizeOverrides } from './access/permissions';
import { ROLE_ACCESS_SELECT } from './strategy/jwt.strategy';

/** Per email + client IP, so one person cannot lock someone else out. */
const MAX_FAILED_LOGINS = 5;
/** Per email across all IPs: stops a distributed guessing attack on one account. */
const MAX_FAILED_LOGINS_PER_ACCOUNT = 30;
const LOCKOUT_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  /** `email|ip` and `email` -> recent failures; per-process, complements the per-IP throttle. */
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

  async signUp(dto: SignUpDto, actor?: { access?: UserAccess }) {
    const role = await this.prisma.role.findUnique({
      where: { id: dto.role_id },
      select: {
        id: true,
        deleted_at: true,
        full_access: true,
        permissions: { select: { screen: true, level: true } },
      },
    });
    if (!role || role.deleted_at) {
      throw new BadRequestException('Unknown role');
    }
    if (role.full_access && !actor?.access?.full) {
      throw new ForbiddenException(
        'Only full-access administrators can create full-access users',
      );
    }
    const overrides = normalizeOverrides(role, dto.permissions);

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
          permissions: { create: overrides },
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

  async resetPassword(dto: ResetPasswordDto, actor?: { access?: UserAccess }) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.user_id },
      include: { role: { select: { full_access: true } } },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role.full_access && !actor?.access?.full) {
      throw new ForbiddenException(
        'Only full-access administrators can reset this password',
      );
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: await argon.hash(dto.new_password),
        token_version: { increment: 1 },
      },
    });
    this.clearFailedLogins(user.email.toLowerCase());
    await this.activity.createUserLog('Password reset', user);
    return { message: 'Password reset' };
  }

  async login(dto: { email: string; password: string }, ip = 'unknown') {
    const email = String(dto.email ?? '')
      .trim()
      .toLowerCase();
    const clientKey = `${email}|${ip}`;
    this.assertNotLocked(clientKey);
    this.assertNotLocked(email);

    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      include: {
        role: { select: { id: true, ...ROLE_ACCESS_SELECT } },
        permissions: { select: { screen: true, level: true } },
      },
    });

    // Verify against a dummy hash for unknown emails so response time does not
    // reveal which accounts exist.
    const hash = user?.password ?? (await this.getDummyHash());
    const match = await argon
      .verify(hash, String(dto.password ?? ''))
      .catch(() => false);

    if (!user || !match) {
      this.recordFailedLogin(clientKey, MAX_FAILED_LOGINS);
      this.recordFailedLogin(email, MAX_FAILED_LOGINS_PER_ACCOUNT);
      throw new ForbiddenException('Invalid credentials');
    }
    if (!user.is_active) {
      throw new ForbiddenException(
        'This account has been deactivated. Contact your administrator.',
      );
    }
    const access = resolveAccess(user.role, user.permissions);
    if (!canSignIn(access)) {
      throw new ForbiddenException(
        'This account has no screens assigned. Contact your administrator.',
      );
    }
    this.clearFailedLogins(email);

    delete user.password;

    if (access.field_technician) {
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

    const { token_version, role, ...rest } = user;
    const publicUser = {
      ...rest,
      permissions: undefined,
      role: { id: role.id, name: role.name },
    };
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
      access,
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
        expiresIn: this.config.get<string>('JWT_EXPIRES_IN') || '12h',
        secret: this.config.get('JWT_SECRET'),
        algorithm: 'HS256',
      },
    );
  }

  private clearFailedLogins(email: string) {
    this.failedLogins.delete(email);
    for (const key of this.failedLogins.keys()) {
      if (key.startsWith(`${email}|`)) this.failedLogins.delete(key);
    }
  }

  private assertNotLocked(key: string) {
    const entry = this.failedLogins.get(key);
    if (entry && entry.lockedUntil > Date.now()) {
      const minutes = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
      throw new HttpException(
        `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailedLogin(key: string, limit: number) {
    const now = Date.now();
    const entry = this.failedLogins.get(key);
    const count = entry && now - entry.last < LOCKOUT_MS ? entry.count + 1 : 1;
    this.failedLogins.set(key, {
      count,
      last: now,
      lockedUntil: count >= limit ? now + LOCKOUT_MS : 0,
    });
    if (count === limit) {
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
