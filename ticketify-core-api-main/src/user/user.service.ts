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
import { TechnicianDetailsDto, TechnicianLocationTracking } from './dto/technician-details.dto';
import { UpdatePresenceDto } from 'src/config/dto/update-presence.dto';
import { TechnicianPresence } from '@prisma/client';
import {
  DEFAULT_PREFERENCES,
  UpdatePreferencesDto,
  type UserPreferences,
} from './dto/update-preferences.dto';

@Injectable()
export class UserService {
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
      this.logger.error('Ticket Service', 'CRM User not found');
      return new ForbiddenException('CRM User not found');
    }

    this.logger.log(
      'Ticket Service',
      'CRM Service request found' + crm_get_user,
    );

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

      const add_location = await this.prisma.userLocationTracking.create({
        data: {
          user_id: user.id,
          latitude: location.latitude,
          longitude: location.longitude,
          created_at: recordedAt,
        },
      });

      this.logger.log(
        'User Service',
        `User ${user.id} added location tracking at latitude: ${location.latitude}, longitude: ${location.longitude}`,
      );

      return add_location;
    } catch (error) {
      this.logger.error(
        'User Service',
        `Failed to add location tracking for user ${user.id}: ${error.message}`,
      );
      throw new ForbiddenException('Failed to add location tracking');
    }
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

      // Remove password from user object
      const { password, ...userWithoutPassword } = user;

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
      throw new ForbiddenException(`Failed to fetch technician details: ${error.message}`);
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
  }> {
    try {
      // Calculate 8 hours ago
      const eightHoursAgo = new Date();
      eightHoursAgo.setHours(eightHoursAgo.getHours() - 8);

      // Fetch all location tracking records for the user
      const allLocations = await this.prisma.userLocationTracking.findMany({
        where: {
          user_id: user_id,
        },
        orderBy: {
          created_at: 'desc',
        },
      });

      // Filter locations from the last 8 hours (chronological for path UI)
      const last8HoursLocations = allLocations
        .filter(
          (location) => new Date(location.created_at) >= eightHoursAgo,
        )
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );

      // Get current location (most recent by GPS time)
      const currentLocation =
        allLocations.length > 0 ? allLocations[0] : undefined;

      this.logger.log(
        'User Service',
        `Found ${allLocations.length} total locations, ${last8HoursLocations.length} from last 8 hours for user: ${user_id}`,
      );

      return {
        totalLocations: allLocations.length,
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
