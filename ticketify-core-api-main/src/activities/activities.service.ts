import { Injectable, ForbiddenException } from '@nestjs/common';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from 'src/infrastructure/logger/logger.service';

@Injectable()
export class ActivitiesService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private logger: LoggerService,
  ) {}

  async createUserLog(activity: string, user: any) {
    let new_log = await this.prisma.userLog.create({
      data: {
        user_id: user.id,
        log: activity,
      },
    });

    if (!new_log) {
      return false;
    }

    return true;
  }

  createTicketLog(activity: string, ticket_id: any) {
    try {
      return this.prisma.ticketLog.create({
        data: {
          ticket_id: ticket_id,
          log: activity,
        },
      });
    } catch (error) {
      return false;
    }
  }

  async createActivity(createActivityDto: CreateActivityDto): Promise<any> {
    this.logger.log('Activities Service', 'Starting activity creation process');

    this.logger.log(
      'Activities Service',
      `Activity Data: ${JSON.stringify(createActivityDto)}`,
    );
    try {
      // Prepare the request body based on the provided attributes
      const activityData: any = {
        name: createActivityDto.name,
        description: createActivityDto.description,
        type_id: createActivityDto.type_id,
        custom_fields: createActivityDto.custom_fields || [],
        assigned_to: {
          user_id: createActivityDto.assigned_to?.user_id || null,
          team_id: createActivityDto.assigned_to?.team_id || null,
        },
        linked_to: createActivityDto.linked_to || [],
      };

      // Add optional fields if provided
      if (createActivityDto.date) {
        activityData.date = createActivityDto.date;
      }

      activityData.from_time = null;
      activityData.to_time = null;

      if (createActivityDto.address_id) {
        activityData.address_id = createActivityDto.address_id;
      }

      if (createActivityDto.notes) {
        activityData.notes = createActivityDto.notes;
      }

      this.logger.log('Activities Service', 'Creating activity via CRM API');
      this.logger.log('Activities Service', `Creating activity with data: ${JSON.stringify(activityData)}`);

      // Call the CRM API to create the activity
      const crmCreateActivity = await fetch(
        this.config.get('CRM_BACKOFFICE_API_URL') + '/activities',
        {
          method: 'POST',
          body: JSON.stringify(activityData),
          headers: {
            api_key: this.config.get('CRM_API_KEY'),
            accept: 'application/json',
            'Content-Type': 'application/json',
          },
        },
      );

      if (!crmCreateActivity.ok) {
        const errorText = await crmCreateActivity.text();
        this.logger.error(
          'Activities Service',
          `CRM Activity creation failed: ${errorText}`,
        );
        throw new ForbiddenException(
          `CRM Activity creation failed: ${errorText}`,
        );
      }

      const response = (await crmCreateActivity.json()) as { id?: string };
      this.logger.log(
        'Activities Service',
        'CRM Activity created successfully',
      );

      if (createActivityDto.notes?.trim() && response?.id) {
        await fetch(
          this.config.get('CRM_BACKOFFICE_API_URL') +
            `/activities/${response.id}/notes`,
          {
            method: 'POST',
            body: JSON.stringify({ note: createActivityDto.notes.trim() }),
            headers: {
              api_key: this.config.get('CRM_API_KEY'),
              accept: 'application/json',
              'Content-Type': 'application/json',
            },
          },
        );
      }

      return response;
    } catch (error) {
      this.logger.error(
        'Activities Service',
        `Error creating activity: ${error.message}`,
      );
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new ForbiddenException(`Error creating activity: ${error.message}`);
    }
  }

  async getActivityDetails(id: string): Promise<any> {
    try {
      this.logger.log(
        'Activities Service',
        `Fetching activity details for ID: ${id}`,
      );

      // Call the CRM API to get activity details
      const crmActivityDetails = await fetch(
        this.config.get('CRM_BACKOFFICE_API_URL') + `/activities/${id}`,
        {
          method: 'GET',
          headers: {
            api_key: this.config.get('CRM_API_KEY'),
            accept: 'application/json',
            'Content-Type': 'application/json',
          },
        },
      );

      if (!crmActivityDetails.ok) {
        if (crmActivityDetails.status === 404) {
          this.logger.error(
            'Activities Service',
            `Activity with ID ${id} not found`,
          );
          throw new ForbiddenException(`Activity with ID ${id} not found`);
        }

        const errorText = await crmActivityDetails.text();
        this.logger.error(
          'Activities Service',
          `Failed to fetch activity details: ${errorText}`,
        );
        throw new ForbiddenException(
          `Failed to fetch activity details: ${errorText}`,
        );
      }

      const activityDetails = await crmActivityDetails.json();
      this.logger.log(
        'Activities Service',
        'Activity details fetched successfully',
      );

      return activityDetails;
    } catch (error) {
      this.logger.error(
        'Activities Service',
        `Error fetching activity details: ${error.message}`,
      );
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new ForbiddenException(
        `Error fetching activity details: ${error.message}`,
      );
    }
  }

  findAll() {
    return `This action returns all activities`;
  }

  findOne(id: string) {
    return this.getActivityDetails(id);
  }

  async completeActivity(id: string) {
    const res = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') + `/activities/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify({ state: 'COMPLETED' }),
        headers: {
          api_key: this.config.get('CRM_API_KEY'),
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
    );
    if (!res.ok) {
      const errorText = await res.text();
      throw new ForbiddenException(
        `CRM could not complete activity: ${errorText}`,
      );
    }
    return res.json();
  }

  update(id: number, updateActivityDto: UpdateActivityDto) {
    return `This action updates a #${id} activity`;
  }

  remove(id: number) {
    return `This action removes a #${id} activity`;
  }
}
