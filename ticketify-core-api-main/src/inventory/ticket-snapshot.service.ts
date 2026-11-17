import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ticketCategory } from 'src/assignment/assignment-settings.service';
import { CrmApiClient } from 'src/infrastructure/crm/crm-api.client';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { OoredooFmsClient } from 'src/infrastructure/ooredoo-fms/ooredoo-fms.client';
import { isFmsTicketId } from 'src/infrastructure/ooredoo-fms/ooredoo-fms.types';

/** CRM facts copied onto inventory and provisioning records for reporting. */
export type TicketSnapshot = {
  crm_ticket_id: string;
  sr_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  contact_id: string | null;
  service_type: string | null;
  category: ReturnType<typeof ticketCategory>;
  department: string | null;
  area: string | null;
  address: string | null;
  assigned_crm_user_id: string | null;
  /** CRM lifecycle state, e.g. NEW, IN_PROGRESS, CLOSED. */
  state: string | null;
  /** FMS ONT serial when this snapshot came from Ooredoo. */
  ont_serial?: string | null;
  source?: 'MEDIANET' | 'OOREDOO';
};

type CrmAddress = {
  address_line_1?: string;
  address_line_2?: string;
  town_city?: string;
  state_province_county?: string;
};

type CrmServiceRequest = {
  number?: string;
  state?: string;
  queue?: { name?: string };
  owner_team?: { name?: string };
  assigned_to?: { user?: { id?: string }; team?: { name?: string } };
  /** Service address of this request. */
  address?: CrmAddress | null;
  contact?: {
    id?: string;
    name?: string;
    phone?: { number?: string };
    person_name?: { full_name?: string };
    primary_address?: CrmAddress | null;
  };
};

const TTL_MS = 60_000;
const MAX_CACHE = 2000;

@Injectable()
export class TicketSnapshotService {
  private readonly cache = new Map<
    string,
    { at: number; value: TicketSnapshot }
  >();

  constructor(
    private readonly crm: CrmApiClient,
    private readonly fms: OoredooFmsClient,
    private readonly prisma: PrismaService,
  ) {}

  /** @param fresh skip the cache, for decisions that must see the current assignee / state. */
  async get(crmTicketId: string, fresh = false): Promise<TicketSnapshot> {
    const cached = this.cache.get(crmTicketId);
    if (!fresh && cached && Date.now() - cached.at < TTL_MS) {
      return cached.value;
    }
    const value = isFmsTicketId(crmTicketId)
      ? await this.fromFms(crmTicketId)
      : await this.fromCrm(crmTicketId);
    if (this.cache.size >= MAX_CACHE) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(crmTicketId, { at: Date.now(), value });
    return value;
  }

  private async fromCrm(crmTicketId: string): Promise<TicketSnapshot> {
    const result = await this.crm
      .getServiceRequest(encodeURIComponent(crmTicketId))
      .catch(() => null);
    if (!result || (!result.ok && result.status >= 500)) {
      throw new ServiceUnavailableException(
        'CRM is not responding. Try again.',
      );
    }
    if (!result.ok) {
      throw new NotFoundException('Service request not found');
    }
    const sr = (result.data ?? {}) as CrmServiceRequest;
    const address = sr.address ?? sr.contact?.primary_address ?? null;
    return {
      crm_ticket_id: crmTicketId,
      sr_number: sr.number ?? null,
      customer_name:
        sr.contact?.person_name?.full_name ?? sr.contact?.name ?? null,
      customer_phone: sr.contact?.phone?.number ?? null,
      contact_id: sr.contact?.id ?? null,
      service_type: sr.queue?.name?.trim() || null,
      category: ticketCategory(sr),
      department: sr.owner_team?.name ?? sr.assigned_to?.team?.name ?? null,
      area:
        address?.town_city?.trim() ||
        address?.state_province_county?.trim() ||
        null,
      address:
        [address?.address_line_1, address?.address_line_2, address?.town_city]
          .map((part) => part?.trim())
          .filter(Boolean)
          .join(', ') || null,
      assigned_crm_user_id: sr.assigned_to?.user?.id ?? null,
      state: sr.state?.toUpperCase() ?? null,
      source: 'MEDIANET',
    };
  }

  /** Ooredoo FMS tickets — same snapshot shape so INCA / inventory keep working. */
  private async fromFms(ticketId: string): Promise<TicketSnapshot> {
    if (!this.fms.enabled()) {
      throw new ServiceUnavailableException('Ooredoo FMS is not enabled');
    }
    let detail;
    try {
      detail = await this.fms.getTicket(ticketId);
    } catch {
      throw new NotFoundException('Ooredoo ticket not found');
    }
    const closed = /fault\s*resolved|cancelled|canceled|closed/i.test(
      detail.status ?? '',
    );
    const local = await this.prisma.fmsTicketAssignment.findUnique({
      where: { fms_ticket_id: ticketId },
    });
    let assignedCrmUserId: string | null = null;
    if (local?.ooredoo_user_id) {
      const user = await this.prisma.user.findFirst({
        where: {
          source: 'OOREDOO',
          ooredoo_user_id: local.ooredoo_user_id,
        },
        select: { crm_user_id: true },
      });
      assignedCrmUserId = user?.crm_user_id ?? `ooredoo-${local.ooredoo_user_id}`;
    } else if (detail.assignee_email) {
      const user = await this.prisma.user.findFirst({
        where: {
          source: 'OOREDOO',
          email: detail.assignee_email.trim().toLowerCase(),
        },
        select: { crm_user_id: true },
      });
      assignedCrmUserId = user?.crm_user_id ?? null;
    }
    const fmsCategory = (detail.category ?? '').toLowerCase();
    const category =
      fmsCategory.includes('new')
        ? ('new_connections' as const)
        : fmsCategory.includes('relocat')
          ? ('relocation' as const)
          : ('fault' as const);
    return {
      crm_ticket_id: ticketId,
      sr_number: detail.salesforce_id || detail.id,
      customer_name: detail.customer_name,
      customer_phone: detail.customer_contact,
      contact_id: detail.account_number,
      service_type: detail.queue,
      category,
      department: detail.partner,
      area: detail.region,
      address: null,
      assigned_crm_user_id: assignedCrmUserId,
      state: closed ? 'CLOSED' : 'IN_PROGRESS',
      ont_serial: detail.serial_number,
      source: 'OOREDOO',
    };
  }
}
