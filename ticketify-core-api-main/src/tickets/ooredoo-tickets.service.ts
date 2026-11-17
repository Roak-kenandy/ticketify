import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { OoredooFmsClient } from 'src/infrastructure/ooredoo-fms/ooredoo-fms.client';
import {
  FMS_TICKET_STATUS,
  FmsTicketDetail,
  isFmsTicketId,
} from 'src/infrastructure/ooredoo-fms/ooredoo-fms.types';

export type OoredooActor = {
  id: string;
  email?: string;
  name?: string | null;
  source?: string;
  crm_user_id: string;
  ooredoo_user_id?: string | null;
};

const CLOSED_STATUSES = /fault\s*resolved|cancelled|canceled|closed/i;

@Injectable()
export class OoredooTicketsService {
  private readonly logger = new Logger(OoredooTicketsService.name);

  constructor(
    private readonly fms: OoredooFmsClient,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  isOoredooActor(user: { source?: string }): boolean {
    return user?.source === 'OOREDOO';
  }

  async listMine(actor: OoredooActor) {
    if (!this.fms.enabled()) {
      throw new ServiceUnavailableException(
        'Ooredoo FMS is not enabled (set OOREDOO_FMS_ENABLED=true)',
      );
    }
    const fmsUserId = actor.ooredoo_user_id?.trim();
    if (!fmsUserId) {
      throw new BadRequestException('This account has no Ooredoo user id');
    }

    // Shared tech2 FMS login (like CRM API key). Ownership is the FMS
    // assignee email / local fms_ticket_assignments — NOT per-ticket detail
    // fetches (that was timing out on 300+ tickets).
    const [localRows, summaries] = await Promise.all([
      this.prisma.fmsTicketAssignment.findMany({
        where: { ooredoo_user_id: fmsUserId },
        select: { fms_ticket_id: true },
      }),
      this.fms.listAssignedSummaries().catch((error) => {
        this.logger.warn(`FMS list failed: ${error}`);
        return [] as Awaited<ReturnType<OoredooFmsClient['listAssignedSummaries']>>;
      }),
    ]);
    const localIds = new Set(localRows.map((row) => row.fms_ticket_id));

    const mine = summaries.filter(
      (ticket) =>
        this.isAssignedTo(ticket, actor) || localIds.has(ticket.id),
    );
    // Persist ownership off the request path — N serial upserts blocked list loads.
    void this.syncAssignments(mine).catch((error) => {
      this.logger.warn(`FMS assignment sync: ${error}`);
    });

    // Local-only ids not on My Tickets yet (just assigned) — stub, never N× ticket_info.
    const missingLocal = [...localIds].filter(
      (id) => !mine.some((t) => t.id === id),
    );
    for (const id of missingLocal.slice(0, 30)) {
      mine.push({
        id,
        status: 'Open',
        priority: null,
        description: null,
        created_at: null,
        queue: null,
        customer_name: null,
        account_number: null,
        serial_number: null,
        assignee_email: actor.email?.trim().toLowerCase() ?? null,
        category: null,
        sub_category: null,
      });
    }

    const content = mine.map((ticket) => this.toListItem(ticket, actor));
    this.logger.log(
      `Ooredoo listMine ${actor.email}: ${content.length}/${summaries.length} (incl. ${localIds.size} local)`,
    );
    return {
      content,
      counts: {
        new: content.filter((t) => t.state === 'NEW').length,
        in_progress: content.filter((t) => t.state === 'IN_PROGRESS').length,
        closed_recent: content.filter((t) => t.state === 'CLOSED').length,
      },
      source: 'OOREDOO',
    };
  }

  async getDetail(ticketId: string, actor: OoredooActor) {
    this.assertFmsId(ticketId);
    const detail = await this.fms.getTicket(ticketId);
    void this.syncAssignments([detail]).catch((error) => {
      this.logger.warn(`FMS assignment sync ${ticketId}: ${error}`);
    });
    if (!(await this.canView(detail, actor))) {
      throw new NotFoundException('Ticket not found');
    }
    return this.toDetail(detail, actor);
  }

  async assignToMe(ticketId: string, actor: OoredooActor) {
    this.assertFmsId(ticketId);
    const fmsUserId = actor.ooredoo_user_id?.trim();
    if (!fmsUserId) {
      throw new BadRequestException('This account has no Ooredoo user id');
    }
    await this.fms.assignUser(
      ticketId,
      fmsUserId,
      `Assigned in mPro by ${actor.name ?? actor.email ?? 'technician'}`,
    );
    await this.prisma.fmsTicketAssignment.upsert({
      where: { fms_ticket_id: ticketId },
      create: {
        fms_ticket_id: ticketId,
        ooredoo_user_id: fmsUserId,
        assignee_email: actor.email?.trim().toLowerCase() ?? null,
        assigned_by_user_id: actor.id,
      },
      update: {
        ooredoo_user_id: fmsUserId,
        assignee_email: actor.email?.trim().toLowerCase() ?? null,
        assigned_by_user_id: actor.id,
      },
    });
    return this.getDetail(ticketId, actor);
  }

  /** Supervisor-style assign to any Ooredoo tech id (FMS user id). */
  async assignToUser(
    ticketId: string,
    ooredooUserId: string,
    actor: OoredooActor,
    comment?: string,
  ) {
    this.assertFmsId(ticketId);
    const targetId = ooredooUserId.trim();
    if (!/^[0-9]{1,12}$/.test(targetId)) {
      throw new BadRequestException('Invalid Ooredoo user id');
    }
    const target = await this.prisma.user.findFirst({
      where: { source: 'OOREDOO', ooredoo_user_id: targetId },
      select: { id: true, email: true, name: true },
    });
    await this.fms.assignUser(
      ticketId,
      targetId,
      comment?.trim() ||
        `Assigned in mPro by ${actor.name ?? actor.email ?? 'staff'}`,
    );
    await this.prisma.fmsTicketAssignment.upsert({
      where: { fms_ticket_id: ticketId },
      create: {
        fms_ticket_id: ticketId,
        ooredoo_user_id: targetId,
        assignee_email: target?.email?.toLowerCase() ?? null,
        assigned_by_user_id: actor.id,
      },
      update: {
        ooredoo_user_id: targetId,
        assignee_email: target?.email?.toLowerCase() ?? null,
        assigned_by_user_id: actor.id,
      },
    });
    return this.getDetail(ticketId, actor);
  }

  async addNote(ticketId: string, note: string, actor: OoredooActor) {
    this.assertFmsId(ticketId);
    await this.fms.addComment(ticketId, note);
    return this.getDetail(ticketId, {
      ...actor,
    });
  }

  async editOptions(ticketId: string, actor: OoredooActor) {
    this.assertFmsId(ticketId);
    // getEditOptions loads ticket_info once (HTML reused for auth + dropdowns).
    const options = await this.fms.getEditOptions(ticketId);
    const detail = await this.fms.getTicket(ticketId);
    if (!(await this.canView(detail, actor))) {
      throw new NotFoundException('Ticket not found');
    }
    return options;
  }

  async listSubCategories(
    ticketId: string,
    categoryId: string,
    actor: OoredooActor,
  ) {
    this.assertFmsId(ticketId);
    const detail = await this.fms.getTicket(ticketId);
    if (!(await this.canView(detail, actor))) {
      throw new NotFoundException('Ticket not found');
    }
    if (!/^\d+$/.test(categoryId)) {
      throw new BadRequestException('Invalid category id');
    }
    return {
      category_id: categoryId,
      items: await this.fms.listSubCategories(categoryId),
    };
  }

  async updatePriority(
    ticketId: string,
    priorityId: string,
    comment: string,
    actor: OoredooActor,
  ) {
    this.assertFmsId(ticketId);
    this.requireComment(comment);
    if (!/^\d+$/.test(priorityId)) {
      throw new BadRequestException('Invalid priority');
    }
    await this.fms.setPriority(ticketId, priorityId, comment.trim());
    return this.getDetail(ticketId, actor);
  }

  async updateStatus(
    ticketId: string,
    statusId: string,
    subComment: string,
    comment: string,
    actor: OoredooActor,
  ) {
    this.assertFmsId(ticketId);
    this.requireComment(comment);
    if (!/^\d+$/.test(statusId)) {
      throw new BadRequestException('Invalid status');
    }
    if (!subComment?.trim()) {
      throw new BadRequestException('Choose a status sub-comment');
    }
    await this.fms.changeStatus(
      ticketId,
      Number(statusId),
      subComment.trim(),
      comment.trim(),
    );
    return this.getDetail(ticketId, actor);
  }

  async updateQueue(
    ticketId: string,
    queueId: string,
    queueSubcatId: string,
    comment: string,
    actor: OoredooActor,
  ) {
    this.assertFmsId(ticketId);
    this.requireComment(comment);
    if (!/^\d+$/.test(queueId) || !/^\d+$/.test(queueSubcatId)) {
      throw new BadRequestException('Invalid queue selection');
    }
    await this.fms.setQueue(
      ticketId,
      queueId,
      queueSubcatId,
      comment.trim(),
    );
    return this.getDetail(ticketId, actor);
  }

  async updateCategory(
    ticketId: string,
    categoryId: string,
    subCategoryId: string,
    comment: string,
    actor: OoredooActor,
  ) {
    this.assertFmsId(ticketId);
    this.requireComment(comment);
    if (!/^\d+$/.test(categoryId) || !/^\d+$/.test(subCategoryId)) {
      throw new BadRequestException('Invalid category selection');
    }
    await this.fms.setCategory(
      ticketId,
      categoryId,
      subCategoryId,
      comment.trim(),
    );
    return this.getDetail(ticketId, actor);
  }

  private requireComment(comment: string) {
    if (!comment?.trim()) {
      throw new BadRequestException('Add a short comment for the change');
    }
  }

  async complete(
    ticketId: string,
    comment: string,
    closingSubComment: string | undefined,
    actor: OoredooActor,
  ) {
    this.assertFmsId(ticketId);
    const detail = await this.fms.getTicket(ticketId);
    if (!this.isAssignedTo(detail, actor)) {
      throw new BadRequestException('Only the assigned technician can close');
    }
    await this.fms.changeStatus(
      ticketId,
      FMS_TICKET_STATUS.FAULT_RESOLVED,
      closingSubComment?.trim() || 'Resolved by Field Team',
      comment?.trim() || 'Closed from mPro',
    );
    return this.getDetail(ticketId, actor);
  }

  async uploadAttachment(
    ticketId: string,
    file: {
      buffer: Buffer;
      mimetype?: string;
      originalname?: string;
      size?: number;
    },
    description: string,
    actor: OoredooActor,
  ) {
    this.assertFmsId(ticketId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Choose a photo to upload');
    }
    if (!description?.trim()) {
      throw new BadRequestException(
        'Add a short description for the attachment',
      );
    }
    const detail = await this.fms.getTicket(ticketId);
    if (!(await this.canView(detail, actor))) {
      throw new NotFoundException('Ticket not found');
    }
    // Ooredoo attachments go to FMS — not local mPro storage.
    await this.fms.uploadTicketAttachment(
      ticketId,
      {
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
      },
      description.trim(),
    );
    const refreshed = await this.getDetail(ticketId, actor);
    return {
      message: 'Attachment uploaded to FMS',
      attachment: refreshed.attachments?.content?.[0] ?? null,
    };
  }

  async addressForm(ticketId: string, actor: OoredooActor) {
    this.assertFmsId(ticketId);
    const detail = await this.fms.getTicket(ticketId);
    if (!(await this.canView(detail, actor))) {
      throw new NotFoundException('Ticket not found');
    }
    return this.fms.getAddressForm(ticketId);
  }

  async listIslands(ticketId: string, atollId: string, actor: OoredooActor) {
    this.assertFmsId(ticketId);
    const detail = await this.fms.getTicket(ticketId);
    if (!(await this.canView(detail, actor))) {
      throw new NotFoundException('Ticket not found');
    }
    if (!atollId?.trim()) {
      throw new BadRequestException('Choose an atoll');
    }
    return {
      atoll_id: atollId,
      items: await this.fms.listIslands(atollId.trim()),
    };
  }

  async updateAddress(
    ticketId: string,
    body: {
      address1: string;
      address2?: string;
      street: string;
      company?: string;
      zip?: string;
      country_id: string;
      atoll_id: string;
      island_id: string;
    },
    actor: OoredooActor,
  ) {
    this.assertFmsId(ticketId);
    const detail = await this.fms.getTicket(ticketId);
    if (!(await this.canView(detail, actor))) {
      throw new NotFoundException('Ticket not found');
    }
    if (!this.isRelocationTicket(detail)) {
      throw new BadRequestException(
        'Customer address can only be updated on Relocation tickets',
      );
    }
    if (!body.address1?.trim() || !body.street?.trim()) {
      throw new BadRequestException('Address 1 and street are required');
    }
    if (!body.atoll_id?.trim() || !body.island_id?.trim()) {
      throw new BadRequestException('Choose atoll and island');
    }
    if (!body.country_id?.trim()) {
      throw new BadRequestException('Choose a country');
    }
    await this.fms.updateInstallationAddress(ticketId, {
      address1: body.address1,
      address2: body.address2,
      street: body.street,
      company: body.company,
      zip: body.zip,
      country_id: body.country_id,
      atoll_id: body.atoll_id,
      island_id: body.island_id,
    });
    return this.getDetail(ticketId, actor);
  }

  private isRelocationTicket(ticket: {
    category?: string | null;
    type?: string | null;
    sub_category?: string | null;
  }) {
    return /relocat/i.test(
      `${ticket.category ?? ''} ${ticket.type ?? ''} ${ticket.sub_category ?? ''}`,
    );
  }

  async readAttachmentFile(ticketId: string, fileId: string) {
    this.assertFmsId(ticketId);
    // Legacy local uploads (pre-FMS proxy) — keep readable.
    const legacy = await this.prisma.fmsTicketAttachment.findFirst({
      where: { id: fileId, fms_ticket_id: ticketId },
    });
    if (legacy) {
      const abs = path.join(this.storageRoot(), legacy.storage_key);
      const buffer = await fs.readFile(abs);
      return { buffer, contentType: legacy.mime_type };
    }
    const detail = await this.fms.getTicket(ticketId);
    const match = (detail.attachments ?? []).find((a) => a.id === fileId);
    if (!match?.file_url) {
      throw new NotFoundException('Attachment not found');
    }
    return this.fms.downloadAttachment(match.file_url);
  }

  /** Dashboard status board without hitting CRM (Ooredoo has no CRM buckets). */
  async statusBoard(actor: OoredooActor) {
    const list = await this.listMine(actor);
    const pending = (list.content ?? []).filter((t) => t.state !== 'CLOSED');
    return {
      scope: 'mine' as const,
      generated_at: new Date().toISOString(),
      counts: {
        pending: pending.length,
        no_response: 0,
        payment_pending: 0,
        rescheduled: 0,
      },
      no_response_available: false,
      failed_teams: [] as string[],
      team: null,
      teams: [] as { id: string; name: string; count: number }[],
      tickets: {
        pending,
        no_response: [],
        payment_pending: [],
        rescheduled: [],
      },
      source: 'OOREDOO',
    };
  }

  /** Billing is never required for Ooredoo FMS tickets. */
  billingWorkflow(ticketId: string) {
    return {
      crm_ticket_id: ticketId,
      decision: 'NOT_CHARGEABLE' as const,
      decided_at: null,
      payment_required: false,
      payment_status: 'none' as const,
      open_invoice_id: null,
      open_invoice_number: null,
      pending_payment_reference: null,
      confirmed_receipt_number: null,
      can_close_ticket: true,
      block_close_reason: null,
      next_step: 'close_ticket' as const,
      source: 'OOREDOO',
    };
  }

  emptyContext(ticketId: string) {
    return {
      crm_ticket_id: ticketId,
      pending_lm: false,
      pending_no_response: false,
      no_response_activities: [],
      source: 'OOREDOO',
    };
  }

  private assertFmsId(ticketId: string) {
    if (!isFmsTicketId(ticketId)) {
      throw new BadRequestException('Invalid Ooredoo ticket id');
    }
  }

  private storageRoot() {
    const configured = this.config.get<string>('FMS_ATTACHMENTS_DIR');
    return configured?.trim()
      ? path.resolve(configured)
      : path.join(process.cwd(), 'storage', 'fms-attachments');
  }

  private async syncAssignments(
    details: Array<{ id: string; assignee_email: string | null }>,
  ) {
    const emails = [
      ...new Set(
        details
          .map((t) => t.assignee_email?.trim().toLowerCase())
          .filter((e): e is string => Boolean(e)),
      ),
    ];
    if (!emails.length) return;

    const users = await this.prisma.user.findMany({
      where: { source: 'OOREDOO', email: { in: emails } },
      select: { ooredoo_user_id: true, email: true },
    });
    const byEmail = new Map(
      users
        .filter((u) => u.ooredoo_user_id && u.email)
        .map((u) => [u.email!.toLowerCase(), u]),
    );

    await Promise.all(
      details.map(async (ticket) => {
        const email = ticket.assignee_email?.trim().toLowerCase();
        // Missing decode must not wipe a local assignment row.
        if (!email) return;
        const user = byEmail.get(email);
        if (!user?.ooredoo_user_id) return;
        await this.prisma.fmsTicketAssignment.upsert({
          where: { fms_ticket_id: ticket.id },
          create: {
            fms_ticket_id: ticket.id,
            ooredoo_user_id: user.ooredoo_user_id,
            assignee_email: user.email,
          },
          update: {
            ooredoo_user_id: user.ooredoo_user_id,
            assignee_email: user.email,
          },
        });
      }),
    );
  }

  private isAssignedTo(
    ticket: { assignee_email: string | null },
    actor: OoredooActor,
  ): boolean {
    const email = actor.email?.trim().toLowerCase();
    const assignee = ticket.assignee_email?.trim().toLowerCase();
    return Boolean(email && assignee && email === assignee);
  }

  private async canView(
    ticket: FmsTicketDetail,
    actor: OoredooActor,
  ): Promise<boolean> {
    // Shared FMS session — any Ooredoo tech can open queue tickets (assign / work).
    if (actor.source === 'OOREDOO' || this.isOoredooActor(actor)) {
      return true;
    }
    if (!ticket.assignee_email) {
      return true;
    }
    if (this.isAssignedTo(ticket, actor)) {
      return true;
    }
    if (!actor.ooredoo_user_id) {
      return false;
    }
    const row = await this.prisma.fmsTicketAssignment.findUnique({
      where: { fms_ticket_id: ticket.id },
    });
    return row?.ooredoo_user_id === actor.ooredoo_user_id;
  }

  async isAssignedLocally(
    ticketId: string,
    ooredooUserId: string | null | undefined,
  ): Promise<boolean> {
    if (!ooredooUserId) return false;
    const row = await this.prisma.fmsTicketAssignment.findUnique({
      where: { fms_ticket_id: ticketId },
    });
    return row?.ooredoo_user_id === ooredooUserId;
  }

  private mapState(status: string | null): 'NEW' | 'IN_PROGRESS' | 'CLOSED' {
    if (status && CLOSED_STATUSES.test(status)) {
      return 'CLOSED';
    }
    if (!status || /open/i.test(status)) {
      return 'IN_PROGRESS';
    }
    return 'IN_PROGRESS';
  }

  private assigneeView(
    ticket: { assignee_email: string | null },
    actor: OoredooActor,
  ) {
    if (this.isAssignedTo(ticket, actor)) {
      return {
        user: {
          id: actor.crm_user_id,
          name: ticket.assignee_email ?? actor.name ?? actor.email,
        },
      };
    }
    if (!ticket.assignee_email) {
      return { user: null };
    }
    return {
      user: {
        id: `fms-other`,
        name: ticket.assignee_email,
      },
    };
  }

  private toListItem(
    ticket: {
      id: string;
      status: string | null;
      priority?: string | null;
      description: string | null;
      created_at: string | null;
      queue: string | null;
      customer_name: string | null;
      customer_contact?: string | null;
      assignee_email: string | null;
      category?: string | null;
      sub_category?: string | null;
    },
    actor: OoredooActor,
  ) {
    const state = this.mapState(ticket.status);
    // Card body = sub-category (e.g. LOS blinking); main category stays a badge only.
    const subCategory = ticket.sub_category?.trim() || null;
    const mainCategory = ticket.category?.trim() || null;
    return {
      id: ticket.id,
      number: ticket.id,
      state,
      priority: ticket.priority ?? 'Regular',
      description: subCategory || ticket.description || '',
      source: 'OOREDOO',
      creation_date: this.toUnix(ticket.created_at),
      queue: { id: 'fms', name: ticket.queue ?? 'FMS' },
      stage: this.stageFor(state),
      contact: {
        name: ticket.customer_name,
        person_name: { full_name: ticket.customer_name },
        phone: { number: ticket.customer_contact ?? null },
      },
      assigned_to: this.assigneeView(ticket, actor),
      categories: mainCategory ? [{ name: mainCategory }] : [],
      sub_category: subCategory,
    };
  }

  private async toDetail(ticket: FmsTicketDetail, actor: OoredooActor) {
    const state = this.mapState(ticket.status);
    const stage = this.stageFor(state);
    const apiUrl = String(this.config.get('API_URL') ?? '').replace(/\/$/, '');
    const mainCategory = ticket.category?.trim() || null;
    const subCategory = ticket.sub_category?.trim() || null;
    // Prefer the FMS problem description; fall back to sub-category (LOS / Slow…).
    const description =
      ticket.description?.trim() || subCategory || mainCategory || '';
    const relocation = this.isRelocationTicket(ticket);
    return {
      id: ticket.id,
      number: ticket.id,
      state,
      priority: ticket.priority ?? 'Regular',
      description,
      source: 'OOREDOO',
      creation_date: this.toUnix(ticket.created_at),
      queue: {
        id: 'fms',
        name: ticket.queue ?? 'FMS',
        content: [stage],
      },
      queue_info: {
        id: 'fms',
        name: ticket.queue ?? 'FMS',
        stages: [stage],
      },
      stage,
      contact: {
        id: ticket.account_number ?? ticket.id,
        name: ticket.customer_name,
        person_name: { full_name: ticket.customer_name },
        phone: { number: ticket.customer_contact },
        addresses: [
          {
            address_line_1: ticket.address_line_1,
            address_line_2: ticket.address_line_2,
            town_city: [ticket.street, ticket.atoll].filter(Boolean).join(', ') || null,
          },
        ].filter(
          (a) => a.address_line_1 || a.address_line_2 || a.town_city,
        ),
        // No CRM services for FMS — UI shows description in that slot instead.
        services: { content: [] },
      },
      assigned_to: this.assigneeView(ticket, actor),
      categories: mainCategory ? [{ name: mainCategory }] : [],
      sub_category: subCategory,
      notes: {
        content: ticket.comments.map((c, index) => ({
          id: `fms-note-${index}`,
          note: c.comment,
          creation_date: this.toUnix(c.at),
          created_by: { name: c.user },
        })),
      },
      activities: { content: [] },
      attachments: {
        content: (ticket.attachments ?? []).map((row, index) => {
          const id = row.id || `fms-att-${index}`;
          return {
            id,
            description: row.comment || row.file_name || 'Attachment',
            creation_date: this.toUnix(row.at),
            file: {
              id,
              name: row.file_name || 'file',
              content_type: 'application/octet-stream',
            },
            created_by: { name: row.user },
            // Proxied through mPro so the field app can load FMS files with its JWT.
            file_url: row.file_url
              ? `${apiUrl}/tickets/${ticket.id}/files/${id}`
              : null,
            source: 'OOREDOO',
          };
        }),
      },
      fms: {
        account_number: ticket.account_number,
        serial_number: ticket.serial_number,
        salesforce_id: ticket.salesforce_id,
        region: ticket.region,
        partner: ticket.partner,
        status: ticket.status,
        address_line_1: ticket.address_line_1,
        address_line_2: ticket.address_line_2,
        street: ticket.street,
        atoll: ticket.atoll,
        can_edit_address: relocation,
      },
    };
  }

  private stageFor(state: 'NEW' | 'IN_PROGRESS' | 'CLOSED') {
    if (state === 'CLOSED') {
      return {
        id: 'fms-closed',
        name: 'Closed',
        order: 1,
        colour: '#6b7280',
      };
    }
    // Single stage so the field app treats the ticket as ready to close.
    return {
      id: 'fms-close',
      name: 'Ready to close',
      order: 1,
      colour: '#16a34a',
    };
  }

  private attachmentView(row: {
    id: string;
    description: string;
    mime_type: string;
    file_name: string;
    created_at: Date;
    uploaded_by_user_id: string | null;
  }) {
    return {
      id: row.id,
      description: row.description,
      creation_date: Math.floor(row.created_at.getTime() / 1000),
      file: {
        id: row.id,
        name: row.file_name,
        content_type: row.mime_type,
      },
      created_by: { id: row.uploaded_by_user_id },
    };
  }

  private toUnix(value: string | null | undefined): number {
    if (!value) return Math.floor(Date.now() / 1000);
    const normalized = value.includes('T')
      ? value
      : value.replace(' ', 'T') + 'Z';
    const ms = Date.parse(normalized);
    return Number.isFinite(ms)
      ? Math.floor(ms / 1000)
      : Math.floor(Date.now() / 1000);
  }
}
