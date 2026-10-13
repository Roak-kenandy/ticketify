import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CrmApiClient } from 'src/infrastructure/crm/crm-api.client';
import { ticketCategory } from 'src/assignment/assignment-settings.service';

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

  constructor(private readonly crm: CrmApiClient) {}

  async get(crmTicketId: string): Promise<TicketSnapshot> {
    const cached = this.cache.get(crmTicketId);
    if (cached && Date.now() - cached.at < TTL_MS) {
      return cached.value;
    }
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
    const value: TicketSnapshot = {
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
    };
    if (this.cache.size >= MAX_CACHE) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(crmTicketId, { at: Date.now(), value });
    return value;
  }
}
