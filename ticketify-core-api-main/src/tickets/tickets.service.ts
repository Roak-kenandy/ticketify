import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  Req,
  ServiceUnavailableException,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { ActivitiesService } from 'src/activities/activities.service';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from 'src/infrastructure/logger/logger.service';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { UserService } from 'src/user/user.service';
import { JwtGuard } from 'src/auth/guard';
import SMSService from 'src/shared/ooredoo-sms/sms.service';
import NotificationService from 'src/shared/one-signal/notification/notification.service';
import { CreateActivityDto } from './dto/create-activity';
import { CrmApiClient } from 'src/infrastructure/crm/crm-api.client';
import { NotificationTemplateService } from 'src/notifications/notification-template.service';
import { IntegrationAuditService } from 'src/infrastructure/audit/integration-audit.service';
import { WorkflowConfigService } from 'src/config/workflow-config.service';
import { TicketBillingService } from 'src/finance/ticket-billing.service';
import { LmHandoffDto } from './dto/lm-handoff.dto';

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private activity: ActivitiesService,
    private config: ConfigService,
    private logger: LoggerService,
    private user: UserService,
    private sms: SMSService,
    private notification: NotificationService,
    private crmApi: CrmApiClient,
    private templates: NotificationTemplateService,
    private audit: IntegrationAuditService,
    private workflowConfig: WorkflowConfigService,
    private ticketBilling: TicketBillingService,
  ) {}

  async createNewTicket(dto: CreateTicketDto) {
    let new_ticket = await this.prisma.tickets.create({
      data: {
        crm_id: dto.id,
        number: dto.number,
        description: dto.description,
        state: dto.status.name,
        contact_id: dto.contact_id,
        priority: dto.priority,
      },
    });

    this.logger.log('Ticket Service', 'Ticket created successfully');

    await this.activity.createTicketLog(
      'Ticket created successfully',
      new_ticket.id,
    );

    return new_ticket;
  }

  async create(dto: CreateTicketDto) {
    // create a ticket service
    try {
      let new_ticket = await this.createNewTicket(dto);

      // call crm api to get the request details
      await this.logger.log('Ticket Service', 'Fetching request details');
      let request_details = await this.FetchRequestDetails(new_ticket.crm_id);
      await this.logger.log('Ticket Service', 'Request details fetched');

      // call crm api to get the user details
      await this.logger.log('Ticket Service', 'Fetching Contact details');
      let contact_details = await this.fetchContactDetails(
        new_ticket.contact_id,
      );

      let address = contact_details.addresses[0];

      // check if address has lat and long
      if (address.lat != null && address.long != null) {
        await this.logger.log(
          'Ticket Service',
          'Location Lat & Long available',
        );
        // find the nearest technician using location if available
      } else {
        await this.logger.log(
          'Ticket Service',
          'Location Lat & Long not available',
        );
        if (address.town_city == null) {
          this.logger.error('Ticket Service', 'Town/City not available');
          await this.activity.createTicketLog(
            'Town/City not available. Resulting in stale assignment',
            new_ticket.id,
          );
          return new ForbiddenException('Town/City not available');
        }

        let team_id;
        // if address.town_city matches "Male" '"
        if (address.town_city == `Male'`) {
          team_id = 'f9006884-5b7e-4513-89ef-86e14acf0b25';
        } else {
          team_id = '1b71e6bd-116b-4b54-854f-03e1d2d9fba6';
        }

        // fetch active technicians
        let active_technicians = await this.user.getOnlineTechnicians();

        await this.AssignToTeam(new_ticket.crm_id, team_id);

        // if (active_technicians.length == 0) {
        //   this.logger.error(
        //     'Ticket Service',
        //     'No active technicians available',
        //   );

        //   // assign to team
        //   let assigned_team = await this.AssignToTeam(
        //     new_ticket.crm_id,
        //     team_id,
        //   );

        //   // TODO: send notification to all team members : API find a way to get all the users in a team

        //   if (!assigned_team) {
        //     this.logger.error('Ticket Service', 'Team assignment failed');
        //     await this.activity.createTicketLog(
        //       'Assigned ticket to team failed',
        //       new_ticket.id,
        //     );
        //     return new ForbiddenException('Team assignment failed');
        //   } else {
        //     let new_ticket_log = await this.activity.createTicketLog(
        //       `Assigned ticket to team ${team_id}`,
        //       new_ticket.id,
        //     );

        //     if (!new_ticket_log) {
        //       this.logger.error('Ticket Service', 'Ticket log creation failed');
        //       return new ForbiddenException('Ticket log creation failed');
        //     }

        //     return new_ticket;
        //   }
        // } else {
        //   // find the technician with teamid
        //   let favorable_technicians = Promise.all(
        //     active_technicians.map(async (technician) => {
        //       let user = await this.user.crmGetUser(technician.crm_user_id);

        //       console.log(user.teams);

        //       if (user?.teams?.length == 0 || user?.teams == null) {
        //         await this.logger.error('Ticket Service', 'User not in a team');
        //       }

        //       // check if the user is in the team
        //       let user_team = user?.teams?.find((team) => team.id == team_id);

        //       if (user_team) {
        //         return technician;
        //       }
        //     }),
        //   );

        //   let technicians = await favorable_technicians;

        //   await console.log(technicians);

        //   if (technicians.length == 0) {
        //     this.logger.error(
        //       'Ticket Service',
        //       'No active technicians available in the team',
        //     );
        //     await this.activity.createTicketLog(
        //       'No active technicians available in the team. Resulting in stale assignment',
        //       new_ticket.id,
        //     );
        //     await this.AssignToTeam(new_ticket.crm_id, team_id);

        //     let new_ticket_log = await this.activity.createTicketLog(
        //       `Assigned ticket to team ${team_id}`,
        //       new_ticket.id,
        //     );

        //     if (!new_ticket_log) {
        //       this.logger.error('Ticket Service', 'Ticket log creation failed');
        //       return new ForbiddenException('Ticket log creation failed');
        //     }

        //     return new_ticket;
        //   } else if (technicians.length == 1) {
        //     await console.log('only one technician available');
        //     // assign to user
        //     let assigned_user = await this.AssignToUser(
        //       new_ticket.crm_id,
        //       technicians[0].crm_user_id,
        //     );

        //     this.notification.publishNotification(
        //       {
        //         title: 'You have a new ticket',
        //         body: `You have been assigned a new ticket: ${new_ticket.number}`,
        //       },
        //       [technicians[0].id],
        //     );

        //     let new_ticket_log = await this.activity.createTicketLog(
        //       'Assigned ticket to User ' + technicians[0].crm_user_id,
        //       new_ticket.id,
        //     );

        //     if (!assigned_user) {
        //       this.logger.error('Ticket Service', 'User assignment failed');
        //       await this.activity.createTicketLog(
        //         'Assigned ticket to user failed',
        //         new_ticket.id,
        //       );
        //       return new ForbiddenException('User assignment failed');
        //     } else {
        //       await this.activity.createTicketLog(
        //         `Assigned ticket to user ${technicians[0].crm_user_id}`,
        //         new_ticket.id,
        //       );
        //       return new_ticket;
        //     }
        //   } else {
        //     // find the new tickets for each technician and assign the ticket to the technician with the least number of tickets
        //     let new_tickets = Promise.all(
        //       technicians.map(async (technician) => {
        //         let tickets = await this.fetchServiceRequests(
        //           technician.crm_user_id,
        //           null,
        //           'NEW',
        //         );

        //         return {
        //           technician: technician,
        //           tickets: tickets,
        //         };
        //       }),
        //     );

        //     let tickets = await new_tickets;

        //     let min_tickets = Math.min(
        //       ...tickets.map((technician) => technician.tickets.length),
        //     );

        //     let technician = tickets.find(
        //       (technician) => technician.tickets.length == min_tickets,
        //     );

        //     // assign to user
        //     let assigned_user = await this.AssignToUser(
        //       new_ticket.crm_id,
        //       technician.technician.crm_user_id,
        //     );

        //     await this.activity.createTicketLog(
        //       'Assigned ticket to User ' + technician.technician.crm_user_id,
        //       new_ticket.id,
        //     );

        //     await this.notification.publishNotification(
        //       {
        //         title: 'You have a new ticket',
        //         body: `You have been assigned a new ticket: ${new_ticket.number}`,
        //       },
        //       [technician.technician.id],
        //     );

        //     if (!assigned_user) {
        //       this.logger.error('Ticket Service', 'User assignment failed');
        //       await this.activity.createTicketLog(
        //         'Assigned ticket to user failed',
        //         new_ticket.id,
        //       );
        //       return new ForbiddenException('User assignment failed');
        //     } else {
        //       await this.activity.createTicketLog(
        //         `Assigned ticket to user ${technician.technician.crm_user_id}`,
        //         new_ticket.id,
        //       );

        //       return new_ticket;
        //     }
        //   }
        // }
      }

      // find the nearest technician using location if available
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
    }
  }

  async findAllTickets() {
    let new_tickets = await this.fetchServiceRequests(null, null, 'NEW');

    // filter tickets with assigned_to.user
    if (new_tickets.content.length > 0) {
      let tickets = new_tickets.content.filter(
        (ticket) => ticket.assigned_to?.user == null,
      );
      new_tickets.content = tickets;
    }

    // promise and filter assigned tickets with assigned_to.user
    let assigned_tickets = await this.fetchServiceRequests(null, null, 'NEW');
    if (assigned_tickets.content.length > 0) {
      let tickets = assigned_tickets.content.filter(
        (ticket) => ticket.assigned_to?.user != null,
      );
      assigned_tickets.content = tickets;
    }

    let in_progress_tickets = await this.fetchServiceRequests(
      null,
      null,
      'IN_PROGRESS',
    );

    let closed_tickets = await this.fetchServiceRequests(null, null, 'CLOSED');
    return {
      new_tickets: new_tickets,
      in_progress_tickets: in_progress_tickets,
      assigned_tickets: assigned_tickets,
      closed_tickets: closed_tickets,
    };
  }

  async updateTicket(user: any, id: string, dto: UpdateTicketDto) {
    return 'This action updates a #${id} ticket';
  }

  async findOne(id: string) {
    try {
      let ticket = await this.prisma.tickets.findUnique({
        where: {
          id: id,
        },
      });
      if (!ticket) {
        this.logger.error('Ticket Service', 'Ticket not found');
        return new ForbiddenException('Ticket not found');
      }
      this.logger.log('Ticket Service', 'Ticket found');
      // fetch ticket tags
      let tags = await this.getServiceRequestTags(ticket.crm_id);
      return {
        ...ticket,
        tags: tags,
      };
    } catch (e) {
      throw new ForbiddenException(
        'There was an error fetching the ticket' + e,
      );
    }
  }

  async crmFindServiceRequest(crm_id: string) {
    const service_request = await this.FetchRequestDetails(crm_id);
    if (!service_request || service_request instanceof HttpException) {
      throw new NotFoundException('Ticket not found in CRM');
    }

    // Everything below only depends on the ticket itself, so fetch it in
    // parallel (previously seven sequential CRM round trips).
    const settle = async <T>(work: Promise<T>, fallback: T): Promise<T> => {
      try {
        const value = await work;
        return value instanceof HttpException || value == null ? fallback : value;
      } catch (error) {
        this.logger.error('Ticket Service', `Ticket ${crm_id} detail part failed: ${error}`);
        return fallback;
      }
    };
    const empty = { content: [] as any[] };
    const queueId = service_request.queue?.id;
    const contactId = service_request.contact?.id;

    const [notes, activities, stages, queue_info, contact, attachments] =
      await Promise.all([
        settle(this.FetchServiceRequestNotes(crm_id), empty),
        settle(this.fetchRequestActivities(crm_id), empty),
        settle(this.fetchRequestQueueStages(crm_id), { ...service_request.queue, content: [] }),
        queueId ? settle(this.crmFindQueueById(queueId), null) : Promise.resolve(null),
        contactId
          ? settle(this.fetchContactDetails(contactId), service_request.contact)
          : Promise.resolve(service_request.contact ?? null),
        settle(this.FetchServiceRequestAttachments(crm_id), empty),
      ]);

    const apiUrl = String(this.config.get('API_URL') ?? '').replace(/\/$/, '');
    for (const attachment of attachments?.content ?? []) {
      if (attachment?.file?.id) {
        attachment.file_url = `${apiUrl}/tickets/files/${attachment.file.id}`;
      }
    }
    service_request.queue_info = queue_info;
    service_request.queue = stages;
    service_request.notes = notes;
    service_request.attachments = attachments;
    service_request.activities = activities;
    service_request.contact = contact;
    service_request.categories = service_request.categories || [];

    return service_request;
  }

  async findAllTeamTickets(user: string) {
    console.log(user);
    let crm_user = await this.user.crmGetUser(user);

    this.logger.log('Ticket Service', 'CRM User found');

    this.logger.log('Ticket Service', 'Fetching team tickets');
    let team_tickets = Promise.all(
      crm_user.teams.map(async (team) => {
        let tickets = await this.fetchServiceRequests(null, team.id, 'NEW');
        return {
          team: team,
          tickets: tickets,
        };
      }),
    );

    let tickets = await team_tickets;

    tickets.sort((a, b) => a.team.name.localeCompare(b.team.name));


    return tickets;
  }

  async uploadAttachmentToTicket(
    ticket_id: string,
    user_crm_id: string,
    description: string,
    file_id: string,
  ) {
    this.logger.log('Ticket Service', 'Uploading file to CRM');

    if (!file_id) {
      this.logger.error('Ticket Service', 'File not found');
      return new ForbiddenException('File not found');
    }

    let crm_add_attachment = await this.crmAddAttachmentToTicket(
      ticket_id,
      file_id,
      description,
    );

    this.logger.log('Ticket Service', 'CRM file uploaded');

    return {
      message: 'Attachment uploaded successfully',
      attachment: crm_add_attachment,
    };
  }

  async crmUploadFile(file: any) {
    console.log(file);
    // change file to form
    let form = new FormData();
    form.append('file', file);

    let crm_file = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') + '/upload/files',
      {
        method: 'POST',
        body: form,
        headers: {
          api_key: this.config.get('CRM_API_KEY'),
          accept: 'application/json',
          'Content-Type': 'multipart/form-data',
        },
      },
    );
    await console.log(crm_file);

    let response = await crm_file.json();

    if (!response.ok) {
      console.log('File Not uploaded' + JSON.stringify(response));
      this.logger.error('Ticket Service', 'CRM file upload failed');
      return new ForbiddenException('CRM file upload failed');
    } else {
      this.logger.log('Ticket Service', 'CRM file uploaded');
      return response;
    }
  }

  async crmFindQueueById(queue_id: string) {
    let crm_queue = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') +
        '/service_requests/queues/' +
        queue_id,
      {
        method: 'GET',
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );

    if (!crm_queue.ok) {
      this.logger.error('Ticket Service', 'CRM Queue not found');
      return new ForbiddenException('CRM Queue not found');
    }

    this.logger.log('Ticket Service', 'CRM Queue found');

    return crm_queue.json();
  }

  async crmAddAttachmentToTicket(
    ticket_id: string,
    file_id: string,
    description: string,
  ) {
    console.log('Adding attachment to ticket' + file_id);

    let crm_add_attachment = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') +
        '/service_requests/' +
        ticket_id +
        '/attachments',
      {
        method: 'POST',
        body: JSON.stringify({
          file_id: file_id,
          description: description,
          link: null,
        }),
        headers: {
          api_key: this.config.get('CRM_API_KEY'),
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
    );

    let response = await crm_add_attachment.json();

    if (!crm_add_attachment.ok) {
      console.log('Attachment not added' + JSON.stringify(response));
      this.logger.error('Ticket Service', 'Attachment not added');
      return new ForbiddenException('Attachment not added');
    }

    this.logger.log('Ticket Service', 'Attachment added');

    return response;
  }

  async crmAddNoteToTicket(ticket_id: string, note: string, pinned: boolean) {
    let crm_add_note = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') +
        '/service_requests/' +
        ticket_id +
        '/notes',
      {
        method: 'POST',
        body: JSON.stringify({
          note: note,
          pinned: pinned,
        }),
        headers: {
          api_key: this.config.get('CRM_API_KEY'),
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
    );

    let response = await crm_add_note.json();

    if (!crm_add_note.ok) {
      console.log('Note not added' + JSON.stringify(response));
      this.logger.error('Ticket Service', 'Note not added');
      return new ForbiddenException('Note not added');
    }

    this.logger.log('Ticket Service', 'Note added');

    return response;
  }

  async listNoResponseActivities(ticketId: string) {
    const typeId = this.workflowConfig.getNoResponseActivityTypeId();
    const res = await this.crmApi.listActivitiesByServiceRequest(ticketId);
    if (!res.ok) {
      throw new ForbiddenException('Could not load activities from CRM');
    }
    const activities = (res.data?.content ?? []) as {
      id: string;
      name: string;
      state?: string;
      states?: { state: string; date: number }[];
      type?: { id: string; name: string };
    }[];
    return activities.filter(
      (a) => a.type?.id === typeId || a.type?.name === 'No Response',
    );
  }

  private async assertNoPendingNoResponse(ticket_id: string) {
    const activities = await this.listNoResponseActivities(ticket_id);
    const open = activities.filter(
      (a) => this.resolveCrmActivityState(a) === 'PENDING',
    );
    if (open.length > 0) {
      throw new ForbiddenException(
        'Complete or remove No Response before closing this ticket',
      );
    }
  }

  async toggleNoResponse(id: string) {
    this.logger.log('Ticket Service', 'Toggle No Response activity');
    const ticket = await this.crmFindServiceRequest(id);
    const pending = (await this.listNoResponseActivities(id)).filter(
      (a) => this.resolveCrmActivityState(a) === 'PENDING',
    );

    if (pending.length > 0) {
      const activityId = pending[0].id;
      const updated = await this.crmApi.updateActivityState(
        activityId,
        'COMPLETED',
      );
      if (!updated.ok) {
        throw new ForbiddenException(
          'Could not complete No Response activity in CRM',
        );
      }

      await this.clearNoResponseTagIfPresent(id);

      await this.crmAddNoteToTicket(
        id,
        'No Response cleared — customer contact resumed (Ticketify).',
        false,
      );

      await this.audit.log({
        entity_type: 'activity',
        entity_id: activityId,
        action: 'NO_RESPONSE_CLEARED',
        new_state: { state: 'COMPLETED', ticket_id: id },
        crm_sync_ok: true,
      });

      return {
        message: 'No Response cleared',
        activity_id: activityId,
        state: 'COMPLETED',
      };
    }

    const noResponseTypeId = this.workflowConfig.getNoResponseActivityTypeId();
    const activityResult = await this.crmApi.createActivity({
      name: 'No Response',
      description:
        'Customer could not be reached — No Response activity (Ticketify).',
      type_id: noResponseTypeId,
      date: Math.floor(Date.now() / 1000),
      linked_to: [{ type: 'SERVICE_REQUEST', id }],
    });
    if (!activityResult.ok) {
      this.logger.error(
        'Ticket Service',
        `No Response CRM activity failed: ${JSON.stringify(activityResult.data)}`,
      );
      throw new ForbiddenException('No Response activity could not be created');
    }

    const activityId =
      (activityResult.data as { id?: string })?.id ??
      (activityResult.data as { content?: { id?: string } })?.content?.id;

    await this.crmAddNoteToTicket(
      id,
      'Technician marked No Response due to unsuccessful contact attempt.',
      false,
    );

    await this.audit.log({
      entity_type: 'service_request',
      entity_id: id,
      action: 'NO_RESPONSE_ACTIVITY',
      new_state: { activity_type_id: noResponseTypeId, activity_id: activityId },
      crm_sync_ok: true,
    });

    await this.sms.publishSMS({
      phone: ticket.contact.phone.number,
      message: `
Dear ${ticket.contact.person_name.full_name},
Our technician tried to contact you but was unable to reach you. Please let us know a convenient time so we can reschedule your appointment.
Thank you for your patience.
Medianet Support Team
        `,
    });

    return {
      message: 'No Response activity created',
      activity_id: activityId,
      state: 'PENDING',
    };
  }

  private async clearNoResponseTagIfPresent(ticketId: string) {
    const ticket = await this.crmFindServiceRequest(ticketId);
    if (!ticket.categories?.some((cat: { name: string }) => cat.name === 'No Response')) {
      return;
    }
    await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') + '/service_requests/' + ticketId,
      {
        method: 'PUT',
        body: JSON.stringify({ categories: [] }),
        headers: {
          api_key: this.config.get('CRM_API_KEY'),
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
    );
  }

  private async getServiceRequestTags(id: string) {
    let crm_service_request_tags = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') +
        '/service_requests/' +
        id +
        '/tags',
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );

    if (!crm_service_request_tags.ok) {
      this.logger.error('Ticket Service', 'CRM Service request tags not found');
      return new ForbiddenException('CRM Service request tags not found');
    }

    this.logger.log('Ticket Service', 'CRM Service request tags found');

    return crm_service_request_tags.json();
  }

  async fetchServiceRequests(user_id, team_id, state, size = 100) {
    let url_params = '';

    if (user_id) {
      url_params += `assigned_to_user_id=${user_id}`;
    }

    if (team_id) {
      url_params += `assigned_to_team_id=${team_id}`;
    }

    if (state) {
      url_params += `&states=${state}`;
    }

    // Add date filter for closed tickets (last 24 hours)
    if (state === 'CLOSED') {
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
      const dateFilter = twentyFourHoursAgo.toISOString().split('T')[0]; // Format as YYYY-MM-DD
      url_params += `&updated_at_from=${dateFilter}`;
    }

    if (size) {
      url_params += `&size=${size}`;
    }

    let crm_service_requests = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') +
        '/service_requests' +
        (url_params ? '?' + url_params : ''),
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );

    if (!crm_service_requests.ok) {
      this.logger.error('Ticket Service', 'CRM Service request not found');
      return new ForbiddenException('CRM Service request not found');
    }

    this.logger.log('Ticket Service', 'CRM Service request found');

    const response = await crm_service_requests.json();

    // Additional client-side filtering for closed tickets within last 24 hours
    if (state === 'CLOSED' && response.content) {
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      response.content = response.content.filter((ticket: any) => {
        if (!ticket.updated_at) return false;
        const ticketUpdatedAt = new Date(ticket.updated_at);
        return ticketUpdatedAt >= twentyFourHoursAgo;
      });
    }

    return response;
  }

  async fetchTeamServiceRequests(team_id: string) {
    console.log('Fetching team tickets' + team_id);
    let crm_service_requests = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') +
        '/service_requests?assigned_to_team_id=' +
        team_id +
        '&size=100',
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );

    let all_tickets = await crm_service_requests.json();

    let new_tickets = all_tickets.content.filter(
      (ticket) => ticket.state == 'NEW',
    );

    let in_progress_tickets = all_tickets.content.filter(
      (ticket) => ticket.state == 'IN_PROGRESS',
    );

    let closed_tickets = all_tickets.content.filter(
      (ticket) => ticket.state == 'CLOSED',
    );

    return {
      new_tickets: new_tickets,
      in_progress_tickets: in_progress_tickets,
      closed_tickets: closed_tickets,
    };
  }

  /**
   * All NEW / IN_PROGRESS tickets for a team, across every CRM page.
   * Filtering by state server-side matters: an unfiltered first page is mostly
   * CLOSED tickets, which silently drops open work from counts and auto-assign.
   */
  async fetchOpenTeamServiceRequests(team_id: string) {
    const [new_tickets, in_progress_tickets] = await Promise.all([
      this.fetchAllTeamTicketsInState(team_id, 'NEW'),
      this.fetchAllTeamTicketsInState(team_id, 'IN_PROGRESS'),
    ]);
    return { new_tickets, in_progress_tickets };
  }

  private fetchAllTeamTicketsInState(team_id: string, state: string) {
    return this.fetchAllTicketsInState({ assigned_to_team_id: team_id }, state);
  }

  /**
   * Every CRM page of tickets in one state for a team or user. The CRM returns
   * newest first, so `maxPages` caps very old backlogs rather than new work.
   */
  private async fetchAllTicketsInState(
    owner: { assigned_to_team_id?: string; assigned_to_user_id?: string },
    state: string,
    opts: { maxPages?: number; size?: number } = {},
  ) {
    const size = opts.size ?? 100;
    const maxPages = opts.maxPages ?? Number(this.config.get('CRM_MAX_PAGES') ?? 20);
    const timeoutMs = Number(this.config.get('CRM_REQUEST_TIMEOUT_MS') ?? 15_000);
    const base = String(this.config.get('CRM_BACKOFFICE_API_URL') ?? '').replace(/\/$/, '');
    const ownerQuery = Object.entries(owner)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join('&');
    const label = ownerQuery || 'all';
    const rows: any[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const url =
        `${base}/service_requests?${ownerQuery}` +
        `&states=${state}&size=${size}&page=${page}`;
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { accept: 'application/json', api_key: this.config.get('CRM_API_KEY') },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        this.logger.error('Ticket Service', `CRM ${state} tickets for ${label} failed: ${error}`);
        throw new ServiceUnavailableException('CRM did not respond in time. Try again shortly.');
      }
      if (!response.ok) {
        this.logger.error('Ticket Service', `CRM ${state} tickets for ${label}: HTTP ${response.status}`);
        throw new ServiceUnavailableException('CRM returned an error while loading tickets.');
      }
      const body = (await response.json()) as {
        content?: { state?: string }[];
        paging?: { has_more?: boolean };
      };
      const content = Array.isArray(body?.content) ? body.content : [];
      rows.push(...content.filter(ticket => ticket?.state === state));
      if (!body?.paging?.has_more || content.length === 0) break;
    }
    return rows;
  }

  /**
   * Technician app "my tickets": all open work across every CRM page plus the
   * most recent closed tickets. Replaces a single unfiltered page of 100 that
   * was mostly CLOSED and silently dropped open jobs for busy technicians.
   */
  async fetchMyTickets(crm_user_id: string, recentClosed = 50) {
    if (!crm_user_id) {
      throw new BadRequestException('Your account is not linked to a CRM user.');
    }
    const owner = { assigned_to_user_id: crm_user_id };
    const [newRows, inProgressRows, closedRows] = await Promise.all([
      this.fetchAllTicketsInState(owner, 'NEW'),
      this.fetchAllTicketsInState(owner, 'IN_PROGRESS'),
      this.fetchAllTicketsInState(owner, 'CLOSED', { maxPages: 1, size: recentClosed }).catch(
        () => [] as any[],
      ),
    ]);
    const content = [...inProgressRows, ...newRows, ...closedRows];
    return {
      content,
      counts: {
        new: newRows.length,
        in_progress: inProgressRows.length,
        closed_recent: closedRows.length,
      },
    };
  }

  /** Unassigned + assigned NEW tickets for each of the technician's CRM teams. */
  async findAllTeamTicketsSafe(crm_user_id: string) {
    const crm_user = await this.user.crmGetUser(crm_user_id);
    const teams: { id: string; name?: string }[] = Array.isArray(crm_user?.teams)
      ? crm_user.teams
      : [];
    const groups = await Promise.all(
      teams.map(async (team) => {
        try {
          const content = await this.fetchAllTicketsInState(
            { assigned_to_team_id: team.id },
            'NEW',
            { maxPages: 3 },
          );
          return { team, tickets: { content } };
        } catch (error) {
          this.logger.error('Ticket Service', `Team ${team.id} tickets failed: ${error}`);
          return { team, tickets: { content: [] as any[] }, error: 'unavailable' };
        }
      }),
    );
    return groups.sort((a, b) => String(a.team?.name ?? '').localeCompare(String(b.team?.name ?? '')));
  }

  async fetchUnassignedNewTeamTickets(team_id: string) {
    const { new_tickets } = await this.fetchOpenTeamServiceRequests(team_id);
    return (new_tickets ?? []).filter(
      (ticket: { assigned_to?: { user?: { id?: string } } }) =>
        !ticket?.assigned_to?.user?.id,
    );
  }

  async fetchTeamAssignmentSummary(team_id: string) {
    const { new_tickets, in_progress_tickets } =
      await this.fetchOpenTeamServiceRequests(team_id);
    const unassignedNew = (new_tickets ?? []).filter(
      (t: { assigned_to?: { user?: { id?: string } } }) =>
        !t?.assigned_to?.user?.id,
    );
    const assignedNew = (new_tickets ?? []).filter(
      (t: { assigned_to?: { user?: { id?: string } } }) =>
        Boolean(t?.assigned_to?.user?.id),
    );
    const assignedInProgress = in_progress_tickets ?? [];
    return {
      team_id,
      unassigned_new: unassignedNew.length,
      assigned_new: assignedNew.length,
      in_progress: assignedInProgress.length,
      assigned_in_progress: assignedInProgress.filter(
        (t: { assigned_to?: { user?: { id?: string } } }) =>
          Boolean(t?.assigned_to?.user?.id),
      ).length,
      breakdown: {
        unassigned: this.groupTicketsByWorkKind(unassignedNew),
        assigned: this.groupTicketsByWorkKind(assignedNew),
        in_progress: this.groupTicketsByWorkKind(assignedInProgress),
      },
    };
  }

  private ticketWorkKind(ticket: {
    queue?: { name?: string };
    stage?: { name?: string };
    categories?: { name?: string }[];
  }): string {
    const queueName = ticket?.queue?.name?.trim();
    if (queueName) return queueName;
    const category = ticket?.categories?.find(item => item?.name?.trim())?.name?.trim();
    if (category) return category;
    const stage = ticket?.stage?.name?.trim();
    if (stage) return stage;
    return 'Other';
  }

  private groupTicketsByWorkKind(
    tickets: {
      queue?: { name?: string };
      stage?: { name?: string };
      categories?: { name?: string }[];
    }[],
  ): { label: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const ticket of tickets) {
      const label = this.ticketWorkKind(ticket);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  async countInProgressTicketsForUser(crm_user_id: string): Promise<number> {
    const all = await this.fetchUserTickets(crm_user_id);
    return all?.in_progress_tickets?.length ?? 0;
  }

  async fetchUserTickets(user_id: string) {
    let crm_service_requests = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') +
        '/service_requests?assigned_to_user_id=' +
        user_id +
        '&size=100',
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );

    let all_tickets = await crm_service_requests.json();

    let new_tickets = all_tickets.content.filter(
      (ticket) => ticket.state == 'NEW',
    );

    let in_progress_tickets = all_tickets.content.filter(
      (ticket) => ticket.state == 'IN_PROGRESS',
    );

    let closed_tickets = all_tickets.content.filter(
      (ticket) => ticket.state == 'CLOSED',
    );

    return {
      new_tickets: new_tickets,
      in_progress_tickets: in_progress_tickets,
      closed_tickets: closed_tickets,
    };
  }

  async FetchRequestDetails(crm_id: string) {
    let crm_service_request = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') + '/service_requests/' + crm_id,
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );

    if (!crm_service_request.ok) {
      this.logger.error('Ticket Service', 'CRM Service request not found');
      return new ForbiddenException('CRM Service request not found');
    }

    this.logger.log('Ticket Service', 'CRM Service request found');

    return crm_service_request.json();
  }

  async fetchRequestQueueStages(crm_id: string) {
    let crm_service_request_queue_stages = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') +
        '/service_requests/' +
        crm_id +
        '/queues/stages',
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );

    if (!crm_service_request_queue_stages.ok) {
      this.logger.error(
        'Ticket Service',
        'CRM Service request queue stages not found',
      );
      return new ForbiddenException(
        'CRM Service request queue stages not found',
      );
    }

    this.logger.log('Ticket Service', 'CRM Service request found queue stages');

    return crm_service_request_queue_stages.json();
  }

  /**
   * Streams a CRM file to an authenticated client so the CRM API key never
   * ships inside the mobile app.
   */
  async fetchFile(file_id: string): Promise<{ buffer: Buffer; contentType: string }> {
    if (!/^[A-Za-z0-9-]{8,64}$/.test(file_id ?? '')) {
      throw new BadRequestException('Invalid file id');
    }
    const base = String(this.config.get('CRM_BACKOFFICE_API_URL') ?? '').replace(/\/$/, '');
    let response: Response;
    try {
      response = await fetch(`${base}/files/${file_id}`, {
        headers: { api_key: this.config.get('CRM_API_KEY') },
        signal: AbortSignal.timeout(Number(this.config.get('CRM_FILE_TIMEOUT_MS') ?? 30_000)),
      });
    } catch (error) {
      this.logger.error('Ticket Service', `CRM file ${file_id} failed: ${error}`);
      throw new ServiceUnavailableException('Could not load the file right now.');
    }
    if (response.status === 404) {
      throw new NotFoundException('File not found');
    }
    if (!response.ok) {
      this.logger.error('Ticket Service', `CRM file ${file_id}: HTTP ${response.status}`);
      throw new ServiceUnavailableException('Could not load the file right now.');
    }
    const maxBytes = 15 * 1024 * 1024;
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > maxBytes) {
      throw new BadRequestException('File is too large to preview');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new BadRequestException('File is too large to preview');
    }
    return {
      buffer,
      contentType: response.headers.get('content-type') || 'application/octet-stream',
    };
  }

  /** Upload a device file to the CRM and attach it to the ticket in one call. */
  async uploadDeviceFileToTicket(
    ticket_id: string,
    file: { buffer: Buffer; mimetype?: string; originalname?: string; size?: number },
    description: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Choose a photo to upload');
    }
    if (!description?.trim()) {
      throw new BadRequestException('Add a short description for the attachment');
    }
    const base = String(this.config.get('CRM_BACKOFFICE_API_URL') ?? '').replace(/\/$/, '');
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || 'application/octet-stream' }),
      file.originalname || `attachment-${Date.now()}.jpg`,
    );
    form.append('description', description.trim());

    let upload: Response;
    try {
      upload = await fetch(`${base}/upload/files`, {
        method: 'POST',
        headers: { api_key: this.config.get('CRM_API_KEY'), accept: 'application/json' },
        body: form,
        signal: AbortSignal.timeout(Number(this.config.get('CRM_FILE_TIMEOUT_MS') ?? 60_000)),
      });
    } catch (error) {
      this.logger.error('Ticket Service', `CRM upload for ${ticket_id} failed: ${error}`);
      throw new ServiceUnavailableException('Upload timed out. Please try again.');
    }
    const uploaded = (await upload.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!upload.ok || !uploaded?.id) {
      this.logger.error('Ticket Service', `CRM upload for ${ticket_id}: HTTP ${upload.status}`);
      throw new ServiceUnavailableException(uploaded?.message || 'The CRM rejected the upload.');
    }

    const attachment = await this.crmAddAttachmentToTicket(ticket_id, uploaded.id, description.trim());
    if (attachment instanceof HttpException) {
      throw attachment;
    }
    return { message: 'Attachment uploaded', file_id: uploaded.id, attachment };
  }

  async fetchRequestActivities(crm_id: string) {
    let crm_service_request_activities = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') +
        '/service_requests/' +
        crm_id +
        '/activities',
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );

    if (!crm_service_request_activities.ok) {
      this.logger.error(
        'Ticket Service',
        'CRM Service request activity not found',
      );
      return new ForbiddenException('CRM Service request activities not found');
    }

    this.logger.log('Ticket Service', 'CRM Service request found activities');

    return crm_service_request_activities.json();
  }

  async assignServiceRequestToUser(ticket_id: any, user_id: any) {
    await this.assertNoPendingLastMile(ticket_id);

    let ticket = await this.crmFindServiceRequest(ticket_id);

    let contact_details = await this.fetchContactDetails(ticket.contact.id);

    let address = contact_details.addresses[0];  

    let assign_sr_to_user = await this.AssignToUser(
      ticket_id,
      user_id,
      ticket?.assigned_to?.team?.id 
    );

    if (!assign_sr_to_user) {
      this.logger.error('Ticket Service', 'Service request not assigned');
      return new ForbiddenException('Service request not assigned');
    }

    this.logger.log('Ticket Service', 'Service request assigned');

    // await this.activity.createTicketLog(
    //   'Assigned ticket to User ' + user_id,
    //   ticket_id,
    // );

    return assign_sr_to_user;
  }

  private getCustomerReviewBaseUrl(): string {
    const configured = this.config.get<string>('CUSTOMER_REVIEW_BASE_URL');
    if (configured?.trim()) {
      return configured.trim().replace(/\/$/, '');
    }

    return this.config.get('NODE_ENV') === 'production'
      ? 'https://ticketify.medianet.mv'
      : 'http://127.0.0.1:3000';
  }

  private buildCustomerReviewUrl(
    ticketId: string,
    crmUserId: string,
  ): string {
    return `${this.getCustomerReviewBaseUrl()}/customer-review/${ticketId}?userId=${crmUserId}`;
  }

  private resolveNextStageId(ticket: any, stageIdOverride?: string): string {
    if (stageIdOverride) {
      return stageIdOverride;
    }

    const stages = ticket?.queue_info?.stages ?? [];
    const currentOrder = ticket?.stage?.order ?? 0;
    const nextStage = stages.find(
      (stage: {order: number; id: string}) => stage.order === currentOrder + 1,
    );

    if (!nextStage?.id) {
      throw new ForbiddenException(
        'No next workflow stage found for this ticket queue',
      );
    }

    return nextStage.id;
  }

  private resolveCrmActivityState(activity: {
    state?: string;
    states?: { state: string; date: number }[];
  }): string {
    if (activity.state) {
      return activity.state;
    }
    const states = activity.states;
    if (!states?.length) {
      return '';
    }
    return [...states].sort((a, b) => b.date - a.date)[0].state;
  }

  private async assertNoPendingLastMile(ticket_id: string) {
    const lmActivities = await this.listLastMileActivities(ticket_id);
    const open = lmActivities.filter(
      (a) => this.resolveCrmActivityState(a) === 'PENDING',
    );
    if (open.length > 0) {
      throw new ForbiddenException(
        'Complete Last Mile cabling before starting or progressing this ticket',
      );
    }
  }

  async startTicket(ticket_id: string, stage_id?: string) {
    await this.assertNoPendingLastMile(ticket_id);

    const ticket = await this.crmFindServiceRequest(ticket_id);

    if (ticket?.state !== 'NEW') {
      throw new ForbiddenException('Ticket must be assigned before starting');
    }

    const mappedStart = this.workflowConfig.getStartStageIdForQueue(
      ticket?.queue_info?.id ?? ticket?.queue?.id,
    );
    const targetStageId =
      stage_id?.trim() ||
      mappedStart ||
      this.resolveNextStageId(ticket, stage_id);

    this.logger.log(
      'Ticket Service',
      `Starting ticket ${ticket_id} with stage ${targetStageId}`,
    );

    const crmResult = await this.crmApi.postServiceRequestAction(ticket_id, {
      action: 'START_PROGRESS',
      comment: 'Starting ticket',
      achieved_date: new Date().toISOString(),
      stage_id: targetStageId,
    });

    const response = crmResult.data as { message?: string };

    if (!crmResult.ok) {
      throw new ForbiddenException(
        response?.message ?? 'Service request could not be started in CRM',
      );
    }

    const updatedTicket = await this.crmFindServiceRequest(ticket_id);
    if (updatedTicket?.state !== 'IN_PROGRESS') {
      this.logger.error(
        'Ticket Service',
        `Ticket ${ticket_id} state is still ${updatedTicket?.state} after start`,
      );
      throw new ForbiddenException(
        'Ticket was not moved to In Progress in CRM',
      );
    }

    return updatedTicket;
  }

  async completeTicket(ticket_id: string, comment: string, stage_id?: string) {
    await this.assertNoPendingNoResponse(ticket_id);
    await this.assertNoPendingLastMile(ticket_id);
    await this.ticketBilling.assertReadyToClose(ticket_id);

    let ticket = await this.crmFindServiceRequest(ticket_id);
    const resolvedStageId =
      stage_id?.trim() ||
      this.workflowConfig.getCompleteStageIdForQueue(
        ticket?.queue_info?.id ?? ticket?.queue?.id,
      );
    if (!resolvedStageId) {
      throw new ForbiddenException(
        'stage_id is required when queue complete stage is not mapped',
      );
    }
    let user = await this.user.crmGetUser(ticket.assigned_to?.user?.id);
    console.log('Closing ticket' + ticket_id + 'to stage ' + resolvedStageId);
    let crm_start_service_request = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') +
        '/service_requests/' +
        ticket_id +
        '/actions',
      {
        method: 'POST',
        headers: {
          api_key: this.config.get('CRM_API_KEY'),
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'PROGRESS',
          closing_comment: comment ?? 'Closing ticket',
          achieved_date: new Date().toISOString(),
          is_resolved: true,
          stage_id: resolvedStageId,
        }),
      },
    );

    let response = await crm_start_service_request.json();

    if (!crm_start_service_request.ok) {
      console.log('Service request not Closed' + JSON.stringify(response));
      return new ForbiddenException(
        'Service request not Closed',
        crm_start_service_request.statusText,
      );
    }

    const reviewUrl = this.buildCustomerReviewUrl(ticket_id, user.id);

    await this.sms.publishSMS({
      phone: ticket.contact.phone.number,
      message: `
Dear ${ticket.contact.person_name.full_name},

Your ticket: ${ticket.number} has been closed. We would appreciate your feedback on the service provided.
Please take a moment to rate the service you received by clicking on the link below.
${reviewUrl}

Thank you for your patience.
Medianet Support Team
      `,
    });

    this.logger.log('Ticket Service', 'Service request Closed');
    this.logger.log('Ticket Service', `Customer review URL: ${reviewUrl}`);

    return this.crmFindServiceRequest(ticket_id);
  }

  async progressTicket(
    ticket_id: string,
    stage_id: string,
    stage_name: string,
    comment: string,
    smsNotification: boolean,
  ) {
    await this.assertNoPendingLastMile(ticket_id);
    console.log('smsNotification', smsNotification ? 'Enabled' : 'Disabled');
    let ticket = await this.crmFindServiceRequest(ticket_id);

    let user = await this.user.crmGetUser(ticket.assigned_to?.user?.id);
    console.log('Progressing ticket' + ticket_id);
    console.log('Progressing ticket' + stage_id);
    let crm_start_service_request = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') +
        '/service_requests/' +
        ticket_id +
        '/actions',
      {
        method: 'POST',
        headers: {
          api_key: this.config.get('CRM_API_KEY'),
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'PROGRESS',
          comment: comment ?? 'Progressing ticket',
          achieved_date: new Date().toISOString(),
          stage_id: stage_id,
        }),
      },
    );

    let response = await crm_start_service_request.json();

    if (!crm_start_service_request.ok) {
      console.log('Service request not progressed' + JSON.stringify(response));
      return new ForbiddenException(
        'Service request not progressed',
        crm_start_service_request.statusText,
      );
    }

    if (response) {
      //  send SMS notification if enabled
      this.logger.log('Ticket Service', 'Service request progressed');

      if (smsNotification == false) {
        this.logger.log('Ticket Service', 'SMS notification disabled');
        return this.crmFindServiceRequest(ticket_id);
      }
      this.logger.log('Ticket Service', 'SMS notification enabled');
      let send_sms = await this.sms.publishSMS({
        phone: ticket?.contact?.phone?.number,
        message: `
Dear ${ticket?.contact?.person_name?.full_name},

Your ticket: ${ticket?.number} assigned to ${user?.first_name} ${user?.last_name} will be visiting you shortly for ${stage_name}.
Please make sure to be available at the location. Our team will be in touch with you shortly.

Thank you for your patience.
Medianet Support Team
        `,
      });
      if (!send_sms) {
        this.logger.error('Ticket Service', 'SMS not sent');
        return new ForbiddenException('SMS not sent');
      } else {
        this.logger.log('Ticket Service', 'SMS sent');
        return this.crmFindServiceRequest(ticket_id);
      }
    } else {
      console.log('Service request not started' + JSON.stringify(response));
      return new ForbiddenException(
        'Service request not started',
        crm_start_service_request.statusText,
      );
    }
  }

  async FetchServiceRequestNotes(crm_id: string) {
    let crm_service_request_notes = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') +
        '/service_requests/' +
        crm_id +
        '/notes',
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );

    if (!crm_service_request_notes.ok) {
      this.logger.error('Ticket Service', 'CRM Service request note not found');
      return new ForbiddenException('CRM Service request noyes not found');
    }

    this.logger.log('Ticket Service', 'CRM Service request notes found');

    return crm_service_request_notes.json();
  }

  async FetchServiceRequestAttachments(crm_id: string) {
    let crm_service_request_attachments = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') +
        '/service_requests/' +
        crm_id +
        '/attachments',
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );

    if (!crm_service_request_attachments.ok) {
      this.logger.error(
        'Ticket Service',
        'CRM Service request attachments not found',
      );
      return new ForbiddenException(
        'CRM Service request attachments not found',
      );
    }

    this.logger.log('Ticket Service', 'CRM Service request Attachment found');

    return crm_service_request_attachments.json();
  }

  async AssignToTeam(ticket_id: string, team_id: string) {
    let crm_assign_service_request_to_team = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') +
        '/service_requests/' +
        ticket_id,
      {
        method: 'PUT',
        body: JSON.stringify({
          assigned_to: {
            team_id: team_id,
            user_id: null,
          },
        }),
        headers: {
          api_key: this.config.get('CRM_API_KEY'),
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
    );

    if (!crm_assign_service_request_to_team.ok) {
      this.logger.error('Ticket Service', 'Ticket Service Team not Assigned');
      return new ForbiddenException('Team not assigned to Service Request');
    }

    let new_ticket_log = await this.activity.createTicketLog(
      'Assigned ticket to Team ' + team_id,
      ticket_id,
    );

    if (!new_ticket_log) {
      this.logger.error('Ticket Service', 'Ticket log creation failed');
      return new ForbiddenException('Ticket log creation failed');
    }

    this.logger.log(
      'Ticket Service',
      `Service request assigned to team ${team_id}`,
    );

    return crm_assign_service_request_to_team.json();
  }

  async AssignToUser(ticket_id: string, user_id: string, team_id?: string) {
    let ticket = await this.FetchRequestDetails(ticket_id);
    let user = await this.user.crmGetUser(user_id);
    let crm_assign_service_request_to_user = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') +
        '/service_requests/' +
        ticket_id,
      {
        method: 'PUT',
        body: JSON.stringify({
          assigned_to: {
            user_id: user_id,
            team_id: team_id,
          },
        }),
        headers: {
          api_key: this.config.get('CRM_API_KEY'),
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
    );

 

    let response = await crm_assign_service_request_to_user.json();

    console.log('🔁 CRM API response:', response);

    if (!crm_assign_service_request_to_user.ok) {
      this.logger.error('Ticket Service', 'Ticket Service User not Assigned');
      return new ForbiddenException('Team not assigned to Service Request');
    }

    let send_sms = await this.sms.publishSMS({
      phone: ticket.contact.phone.number,
      message: `
Dear ${ticket.contact.name},

Your ticket: ${ticket.number} assigned to ${user.first_name} ${user.last_name} will be visiting you.
Please make sure to be available at the location. Our team will contact you before visiting.


Thank you for your patience.
Medianet Support Team
      `,
    });

    if (!send_sms) {
      this.logger.error('Ticket Service', 'SMS not sent');
      return new ForbiddenException('SMS not sent');
    }

    this.logger.log(
      'Ticket Service',
      `Service request assigned to User ${user_id}`,
    );

    return response
  }

  async fetchContactDetails(contact_id: string) {
    let crm_service_request = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') + '/contacts/' + contact_id,
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );

    if (!crm_service_request.ok) {
      this.logger.error('Ticket Service', 'CRM Service request not found');
      return new ForbiddenException('CRM Service request not found');
    }

    this.logger.log(
      'Ticket Service',
      'CRM Service Request Contact found' + crm_service_request,
    );

    let contact_services = await this.fetchContactServices(contact_id);

    await Promise.all(
      contact_services?.content?.map(async (service) => {
        let devices = await this.fetchContactServiceDevices(service.id);
        service.devices = devices;
      }),
    );

    let response = await crm_service_request.json();

    response.services = contact_services;

    return response;
  }

  async fetchContactServices(contact_id: string) {
    let crm_service_request = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') +
        '/contacts/' +
        contact_id +
        '/services',
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );

    if (!crm_service_request.ok) {
      this.logger.error(
        'Ticket Service',
        'CRM Service request contact services not found',
      );
      return new ForbiddenException(
        'CRM Service request contact services not found',
      );
    }

    let response = await crm_service_request.json();

    this.logger.log(
      'Ticket Service',
      'CRM Service Request Contact Services found',
    );

    return response;
  }

  async fetchContactServiceDevices(service_id: string) {
    let crm_service_request = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') +
        '/services/' +
        service_id +
        '/devices',
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );

    if (!crm_service_request.ok) {
      this.logger.error(
        'Ticket Service',
        'CRM Service request contact services not found',
      );
      return new ForbiddenException(
        'CRM Service request contact services not found',
      );
    }

    let response = await crm_service_request.json();

    this.logger.log(
      'Ticket Service',
      'CRM Service Request Contact Services found',
    );

    return response;
  }

  // activtiies for LM

  async findTicketActivitiesContext(id: string) {
    const [lmContext, noResponseActivities] = await Promise.all([
      this.getLmHandoffContext(id),
      this.listNoResponseActivities(id).catch(
        () => [] as Awaited<ReturnType<TicketsService['listNoResponseActivities']>>,
      ),
    ]);
    const pendingNoResponse = noResponseActivities.some(
      (a) => this.resolveCrmActivityState(a) === 'PENDING',
    );
    return {
      ...lmContext,
      no_response_activities: noResponseActivities,
      pending_no_response: pendingNoResponse,
    };
  }

  /** CRM all-day activity `date` is UTC midnight for the calendar day (see CRM web). */
  private lmActivityDateUnix(activityDate?: string): number {
    let year: number;
    let month: number;
    let day: number;

    if (activityDate && /^\d{4}-\d{2}-\d{2}/.test(activityDate)) {
      const [y, m, d] = activityDate.slice(0, 10).split('-').map(Number);
      year = y;
      month = m - 1;
      day = d;
    } else {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Indian/Maldives',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());
      year = Number(parts.find((p) => p.type === 'year')!.value);
      month = Number(parts.find((p) => p.type === 'month')!.value) - 1;
      day = Number(parts.find((p) => p.type === 'day')!.value);
    }

    return Math.floor(Date.UTC(year, month, day) / 1000);
  }

  async getLmHandoffContext(ticketId: string) {
    const lm = this.workflowConfig.getLmConfig();
    const sr = await this.crmApi.getServiceRequest(ticketId);
    if (!sr.ok) {
      throw new ForbiddenException('Service request not found in CRM');
    }

    const srData = sr.data as {
      contact?: { id: string; name?: string };
      number?: string;
    };
    const contactId = srData?.contact?.id;
    if (!contactId) {
      throw new ForbiddenException('Service request has no linked contact');
    }

    const [addressesRes, activitiesRes] = await Promise.all([
      this.crmApi.listContactAddresses(contactId),
      this.crmApi.listActivitiesByServiceRequest(ticketId),
    ]);

    const activities = (activitiesRes.data?.content ?? []) as {
      id: string;
      name: string;
      state: string;
      type?: { id: string; name: string };
    }[];

    const lmActivities = activities.filter(
      (a) =>
        a.type?.id === lm.activityTypeId ||
        a.type?.name === lm.activityTypeName,
    );

    return {
      ticket_id: ticketId,
      ticket_number: srData.number,
      contact: srData.contact,
      lm_config: lm,
      addresses: addressesRes.ok ? addressesRes.data?.content ?? [] : [],
      lm_activities: lmActivities,
      pending_lm: lmActivities.some(
        (a) => this.resolveCrmActivityState(a) === 'PENDING',
      ),
    };
  }

  async handoffToLastMile(
    ticketId: string,
    dto: LmHandoffDto,
    actor: { id: string; name?: string },
  ) {
    const lm = this.workflowConfig.getLmConfig();
    const sr = await this.crmApi.getServiceRequest(ticketId);
    if (!sr.ok) {
      throw new ForbiddenException('Service request not found in CRM');
    }

    const srData = sr.data as {
      contact?: { id: string };
      number?: string;
      assigned_to?: { team?: { id?: string }; user?: { id?: string } };
    };
    const contactId = srData?.contact?.id;
    if (!contactId) {
      throw new ForbiddenException('Service request has no linked contact');
    }

    const idempotencyKey = `lm:${ticketId}:${dto.address_id}:${dto.name.trim()}`;
    const payload = {
      name: dto.name.trim(),
      description: dto.description.trim(),
      type_id: lm.activityTypeId,
      date: this.lmActivityDateUnix(dto.activity_date),
      from_time: null,
      to_time: null,
      address_id: dto.address_id,
      notes: dto.notes?.trim() ?? '',
      custom_fields: [] as unknown[],
      assigned_to: {
        user_id: null,
        team_id: lm.transportTeamId,
      },
      linked_to: [
        { type: 'CONTACT', id: contactId },
        { type: 'SERVICE_REQUEST', id: ticketId },
      ],
    };

    const created = await this.crmApi.createActivity(payload);
    if (!created.ok) {
      const err = created.data as { message?: string };
      throw new ForbiddenException(
        err?.message ??
          `CRM could not create Last Mile activity (${created.status})`,
      );
    }

    const activity = created.data as { id?: string };
    const activityId = activity?.id;
    if (!activityId) {
      throw new ForbiddenException('CRM activity created without id');
    }

    if (dto.notes?.trim()) {
      await this.crmApi.addActivityNote(activityId, dto.notes.trim());
    }

    const releaseTeamId =
      srData.assigned_to?.team?.id ?? lm.transportTeamId;
    const released = await this.crmApi.updateServiceRequest(ticketId, {
      assigned_to: {
        user_id: null,
        team_id: releaseTeamId,
      },
    });
    if (!released.ok) {
      this.logger.error(
        'Ticket Service',
        `LM handoff: failed to release technician from SR ${ticketId}`,
      );
    }

    const srNote = [
      `Last Mile handoff: "${dto.name.trim()}" assigned to ${lm.transportTeamName} by ${actor.name ?? 'technician'}. Activity ${activityId}.`,
      released.ok
        ? 'Access technician released from this service request (team queue).'
        : 'Warning: LM activity created but CRM release from technician may need manual fix.',
    ].join(' ');
    await this.crmAddNoteToTicket(ticketId, srNote, false);

    await this.audit.log({
      entity_type: 'ticket',
      entity_id: ticketId,
      action: 'LM_HANDOFF',
      actor_user_id: actor.id,
      new_state: {
        activity_id: activityId,
        state: 'PENDING',
        released_from_technician: released.ok,
      },
      crm_sync_ok: released.ok,
      idempotency_key: idempotencyKey,
    });

    this.invalidateLastMileOpsCache();

    return {
      activity_id: activityId,
      activity: created.data,
      ticket_number: srData.number,
      state: 'PENDING',
      released_from_technician: released.ok,
    };
  }

  private lastMileOpsCache: { at: number; pending: number } | null = null;

  invalidateLastMileOpsCache() {
    this.lastMileOpsCache = null;
    this.transportLmSummaryCache = null;
  }

  /** Pending Last Mile cabling activities (one CRM page + cache). */
  async countPendingLastMileActivities(): Promise<number> {
    const cacheMs = Number(this.config.get('LM_OPS_CACHE_MS') ?? 45_000);
    if (
      this.lastMileOpsCache &&
      Date.now() - this.lastMileOpsCache.at < cacheMs
    ) {
      return this.lastMileOpsCache.pending;
    }

    const lm = this.workflowConfig.getLmConfig();
    const activities = await this.fetchLastMileActivitiesBatch(lm);

    let pending = 0;
    for (const a of activities) {
      if (
        this.resolveCrmActivityState(
          a as { state?: string; states?: { state: string; date: number }[] },
        ) === 'PENDING'
      ) {
        pending += 1;
      }
    }

    this.lastMileOpsCache = { at: Date.now(), pending };
    return pending;
  }

  private transportLmSummaryCache: {
    at: number;
    data: {
      team_id: string;
      unassigned_new: number;
      assigned_new: number;
      in_progress: number;
      assigned_in_progress: number;
      breakdown: {
        unassigned: { label: string; count: number }[];
        assigned: { label: string; count: number }[];
        in_progress: { label: string; count: number }[];
      };
    };
  } | null = null;

  async fetchTransportLmRegionSummary() {
    const cacheMs = Number(this.config.get('LM_OPS_CACHE_MS') ?? 45_000);
    if (
      this.transportLmSummaryCache &&
      Date.now() - this.transportLmSummaryCache.at < cacheMs
    ) {
      return this.transportLmSummaryCache.data;
    }
    const data = await this.buildTransportLmRegionSummary();
    this.transportLmSummaryCache = { at: Date.now(), data };
    return data;
  }

  private async buildTransportLmRegionSummary() {
    const lm = this.workflowConfig.getLmConfig();
    const activities = (await this.fetchLastMileActivitiesBatch(lm)) as {
      name?: string;
      type?: { name?: string };
      state?: string;
      states?: { state: string; date: number }[];
      assigned_to?: { user?: { id?: string } };
      service_request?: { id?: string; number?: string };
    }[];

    const unassigned = [];
    const assigned = [];
    const inProgress = [];
    for (const activity of activities) {
      const state = this.resolveCrmActivityState(activity);
      if (state === 'IN_PROGRESS') {
        inProgress.push(activity);
      } else if (state === 'PENDING' || state === 'NEW') {
        if (activity.assigned_to?.user?.id) {
          assigned.push(activity);
        } else {
          unassigned.push(activity);
        }
      }
    }

    const kindByRequest = new Map<string, string>();
    const requestIds = [
      ...new Set(
        [...unassigned, ...assigned, ...inProgress]
          .map(activity => activity.service_request?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    await Promise.all(
      requestIds.map(async id => {
        const serviceRequest = await this.FetchRequestDetails(id);
        if (!serviceRequest || serviceRequest instanceof ForbiddenException) {
          return;
        }
        kindByRequest.set(id, this.ticketWorkKind(serviceRequest));
      }),
    );

    const group = (rows: (typeof activities)[number][]) => {
      const counts = new Map<string, number>();
      for (const row of rows) {
        const fromRequest = row.service_request?.id
          ? kindByRequest.get(row.service_request.id)
          : undefined;
        const label =
          fromRequest && fromRequest !== 'Other'
            ? fromRequest
            : row.type?.name?.trim() || 'Last Mile';
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    };

    return {
      team_id: lm.transportTeamId,
      unassigned_new: unassigned.length,
      assigned_new: assigned.length,
      in_progress: inProgress.length,
      assigned_in_progress: inProgress.length,
      breakdown: {
        unassigned: group(unassigned),
        assigned: group(assigned),
        in_progress: group(inProgress),
      },
    };
  }

  private isLastMileActivityRow(
    activity: {
      name?: string;
      type?: { id?: string; name?: string };
      type_id?: string;
    },
    lm: { activityTypeId: string; activityTypeName: string },
  ): boolean {
    if (
      activity.type?.id === lm.activityTypeId ||
      activity.type_id === lm.activityTypeId ||
      activity.type?.name === lm.activityTypeName
    ) {
      return true;
    }
    const name = (activity.name ?? '').toLowerCase();
    return name.includes('last mile') || name.includes('lm cabling');
  }

  private activityAssignedToTransportTeam(
    activity: {
      assigned_to?: { team?: { id?: string } };
    },
    transportTeamId: string,
  ): boolean {
    return activity.assigned_to?.team?.id === transportTeamId;
  }

  private async fetchLastMileActivitiesBatch(lm: {
    activityTypeId: string;
    activityTypeName: string;
    transportTeamId: string;
  }): Promise<unknown[]> {
    const size = 100;
    const attempts: Record<string, string | number>[] = [
      { teams: lm.transportTeamId, size, page: 1 },
      { type_id: lm.activityTypeId, size, page: 1 },
      { activity_type_id: lm.activityTypeId, size, page: 1 },
    ];

    for (const query of attempts) {
      const res = await this.crmApi.listActivitiesPage(query);
      if (!res.ok || !Array.isArray(res.data?.content)) {
        continue;
      }
      const content = res.data.content as {
        name?: string;
        type?: { id?: string; name?: string };
        type_id?: string;
        assigned_to?: { team?: { id?: string } };
      }[];

      const byType = content.filter((row) =>
        this.isLastMileActivityRow(row, lm),
      );
      if (byType.length > 0) {
        return byType;
      }

      if (query.teams) {
        const onTransport = content.filter((row) =>
          this.activityAssignedToTransportTeam(row, lm.transportTeamId),
        );
        const lmOnTransport = onTransport.filter((row) =>
          this.isLastMileActivityRow(row, lm),
        );
        if (lmOnTransport.length > 0) {
          return lmOnTransport;
        }
      }

      if (query.type_id || query.activity_type_id) {
        if (content.length > 0) {
          return content;
        }
      }
    }

    return [];
  }

  async listLastMileActivities(ticketId: string) {
    const lm = this.workflowConfig.getLmConfig();
    const res = await this.crmApi.listActivitiesByServiceRequest(ticketId);
    if (!res.ok) {
      throw new ForbiddenException('Could not load activities from CRM');
    }
    const activities = (res.data?.content ?? []) as {
      id: string;
      name: string;
      state: string;
      type?: { id: string; name: string };
      assigned_to?: unknown;
    }[];
    return activities.filter(
      (a) =>
        a.type?.id === lm.activityTypeId ||
        a.type?.name === lm.activityTypeName,
    );
  }

  async completeLastMileActivity(
    activityId: string,
    actor: { id: string; name?: string },
  ) {
    const before = await this.crmApi.getActivity(activityId);
    if (!before.ok) {
      throw new ForbiddenException('Activity not found in CRM');
    }

    const updated = await this.crmApi.updateActivityState(activityId, 'COMPLETED');
    if (!updated.ok) {
      throw new ForbiddenException(
        `CRM could not complete activity (${updated.status})`,
      );
    }

    const activity = before.data as {
      service_request?: { id: string; number?: string };
    };
    const ticketId = activity?.service_request?.id;

    if (ticketId) {
      const note = `Last Mile activity ${activityId} marked COMPLETED by ${actor.name ?? 'user'}.`;
      await this.crmAddNoteToTicket(ticketId, note, false);
      await this.audit.log({
        entity_type: 'activity',
        entity_id: activityId,
        action: 'LM_COMPLETE',
        actor_user_id: actor.id,
        new_state: { state: 'COMPLETED', ticket_id: ticketId },
        crm_sync_ok: true,
        idempotency_key: `lm-complete:${activityId}`,
      });
    }

    this.invalidateLastMileOpsCache();

    return updated.data;
  }

  async createActivity(
    ticket_id: string,
    data: CreateActivityDto,
  ): Promise<any> {
    let crm_create_activity = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') + '/activities',
      {
        method: 'POST',
        body: JSON.stringify({
          assigned_to: {
            team_id: data.assigned_to_team_id + 's',
          },
          type_id: data.type_id,
          name: data.name,
          description: data.description,
          linked_to: [
            {
              type: 'SERVICE_REQUEST',
              id: ticket_id,
            },
          ],
        }),
        headers: {
          api_key: this.config.get('CRM_API_KEY'),
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
    );

    if (!crm_create_activity.ok) {
      this.logger.error('Ticket Service', 'CRM Activity not created');
      return new ForbiddenException('CRM Activity not created');
    }

    this.logger.log('Ticket Service', 'CRM Activity created');

    return crm_create_activity.json();
  }

  private async listTeams() {
    let crm_teams = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') + '/teams',
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );

    if (!crm_teams.ok) {
      this.logger.error('Ticket Service', 'CRM Teams not found');
      return new ForbiddenException('CRM Teams not found');
    }

    this.logger.log('Ticket Service', 'CRM Teams found');

    return crm_teams.json();
  }

  private async listActivityTypes() {
    let crm_activity_types = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') + '/activities/types',
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );

    if (!crm_activity_types.ok) {
      this.logger.error('Ticket Service', 'CRM Activity types not found');
      return new ForbiddenException('CRM Activity types not found');
    }

    this.logger.log('Ticket Service', 'CRM Activity types found');

    return crm_activity_types.json();
  }

  private async listServiceRequestCategories() {
    let crm_service_request_categories = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') +
        '/service_requests/categories',
      {
        headers: {
          content_type: 'application/json',
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );

    if (!crm_service_request_categories.ok) {
      this.logger.error(
        'Ticket Service',
        'CRM Service request categories not found',
      );
      return new ForbiddenException('CRM Service request categories not found');
    }

    this.logger.log('Ticket Service', 'CRM Service request categories found');

    return crm_service_request_categories.json();
  }

  async scheduleVisit(
    ticket_id: string,
    reqUser: { id: string; name?: string; phone?: string },
    dto: { scheduled_at: string; notify_customer?: boolean },
  ) {
    const scheduledAt = new Date(dto.scheduled_at);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new ForbiddenException('Invalid schedule date');
    }

    const idempotencyKey = `schedule:${ticket_id}:${scheduledAt.toISOString()}`;
    const existing = await this.prisma.ticketSchedule.findUnique({
      where: { idempotency_key: idempotencyKey },
    });
    if (existing) {
      return { scheduled: existing, duplicate: true };
    }

    const crmTicket = await this.crmApi.getServiceRequest(ticket_id);
    if (!crmTicket.ok) {
      throw new ForbiddenException('Ticket not found in CRM');
    }

    const ticketData = crmTicket.data as {
      number?: string;
      contact?: { phone?: { number?: string } };
    };

    const techName = reqUser.name ?? 'Technician';
    const dateStr = scheduledAt.toLocaleDateString('en-GB');
    const timeStr = scheduledAt.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const comment = `Ticket scheduled for approximately ${timeStr} on ${dateStr} by ${techName}.`;
    const noteResult = await this.crmAddNoteToTicket(ticket_id, comment, false);
    if (noteResult instanceof ForbiddenException) {
      throw noteResult;
    }

    const row = await this.prisma.ticketSchedule.create({
      data: {
        crm_ticket_id: ticket_id,
        scheduled_at: scheduledAt,
        technician_user_id: reqUser.id,
        idempotency_key: idempotencyKey,
      },
    });

    let smsSent = false;
    if (dto.notify_customer !== false) {
      const message = await this.templates.render('VISIT_SCHEDULED', {
        SR_ID: ticketData?.number ?? ticket_id,
        TIME: timeStr,
        DATE: dateStr,
        NAME: techName,
        CONTACT: reqUser.phone ?? '',
      });
      const phone = ticketData?.contact?.phone?.number;
      if (message && phone) {
        try {
          await this.sms.publishSMS({ phone, message });
          smsSent = true;
          await this.prisma.ticketSchedule.update({
            where: { id: row.id },
            data: { sms_sent: true },
          });
        } catch {
          this.logger.error('Ticket Service', 'Schedule SMS failed');
        }
      }
    }

    await this.audit.log({
      entity_type: 'ticket',
      entity_id: ticket_id,
      action: 'SCHEDULE_VISIT',
      actor_user_id: reqUser.id,
      new_state: { scheduled_at: scheduledAt.toISOString(), sms_sent: smsSent },
      crm_sync_ok: true,
      idempotency_key: idempotencyKey,
    });

    return {
      scheduled: row,
      ticket_number: ticketData?.number,
      sms_sent: smsSent,
    };
  }
}
