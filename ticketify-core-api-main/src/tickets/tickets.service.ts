import {
  ForbiddenException,
  Injectable,
  Req,
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
    let service_request = await this.FetchRequestDetails(crm_id);

    this.logger.log('Ticket Service', 'CRM Service request found');
    this.logger.log(
      'Ticket Service',
      service_request?.categories ? 'Categories found' : 'No categories found',
    );
    let service_request_notes = await this.FetchServiceRequestNotes(crm_id);
    let service_request_activities = await this.fetchRequestActivities(crm_id);
    let service_request_queue_stages =
      await this.fetchRequestQueueStages(crm_id);

    let queue_info = await this.crmFindQueueById(service_request.queue?.id);
    console.log(queue_info);
    let contact_details = await this.fetchContactDetails(
      service_request.contact?.id,
    );
    let service_request_attachments =
      await this.FetchServiceRequestAttachments(crm_id);

    await Promise.all(
      service_request_attachments?.content?.map(async (attachment) => {
        attachment.file_url =
          this.config.get('API_URL') + '/files/' + attachment.file?.id;
      }),
    );
    service_request.queue_info = queue_info;
    service_request.queue = service_request_queue_stages;
    service_request.notes = service_request_notes;
    service_request.attachments = service_request_attachments;
    service_request.activities = service_request_activities;
    service_request.contact = contact_details;
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

  async toggleNoResponse(id: string) {
    this.logger.log('Ticket Service', 'Updating service request tag');
    let ticket = await this.crmFindServiceRequest(id);

    if (ticket.categories?.some((cat) => cat.name === 'No Response')) {
      this.logger.log('Ticket Service', 'No Response tag already present');
      // remove No Response tag
      let crm_remove_service_request_tag = await fetch(
        this.config.get('CRM_BACKOFFICE_API_URL') + '/service_requests/' + id,
        {
          method: 'PUT',
          body: JSON.stringify({
            categories: [],
          }),
          headers: {
            api_key: this.config.get('CRM_API_KEY'),
            accept: 'application/json',
            'Content-Type': 'application/json',
          },
        },
      );

      if (!crm_remove_service_request_tag.ok) {
        this.logger.error(
          'Ticket Service',
          'CRM Service request tag not removed',
        );
        return new ForbiddenException('CRM Service request tag not removed');
      }

      this.logger.log('Ticket Service', 'CRM Service request tag removed');
      return {
        message: 'Service request tag removed successfully',
        tags: await crm_remove_service_request_tag.json(),
      };
    }

    const no_response_category_id = '802425fd-5a7e-4ce8-b8a5-3c81b13da247';

    let crm_update_service_request_tag = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') + '/service_requests/' + id,
      {
        method: 'PUT',
        body: JSON.stringify({
          categories: [
            {
              id: no_response_category_id,
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

    if (!crm_update_service_request_tag.ok) {
      this.logger.error(
        'Ticket Service',
        'CRM Service request tag not updated',
      );
      return new ForbiddenException('CRM Service request tag not updated');
    }

    // create ticket note
    await this.crmAddNoteToTicket(
      id,
      'Technician marked No Response due to unsuccessful contact attempt. The customer has been notified to reschedule the appointment.',
      false,
    );

    this.logger.log('Ticket Service', 'CRM Service request tag updated');

    await this.sms.publishSMS({
      phone: ticket.contact.phone.number,
      message: `
Dear ${ticket.contact.person_name.full_name},
Our technician tried to contact you but was unable to reach you. Please let us know a convenient time so we can reschedule your appointment.
Thank you for your patience.
Medianet Support Team
        `,
    });

    let result = await crm_update_service_request_tag.json();

    return {
      message: 'Service request tag updated successfully',
      tags: result,
    };
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

  async fetchFile(file_id: string) {
    this.logger.log('Ticket Service', 'Fetching file');
    let crm_file = await this.fetchRequestFile(file_id);
    this.logger.log('Ticket Service', 'File fetched');

    return crm_file;
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

  async startTicket(ticket_id: string, stage_id?: string) {
    const ticket = await this.crmFindServiceRequest(ticket_id);

    if (ticket?.state !== 'NEW') {
      throw new ForbiddenException('Ticket must be assigned before starting');
    }

    const targetStageId = this.resolveNextStageId(ticket, stage_id);
    const user = await this.user.crmGetUser(ticket.assigned_to?.user?.id);

    this.logger.log(
      'Ticket Service',
      `Starting ticket ${ticket_id} with stage ${targetStageId}`,
    );

    const crm_start_service_request = await fetch(
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
          action: 'START_PROGRESS',
          comment: 'Starting ticket',
          achieved_date: new Date().toISOString(),
          stage_id: targetStageId,
        }),
      },
    );

    const response = await crm_start_service_request.json();

    if (!crm_start_service_request.ok) {
      this.logger.error(
        'Ticket Service',
        `CRM START_PROGRESS failed: ${JSON.stringify(response)}`,
      );
      throw new ForbiddenException(
        response?.message ?? 'Service request could not be started in CRM',
      );
    }

    try {
      await this.sms.publishSMS({
        phone: ticket?.contact?.phone?.number,
        message: `
Dear ${ticket?.contact?.person_name?.full_name},

Your ticket: ${ticket?.number} has been assigned to ${user?.first_name} ${user?.last_name} and  the technician will be visiting you shortly.
Please make sure to be available at the location. Our team will be in touch with you shortly.

Thank you for your patience.
Medianet Support Team
        `,
      });
      this.logger.log('Ticket Service', 'SMS sent');
    } catch {
      this.logger.error(
        'Ticket Service',
        'SMS not sent after ticket start (CRM update succeeded)',
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

  async completeTicket(ticket_id: string, comment: string, stage_id: string) {
    let ticket = await this.crmFindServiceRequest(ticket_id);
    let user = await this.user.crmGetUser(ticket.assigned_to?.user?.id);
    console.log('Closing ticket' + ticket_id + 'to stage ' + stage_id);
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
          stage_id: stage_id,
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

  async fetchRequestFile(file_id: string) {
    let crm_request_file = await fetch(
      this.config.get('CRM_BACKOFFICE_API_URL') +
        '/files/8e6ca7f6-9577-4ab9-8699-a9ff8ae6d3c8',
      {
        headers: {
          api_key: this.config.get('CRM_API_KEY'),
        },
      },
    );
    //app.crm.com/backoffice/v2/files/8e6ca7f6-9577-4ab9-8699-a9ff8ae6d3c8

    if (!crm_request_file.ok) {
      this.logger.error('Ticket Service', 'CRM file not found');
      return new ForbiddenException('CRM file not found');
    }

    this.logger.log('Ticket Service', 'CRM  file found');

    return crm_request_file;
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
    let crm_activity_types = await this.listActivityTypes();

    if (!crm_activity_types) {
      this.logger.error('Ticket Service', 'CRM Activity types not found');
      return new ForbiddenException('CRM Activity types not found');
    }

    let ticket_activities = await this.fetchRequestActivities(id);

    if (!ticket_activities) {
      this.logger.error('Ticket Service', 'CRM Ticket activities not found');
      return new ForbiddenException('CRM Ticket activities not found');
    }

    // list category
    let crm_service_request_categories =
      await this.listServiceRequestCategories();

    if (!crm_service_request_categories) {
      this.logger.error(
        'Ticket Service',
        'CRM Service request categories not found',
      );
      return new ForbiddenException('CRM Service request categories not found');
    }

    const teams = await this.listTeams();

    const lmTeam = teams.content.find(
      (team) => team.name === 'Transport Network',
    );

    return {
      activityTypes: crm_activity_types.content?.filter(
        (type) => type.name == 'Last Mile Cabling',
      ),
      teams: lmTeam,
      categories: crm_service_request_categories?.content,
    };
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
}
