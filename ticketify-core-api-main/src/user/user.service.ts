import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { ActivitiesService } from 'src/activities/activities.service';
import { CreateLocationTrackDto } from './dto/create-location-track';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from 'src/infrastructure/logger/logger.service';
import { TechnicianDetailsDto, TechnicianLocationTracking } from './dto/technician-details.dto';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private activity: ActivitiesService,
    private logger: LoggerService,
    private config: ConfigService,
  ) {}

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
    console.log('User', get_user);

    delete get_user.password;

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
      return technician;
    });
  }

  async getTechniciansByTeam(team_id: string) {
    console.log('Team ID', team_id);

    const crm_users = await fetch(
      `https://app.crm.com/backoffice/v2/users?teams=${team_id}&size=100&user_roles=a23492ca-89f7-4ccc-92c0-387a61ab1802`,
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );

    if (!crm_users.ok) {
      this.logger.error('Ticket Service', 'CRM User not found');
      return new ForbiddenException('CRM User not found');
    }

    const crm_users_data = await crm_users.json();

    // Use Promise.all to wait for all user async operations to complete
    const updatedCrmUsers = await Promise.all(
      crm_users_data?.content.map(async (crm_user) => {
        // Retrieve user details for each crm_user
        const user = await this.prisma.user.findFirst({
          where: {
            crm_user_id: crm_user.id,
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

        // Add additional fields to crm_user
        crm_user['user_id'] = user?.id || 'null';
        crm_user['availability'] = user?.availability || false;
        crm_user['location'] = user?.user_location_tracking[0] || null;

        return crm_user;
      }),
    );

    return updatedCrmUsers; // Return the updated crm_users_data
  }

  async getOnlineTechnicians() {
    const technicians = await this.prisma.user.findMany({
      where: {
        role_id: '2',
        availability: true,
      },
    });

    return technicians.map((technician) => {
      delete technician.password;
      return technician;
    });
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
    let crm_get_user = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') + '/users/' + user_id,
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );

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

  async addLocationTracking(location: CreateLocationTrackDto, user: any) {
    try {
      this.logger.log(
        'User Service',
        `User ${user.name} is adding location tracking`,
      );

      const add_location = await this.prisma.userLocationTracking.create({
        data: {
          user_id: user.id,
          latitude: location.latitude,
          longitude: location.longitude,
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
        ],
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return users.map((user) => {
      delete user.password;
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

      // Filter locations from the last 8 hours
      const last8HoursLocations = allLocations.filter(
        (location) => new Date(location.created_at) >= eightHoursAgo,
      );

      // Get current location (most recent)
      const currentLocation = allLocations.length > 0 ? allLocations[0] : undefined;

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

    const updated = await this.prisma.user.update({
      where: { id },
      data: { availability: !user.availability },
      include: { role: { select: { id: true, name: true } } },
    });

    delete updated.password;

    await this.activity.createUserLog(
      `Admin toggled availability to ${updated.availability ? 'active' : 'inactive'}`,
      updated,
    );

    return updated;
  }
}
