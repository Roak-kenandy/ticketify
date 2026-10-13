import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { ActivitiesService } from 'src/activities/activities.service';
import { CreateLocationTrackDto } from './dto/create-location-track';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from 'src/infrastructure/logger/logger.service';
import {
  TechnicianDetailsDto,
  TechnicianLocationTracking,
  TRACKING_STATE_SELECT,
  TrackingState,
} from './dto/technician-details.dto';
import { UpdatePresenceDto } from 'src/config/dto/update-presence.dto';
import { TechnicianPresence } from '@prisma/client';
import {
  DEFAULT_PREFERENCES,
  UpdatePreferencesDto,
  type UserPreferences,
} from './dto/update-preferences.dto';

import { randomBytes } from 'crypto';
import { evaluateFix, normalizeAccuracy, PendingMove } from './location-filter';

@Injectable()
export class UserService {
  /** Per-technician move held back until consecutive fixes confirm it. */
  private readonly pendingMoves = new Map<string, PendingMove>();

  constructor(
    private prisma: PrismaService,
    private activity: ActivitiesService,
    private logger: LoggerService,
    private config: ConfigService,
  ) {}

  private normalizePreferences(stored: unknown): UserPreferences {
    const value = stored && typeof stored === 'object' ? (stored as Partial<UserPreferences>) : {};
    return { ...DEFAULT_PREFERENCES, ...value };
  }

  async getPreferences(userId: string): Promise<UserPreferences> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.normalizePreferences(user.preferences);
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto): Promise<UserPreferences> {
    const current = await this.getPreferences(userId);
    const next = { ...current, ...dto };
    await this.prisma.user.update({
      where: { id: userId },
      data: { preferences: next },
    });
    return next;
  }

  async getMe(user: any) {
    const get_user = await this.prisma.user.findUnique({
      where: {
        id: user.id,
      },
      include: {
        role: {
          select: {
            name: true,
          },
        },
        user_log: {
          orderBy: {
            created_at: 'desc',
          },
          take: 5,
        },
        user_tickets: {
          orderBy: {
            created_at: 'desc',
          },
          take: 5,
        },
        user_location_tracking: {
          orderBy: {
            created_at: 'desc',
          },
          take: 5,
        },
      },
    });
    if (!get_user) {
      throw new UnauthorizedException('Account no longer exists');
    }

    delete get_user.password;
    delete get_user.token_version;

    return {
      ...get_user,
    };
  }

  async getUserById(id: string) {
    let get_user = await this.findOne(id);

    if (!get_user) {
      throw new ForbiddenException('User not found');
    }

    delete get_user.password;
    delete get_user.token_version;

    return {
      ...get_user,
    };
  }

  async updateStatus(
    status: {
      status: 'AVAILABLE' | 'UNAVAILABLE' | 'BREAK' | 'OFFLINE';
    },
    user: any,
  ) {
    const update_user = await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        availability: status.status === 'AVAILABLE',
      },
    });

    if (!update_user) {
      throw new ForbiddenException('Status not updated');
    }

    void this.activity
      .createUserLog(
        `User went ${update_user.availability ? 'online' : 'offline'}`,
        user,
      )
      .catch(() => {});

    return {
      ...update_user,
    };
  }

  async updatePresence(dto: UpdatePresenceDto, user: { id: string }) {
    if (dto.presence === TechnicianPresence.BUSY && !dto.busy_comment?.trim()) {
      throw new ForbiddenException('Workload comment required when busy');
    }

    const update_user = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        presence: dto.presence,
        availability: dto.presence === TechnicianPresence.ONLINE,
        busy_comment:
          dto.presence === TechnicianPresence.BUSY ? dto.busy_comment?.trim() : null,
        busy_until:
          dto.presence === TechnicianPresence.BUSY && dto.busy_until
            ? new Date(dto.busy_until)
            : null,
      },
    });

    if (!update_user) {
      throw new ForbiddenException('Presence not updated');
    }

    const label =
      dto.presence === TechnicianPresence.ONLINE
        ? 'online (green)'
        : dto.presence === TechnicianPresence.BUSY
          ? 'busy (yellow)'
          : 'offline (red)';

    void this.activity
      .createUserLog(`Technician set status to ${label}`, user)
      .catch(() => {});

    const { password: _pw, ...safeUser } = update_user;
    return safeUser;
  }

  async getTechnicians() {
    const technicians = await this.prisma.user.findMany({
      where: {
        role_id: '2',
      },
      include: {
        user_location_tracking: {
          orderBy: {
            created_at: 'desc',
          },
          take: 1,
        },
        tracking_device: { select: TRACKING_STATE_SELECT },
      },
    });

    return technicians.map((technician) => {
      delete technician.password;
      delete technician.token_version;
      return technician;
    });
  }

  async getOnlineTechnicians() {
    return this.getAutoAssignEligibleTechnicians();
  }

  private autoAssignExcludedCrmIds(): Set<string> {
    const raw = this.config.get<string>('AUTO_ASSIGN_EXCLUDE_CRM_USER_IDS') ?? '';
    return new Set(
      raw
        .split(',')
        .map(id => id.trim())
        .filter(Boolean),
    );
  }

  /**
   * Auto-assign pool: technicians who are ONLINE (green). BUSY (yellow) only when the
   * dispatch setting allows it; OFFLINE (red) never. Excluded CRM ids are not permitted.
   */
  async getAutoAssignEligibleTechnicians(
    teamCrmUserIds?: string[],
    options?: { includeBusy?: boolean },
  ) {
    const excluded = this.autoAssignExcludedCrmIds();
    const where: {
      role_id: string;
      presence: { in: ('ONLINE' | 'BUSY')[] };
      crm_user_id?: { in: string[] };
    } = {
      role_id: '2',
      presence: { in: options?.includeBusy ? ['ONLINE', 'BUSY'] : ['ONLINE'] },
    };

    if (teamCrmUserIds?.length) {
      where.crm_user_id = { in: teamCrmUserIds };
    }

    const technicians = await this.prisma.user.findMany({
      where,
      include: {
        user_location_tracking: {
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
    });

    return technicians
      .filter(t => !excluded.has(t.crm_user_id))
      .map((technician) => {
        delete technician.password;
        delete technician.token_version;
        return technician;
      });
  }

  async fetchCrmTeamMemberIds(team_id: string): Promise<string[]> {
    const base = this.config.get<string>('CRM_BACKOFFICE_API_URL') ?? '';
    const crm_users = await fetch(
      `${base.replace(/\/$/, '')}/users?teams=${team_id}&size=100`,
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );

    if (!crm_users.ok) {
      this.logger.error('User Service', 'CRM team users not found');
      return [];
    }

    const crm_users_data = await crm_users.json();
    const content = crm_users_data?.content ?? [];
    return content
      .map((u: { id?: string }) => u.id)
      .filter((id: string | undefined): id is string => Boolean(id));
  }

  async getTechniciansByAvailability(
    availability: 'AVAILABLE' | 'UNAVAILABLE' | 'BREAK' | 'OFFLINE',
  ) {
    const technicians = await this.prisma.user.findMany({
      where: {
        availability: availability === 'AVAILABLE' ? true : false,
      },
    });

    return technicians;
  }

  async crmGetUser(user_id: any) {
    let crm_get_user: Response;
    try {
      crm_get_user = await fetch(
        this.config.get('CRM_BACKOFFICE_API_URL') + '/users/' + user_id,
        {
          headers: {
            content_type: 'application/json',
            api_key: this.config.get('CRM_API_KEY'),
          },
          signal: AbortSignal.timeout(
            Number(this.config.get('CRM_REQUEST_TIMEOUT_MS') ?? 15_000),
          ),
        },
      );
    } catch (error) {
      this.logger.error('User Service', `CRM user ${user_id} request failed: ${error}`);
      throw new ServiceUnavailableException('CRM did not respond in time. Try again shortly.');
    }

    if (!crm_get_user.ok) {
      this.logger.error('User Service', `CRM user ${user_id} not found (${crm_get_user.status})`);
      return new ForbiddenException('CRM User not found');
    }

    return crm_get_user.json();
  }

  private parseLocationRecordedAt(raw?: string): Date {
    if (!raw?.trim()) {
      return new Date();
    }
    const parsed = new Date(raw);
    const now = Date.now();
    // Older Android builds sent local time with a 'Z' suffix, which lands in
    // the future and would pin the map to a stale point for hours.
    const maxClockSkewMs = 2 * 60 * 1000;
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getTime() - now > maxClockSkewMs
    ) {
      return new Date(now);
    }
    return parsed;
  }

  async addLocationTracking(location: CreateLocationTrackDto, user: any) {
    try {
      this.logger.log(
        'User Service',
        `User ${user.name} is adding location tracking`,
      );

      const recordedAt = this.parseLocationRecordedAt(location.timestamp);
      const ageMs = Date.now() - recordedAt.getTime();
      const maxAgeMs = 8 * 60 * 60 * 1000;
      if (ageMs > maxAgeMs) {
        this.logger.warn(
          'User Service',
          `Skipping stale location (${Math.round(ageMs / 60000)}m old) for user ${user.id}`,
        );
        const latest = await this.prisma.userLocationTracking.findFirst({
          where: { user_id: user.id },
          orderBy: { created_at: 'desc' },
        });
        return latest ?? { skipped: true };
      }

      const latest = await this.prisma.userLocationTracking.findFirst({
        where: { user_id: user.id },
        orderBy: { created_at: 'desc' },
      });
      if (location.mock) {
        this.logger.warn('User Service', `Rejected mock location for user ${user.id}`);
        return latest ?? { skipped: true };
      }

      const accuracy = normalizeAccuracy(location.accuracy);
      const decision = evaluateFix(
        {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy,
          at: recordedAt,
        },
        latest,
        this.pendingMoves.get(user.id) ?? null,
      );
      if (decision.action !== 'store') {
        if (decision.action === 'hold') {
          this.pendingMoves.set(user.id, decision.pending);
        }
        this.logger.warn(
          'User Service',
          `Location not applied for user ${user.id}: ${
            decision.action === 'hold'
              ? `implausible jump, waiting for confirmation (${decision.pending.count})`
              : decision.reason
          }${accuracy !== null ? `, ±${Math.round(accuracy)} m` : ''}`,
        );
        return latest ?? { skipped: true };
      }
      this.pendingMoves.delete(user.id);

      return await this.prisma.userLocationTracking.create({
        data: {
          user_id: user.id,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy,
          created_at: recordedAt,
        },
      });
    } catch (error) {
      this.logger.error(
        'User Service',
        `Failed to add location tracking for user ${user.id}: ${error.message}`,
      );
      throw new ForbiddenException('Failed to add location tracking');
    }
  }

  private trackingServerUrl(): string | null {
    const explicit = this.config.get<string>('TRACCAR_SERVER_URL')?.trim();
    if (explicit) {
      return explicit.replace(/\/+$/, '');
    }
    const base = this.config
      .get<string>('PUBLIC_API_BASE_URL')
      ?.trim()
      .replace(/\/+$/, '');
    if (!base) {
      return null;
    }
    return base.endsWith('/api/v1')
      ? `${base}/tracking/traccar`
      : `${base}/api/v1/tracking/traccar`;
  }

  private newTrackingDeviceId(): string {
    return `tk-${randomBytes(9).toString('hex')}`;
  }

  /** Traccar Client settings for the signed-in technician; issues a device id on first use. */
  async getTrackingSetup(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { presence: true, tracking_device: { select: { device_id: true, ...TRACKING_STATE_SELECT } } },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const deviceId =
      user.tracking_device?.device_id ??
      (
        await this.prisma.trackingDevice.upsert({
          where: { user_id: userId },
          create: { user_id: userId, device_id: this.newTrackingDeviceId() },
          update: {},
        })
      ).device_id;
    const last = await this.prisma.userLocationTracking.findFirst({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: { created_at: true, accuracy: true },
    });
    return {
      device_id: deviceId,
      server_url: this.trackingServerUrl(),
      presence: user.presence,
      last_point_at: last?.created_at ?? null,
      last_point_accuracy: last?.accuracy ?? null,
      last_seen_at: user.tracking_device?.last_seen_at ?? null,
      is_moving: user.tracking_device?.is_moving ?? null,
      motion_since: user.tracking_device?.motion_since ?? null,
      battery_level: user.tracking_device?.battery_level ?? null,
      is_charging: user.tracking_device?.is_charging ?? null,
      // Moving: a point every minute (Android applies Interval only when Distance is 0).
      // Stopped: stop detection pauses GPS to save battery and the heartbeat keeps checking in;
      // Android may stretch the heartbeat to ~10 min, which the signal rules allow for.
      recommended: {
        distance_m: 0,
        interval_s: 60,
        stop_detection: true,
        heartbeat_s: 300,
        wake_lock: true,
        accuracy: 'high',
      },
    };
  }

  /** Issues a new device id, e.g. after a phone is lost; the old id stops being accepted. */
  async resetTrackingDevice(userId: string) {
    const deviceId = this.newTrackingDeviceId();
    await this.prisma.trackingDevice.upsert({
      where: { user_id: userId },
      create: { user_id: userId, device_id: deviceId },
      update: { device_id: deviceId },
    });
    this.pendingMoves.delete(userId);
    return this.getTrackingSetup(userId);
  }

  /**
   * Stores a Traccar Client fix through the same filter as app-posted points.
   * Points are kept only while the technician is on shift (Available or Busy).
   */
  async recordTrackerFix(
    deviceId: string,
    fix: {
      latitude: number;
      longitude: number;
      accuracy: number | null;
      timestamp?: string;
      mock: boolean;
      isMoving?: boolean | null;
      battery?: number | null;
      charging?: boolean | null;
    },
  ): Promise<'stored' | 'off_shift' | 'unknown_device'> {
    const device = await this.prisma.trackingDevice.findUnique({
      where: { device_id: deviceId },
      select: {
        is_moving: true,
        user: { select: { id: true, name: true, is_active: true, presence: true } },
      },
    });
    const user = device?.user;
    if (!user || !user.is_active) {
      return 'unknown_device';
    }
    // Updated even off shift, so a technician who goes back to Available while parked is not
    // reported as silent: the stationary heartbeat keeps proving the phone is alive.
    const now = new Date();
    const motionKnown = typeof fix.isMoving === 'boolean';
    await this.prisma.trackingDevice.update({
      where: { device_id: deviceId },
      data: {
        last_seen_at: now,
        ...(motionKnown ? { is_moving: fix.isMoving } : {}),
        ...(motionKnown && fix.isMoving !== device.is_moving ? { motion_since: now } : {}),
        ...(typeof fix.battery === 'number' ? { battery_level: fix.battery } : {}),
        ...(typeof fix.charging === 'boolean' ? { is_charging: fix.charging } : {}),
      },
    });
    if (user.presence === TechnicianPresence.OFFLINE) {
      return 'off_shift';
    }
    await this.addLocationTracking(
      {
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy: fix.accuracy ?? undefined,
        timestamp: fix.timestamp,
        mock: fix.mock,
        provider: 'traccar',
      },
      user,
    );
    return 'stored';
  }

  
  findOne(id: string) {
    return this.prisma.user.findUnique({
      where: {
        id: id,
      },
      include: {
        role: {
          select: {
            name: true,
          },
        },
        user_log: {
          orderBy: {
            created_at: 'desc',
          },
          take: 5,
        },
        user_tickets: {
          orderBy: {
            created_at: 'desc',
          },
          take: 5,
        },
        user_location_tracking: {
          orderBy: {
            created_at: 'desc',
          },
          take: 5,
        },
        feedbacks: {
          orderBy: {
            created_at: 'desc',
          },
          take: 50,
        },
      },
    });
  }

  async findOneByCrmId(crm_user_id: string) {
    let user = await this.prisma.user.findFirst({
      where: {
        crm_user_id: crm_user_id,
      },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    return user;
  }

  async getUserStats() {
     //  <p className="text-2xl font-bold">{stats.totalUsers}</p>
          //  <p className="text-2xl font-bold">{stats.activeUsers}</p>
          //  <p className="text-2xl font-bold">{stats.newUsersThisMonth}</p>
    const totalUsers = await this.prisma.user.count();
    const activeUsers = await this.prisma.user.count({
      where: {
        availability: true,
      },
    });
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const newUsersThisMonth = await this.prisma.user.count({
      where: {
        created_at: {
          gte: startOfMonth,
        },
      },
    });
    return {
      totalUsers,
      activeUsers,
      newUsersThisMonth,
    };
  }


  async getAllUsers(
    filters: {
      search?: string;
      role?: string;
      availability?: 'AVAILABLE' | 'UNAVAILABLE' | 'BREAK' | 'OFFLINE';
      status?: 'ACTIVE' | 'INACTIVE';
      page?: number;
      limit?: number;
    },
  ) {
    const users = await this.prisma.user.findMany({
      include: {
        role: {
          select: {
            name: true,
          },
        },

      },
      where: {
        AND: [
          filters.search
            ? {
                OR: [
                  {
                    name: {
                      contains: filters.search,
                      mode: 'insensitive',
                    },
                  },
                  {
                    email: {
                      contains: filters.search,
                      mode: 'insensitive',
                    },
                  },
                  {
                    phone: {
                      contains: filters.search,
                      mode: 'insensitive',
                    },
                  },
                ],
              }
            : {},
          filters.role
            ? {
                role: {
                  name: {
                    equals: filters.role,
                    mode: 'insensitive',
                  },
                },
              }
            : {},
          filters.availability
            ? {
                availability:
                  filters.availability === 'AVAILABLE' ? true : false,
              }
            : {},
          filters.status
            ? { is_active: filters.status === 'ACTIVE' }
            : {},
        ],
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return users.map((user) => {
      delete user.password;
      delete user.token_version;
      return user;
    });
  }

  async getTechnicianDetails(user_id: string): Promise<TechnicianDetailsDto> {
    try {
      this.logger.log('User Service', `Fetching technician details for user: ${user_id}`);

      // Get user details
      const user = await this.prisma.user.findUnique({
        where: {
          id: user_id,
        },
        include: {
          role: {
            select: {
              name: true,
            },
          },
          feedbacks: {
            orderBy: {
              created_at: 'desc',
            },
          },
        },
      });

      if (!user) {
        throw new ForbiddenException('User not found');
      }

      if (user.role.name.toLowerCase() !== 'technician') {
        throw new ForbiddenException('User is not a technician');
      }

      // Fetch service tickets from CRM
      const allTickets = await this.fetchUserServiceTickets(user.crm_user_id);
      
      // Calculate ticket counts
      const newTickets = allTickets.filter(ticket => ticket.state === 'NEW');
      const inProgressTickets = allTickets.filter(ticket => ticket.state === 'IN_PROGRESS');
      const closedTickets = allTickets.filter(ticket => ticket.state === 'CLOSED');

      // Calculate ratings
      const totalFeedbacks = user.feedbacks.length;
      const totalRating = user.feedbacks.reduce((sum, feedback) => sum + feedback.rating, 0);
      const averageRating = totalFeedbacks > 0 ? totalRating / totalFeedbacks : 0;

      // Fetch location tracking data for last 8 hours
      const locationData = await this.fetchUserLocationTracking(user_id);

      const { password, token_version, ...userWithoutPassword } = user as any;

      const technicianDetails: TechnicianDetailsDto = {
        user: userWithoutPassword,
        serviceTickets: {
          total: allTickets.length,
          new: newTickets.length,
          in_progress: inProgressTickets.length,
          closed: closedTickets.length,
          tickets: allTickets.slice(0, 20), // Limit to recent 20 tickets
        },
        ratings: {
          totalRating,
          averageRating: Math.round(averageRating * 100) / 100, // Round to 2 decimal places
          totalFeedbacks,
          feedbacks: user.feedbacks.slice(0, 10), // Limit to recent 10 feedbacks
        },
        locationTracking: locationData,
      };

      this.logger.log('User Service', `Technician details fetched successfully for user: ${user_id}`);
      return technicianDetails;
    } catch (error) {
      this.logger.error(
        'User Service',
        `Failed to fetch technician details for user ${user_id}: ${error.message}`,
      );
      throw new ForbiddenException('Failed to fetch technician details');
    }
  }

  private async fetchUserServiceTickets(crm_user_id: string): Promise<any[]> {
    try {
      // Fetch tickets from CRM API
      const response = await fetch(
        `${this.config.get('CRM_BACKOFFICE_API_URL')}/service_requests?assigned_to_user_id=${crm_user_id}&size=100`,
        {
          headers: {
            'content-type': 'application/json',
            'api_key': this.config.get('CRM_API_KEY'),
          },
        },
      );

      if (!response.ok) {
        this.logger.error('User Service', 'Failed to fetch user service tickets from CRM');
        return [];
      }

      const data = await response.json();
      return data.content || [];
    } catch (error) {
      this.logger.error('User Service', `Error fetching user service tickets: ${error.message}`);
      return [];
    }
  }

  private async fetchUserLocationTracking(user_id: string): Promise<{
    totalLocations: number;
    last8Hours: TechnicianLocationTracking[];
    currentLocation?: TechnicianLocationTracking;
    device?: TrackingState | null;
  }> {
    try {
      // Calculate 8 hours ago
      const eightHoursAgo = new Date();
      eightHoursAgo.setHours(eightHoursAgo.getHours() - 8);

      const [totalLocations, last8HoursLocations, currentLocation, device] = await Promise.all([
        this.prisma.userLocationTracking.count({ where: { user_id } }),
        this.prisma.userLocationTracking.findMany({
          where: { user_id, created_at: { gte: eightHoursAgo } },
          orderBy: { created_at: 'asc' },
        }),
        this.prisma.userLocationTracking.findFirst({
          where: { user_id },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.trackingDevice.findUnique({
          where: { user_id },
          select: TRACKING_STATE_SELECT,
        }),
      ]);

      return {
        totalLocations,
        last8Hours: last8HoursLocations.map((location) => ({
          id: location.id,
          latitude: location.latitude,
          longitude: location.longitude,
          created_at: location.created_at,
        })),
        currentLocation: currentLocation
          ? {
              id: currentLocation.id,
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
              created_at: currentLocation.created_at,
            }
          : undefined,
        device: device ?? null,
      };
    } catch (error) {
      this.logger.error(
        'User Service',
        `Error fetching user location tracking: ${error.message}`,
      );
      return {
        totalLocations: 0,
        last8Hours: [],
        currentLocation: undefined,
      };
    }
  }

  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: { select: { name: true } } },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (['Admin', 'Administrator'].includes(user.role.name)) {
      const admins = await this.prisma.user.count({
        where: {
          is_active: true,
          role: { name: { in: ['Admin', 'Administrator'] } },
        },
      });
      if (admins <= 1) {
        throw new BadRequestException('You cannot delete the last administrator');
      }
    }

    await this.prisma.$transaction([
      this.prisma.userLocationTracking.deleteMany({ where: { user_id: id } }),
      this.prisma.userLog.deleteMany({ where: { user_id: id } }),
      this.prisma.userTicket.deleteMany({ where: { user_id: id } }),
      this.prisma.userFeedback.deleteMany({ where: { user_id: id } }),
      this.prisma.user.delete({ where: { id } }),
    ]);

    this.logger.log(
      'User Service',
      `Deleted user ${user.email} (${user.role.name})`,
    );

    return { message: 'User deleted successfully' };
  }

  async toggleUserStatus(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: { select: { id: true, name: true } } },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const activate = !user.is_active;
    const updated = await this.prisma.user.update({
      where: { id },
      data: activate
        ? { is_active: true }
        : {
            is_active: false,
            availability: false,
            presence: 'OFFLINE',
            token_version: { increment: 1 },
          },
      include: { role: { select: { id: true, name: true } } },
    });

    delete updated.password;
    delete updated.token_version;

    await this.activity.createUserLog(
      `Admin ${activate ? 'activated' : 'deactivated'} the account`,
      updated,
    );

    return updated;
  }
}
