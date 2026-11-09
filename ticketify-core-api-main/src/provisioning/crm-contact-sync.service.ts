import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationAuditService } from 'src/infrastructure/audit/integration-audit.service';
import { CrmApiClient } from 'src/infrastructure/crm/crm-api.client';
import { LoggerService } from 'src/infrastructure/logger/logger.service';

type CrmCustomField = { key: string; value: unknown; order?: number };
type CrmContact = {
  custom_fields?: CrmCustomField[] | null;
  demographics?: {
    id_details?: { number?: string | null } | null;
  } | null;
};

export type ContactSyncRequest = {
  crm_ticket_id: string;
  contact_id: string | null;
  actor_user_id: string | null;
  /** The ONT runs operator (Ooredoo) firmware. */
  ooredoo: boolean;
  pppoe_username: string | null;
  /** New connection on a Medianet ONT: the ID card / passport entered for INCA. */
  client_identity: string | null;
};

const DEFAULT_ORGANISATION_ID = '1f739b0a-04ee-488a-8c9f-b27fc996bd34';
const DEFAULT_PROVIDER_NAME = 'Medianet Ooredoo';
const PROVIDER_TTL_MS = 60 * 60_000;
const MALDIVIAN_ID = /^A\d{6,7}$/;

/**
 * Writes provisioning facts back to the CRM contact: the ID card number for Medianet ONTs
 * (only when the CRM has none), and for Ooredoo ONTs the PPPoE id plus the
 * "Medianet Ooredoo" service provider. A CRM failure never fails the provisioning run.
 */
@Injectable()
export class CrmContactSyncService {
  private provider: { at: number; id: string; name: string } | null = null;

  constructor(
    private readonly crm: CrmApiClient,
    private readonly config: ConfigService,
    private readonly audit: IntegrationAuditService,
    private readonly logger: LoggerService,
  ) {}

  /** The contact's ID card number in the CRM, or null when it has none or CRM is down. */
  async identity(contactId: string | null): Promise<string | null> {
    if (!contactId) return null;
    try {
      const contact = await this.getContact(contactId);
      return contact ? idNumber(contact) : null;
    } catch {
      return null;
    }
  }

  /** Returns a line for the run's step log, or null when there was nothing to write. */
  async afterProvisioning(request: ContactSyncRequest): Promise<string | null> {
    if (!request.contact_id) return null;
    const username = request.pppoe_username?.trim() || null;
    const identity = request.client_identity?.trim().toUpperCase() || null;
    if (request.ooredoo ? !username : !identity) return null;
    try {
      const contact = await this.getContact(request.contact_id);
      if (!contact) throw new Error('contact not found');
      const message = request.ooredoo
        ? await this.writePppoe(request.contact_id, contact, username as string)
        : await this.writeIdentity(
            request.contact_id,
            contact,
            identity as string,
          );
      await this.audit.log({
        entity_type: 'ticket',
        entity_id: request.crm_ticket_id,
        action: 'CRM_CONTACT_SYNC',
        actor_user_id: request.actor_user_id,
        new_state: {
          contact_id: request.contact_id,
          kind: request.ooredoo ? 'pppoe_id' : 'id_card',
          result: message,
        },
        crm_sync_ok: true,
      });
      return message;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        'CRM contact sync',
        `Contact ${request.contact_id}: ${reason}`,
      );
      await this.audit.log({
        entity_type: 'ticket',
        entity_id: request.crm_ticket_id,
        action: 'CRM_CONTACT_SYNC',
        actor_user_id: request.actor_user_id,
        new_state: {
          contact_id: request.contact_id,
          kind: request.ooredoo ? 'pppoe_id' : 'id_card',
        },
        crm_sync_ok: false,
        error_message: reason,
      });
      return `Could not update the CRM contact (${reason}); update it in the CRM manually.`;
    }
  }

  private async writeIdentity(
    contactId: string,
    contact: CrmContact,
    identity: string,
  ): Promise<string> {
    const current = idNumber(contact);
    if (current) {
      return current.toUpperCase() === identity
        ? `ID card ${identity} already on the CRM contact`
        : `CRM contact already has ID card ${current}; left unchanged`;
    }
    await this.put(contactId, {
      demographics: {
        id_details: {
          number: identity,
          issuing_country_code: MALDIVIAN_ID.test(identity) ? 'MDV' : null,
        },
      },
    });
    return `ID card ${identity} saved on the CRM contact`;
  }

  private async writePppoe(
    contactId: string,
    contact: CrmContact,
    username: string,
  ): Promise<string> {
    const provider = await this.ooredooProvider();
    const fields = contact.custom_fields ?? [];
    const value = (key: string) =>
      fields.find((field) => field.key === key)?.value;
    if (
      value('id_number') === username &&
      value('service_provider') === provider.id
    ) {
      return `PPPoE id ${username} already on the CRM contact (${provider.name})`;
    }
    // A custom_fields PUT replaces the whole list, so every other field is sent back as is.
    const kept = fields.filter(
      (field) => field.key !== 'id_number' && field.key !== 'service_provider',
    );
    const next: Record<string, unknown>[] = [
      ...kept.map((field) => ({ key: field.key, value: field.value })),
      {
        key: 'service_provider',
        value: provider.id,
        entity_edit_label: provider.name,
      },
      { key: 'id_number', value: username },
    ].map((field, index) => ({ ...field, order: index + 1 }));
    await this.put(contactId, { custom_fields: next });
    return `PPPoE id ${username} saved on the CRM contact as a ${provider.name} customer`;
  }

  private async ooredooProvider() {
    if (this.provider && Date.now() - this.provider.at < PROVIDER_TTL_MS) {
      return this.provider;
    }
    const name =
      this.config.get<string>('CRM_OOREDOO_PROVIDER_NAME') ||
      DEFAULT_PROVIDER_NAME;
    const configuredId = this.config.get<string>('CRM_OOREDOO_PROVIDER_ID');
    if (configuredId) {
      this.provider = { at: Date.now(), id: configuredId, name };
      return this.provider;
    }
    const organisation =
      this.config.get<string>('CRM_ORGANISATION_ID') || DEFAULT_ORGANISATION_ID;
    const response = await this.crm.request<{
      content?: { id: string; name: string; state?: string }[];
    }>(
      'GET',
      `/organisations/${organisation}/network?size=10&page=1&sort=name&order=ASC&name=${encodeURIComponent(name)}`,
    );
    const match = response.ok
      ? (response.data?.content ?? []).find(
          (org) =>
            org.name.trim().toLowerCase() === name.toLowerCase() &&
            (!org.state || org.state === 'ACTIVE'),
        )
      : undefined;
    if (!match) {
      throw new Error(`service provider "${name}" not found in the CRM`);
    }
    this.provider = { at: Date.now(), id: match.id, name: match.name };
    return this.provider;
  }

  private async getContact(contactId: string): Promise<CrmContact | null> {
    const response = await this.crm.request<CrmContact>(
      'GET',
      `/contacts/${encodeURIComponent(contactId)}`,
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`CRM returned ${response.status}`);
    return response.data;
  }

  private async put(contactId: string, body: Record<string, unknown>) {
    const response = await this.crm.request(
      'PUT',
      `/contacts/${encodeURIComponent(contactId)}`,
      body,
    );
    if (!response.ok) throw new Error(`CRM returned ${response.status}`);
  }
}

function idNumber(contact: CrmContact): string | null {
  return contact.demographics?.id_details?.number?.trim() || null;
}
