import { CrmContactSyncService } from './crm-contact-sync.service';

const OOREDOO_ID = '3c98a76f-95a2-479e-a860-588392da26f9';

function build(contact: Record<string, unknown> | null, putOk = true) {
  const crm = {
    request: jest.fn((method: string, path: string, _body?: unknown) => {
      if (method === 'PUT') {
        return Promise.resolve({ ok: putOk, status: putOk ? 200 : 400 });
      }
      if (path.includes('/network')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: {
            content: [
              { id: OOREDOO_ID, name: 'Medianet Ooredoo', state: 'ACTIVE' },
            ],
          },
        });
      }
      return Promise.resolve(
        contact
          ? { ok: true, status: 200, data: contact }
          : { ok: false, status: 404, data: null },
      );
    }),
  };
  const audit = { log: jest.fn().mockResolvedValue(true) };
  const logger = { warn: jest.fn() };
  const config = { get: jest.fn() };
  const service = new CrmContactSyncService(
    crm as never,
    config as never,
    audit as never,
    logger as never,
  );
  const puts = () =>
    crm.request.mock.calls
      .filter(([method]) => method === 'PUT')
      .map(([, , body]) => body as Record<string, unknown>);
  return { service, audit, puts };
}

const request = {
  crm_ticket_id: 'sr-1',
  contact_id: 'contact-1',
  actor_user_id: 'user-1',
  ooredoo: false,
  pppoe_username: null,
  client_identity: 'A123456',
};

describe('CrmContactSyncService', () => {
  it('reads the ID card number from the CRM contact', async () => {
    const { service } = build({
      demographics: { id_details: { number: 'A654321' } },
    });
    await expect(service.identity('contact-1')).resolves.toBe('A654321');
  });

  it('saves the ID card on a Medianet ONT when the CRM has none', async () => {
    const { service, puts, audit } = build({
      demographics: { id_details: { number: null } },
    });
    await expect(service.afterProvisioning(request)).resolves.toBe(
      'ID card A123456 saved on the CRM contact',
    );
    expect(puts()).toEqual([
      {
        demographics: {
          id_details: { number: 'A123456', issuing_country_code: 'MDV' },
        },
      },
    ]);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CRM_CONTACT_SYNC',
        crm_sync_ok: true,
      }),
    );
  });

  it('never overwrites an ID card already in the CRM', async () => {
    const { service, puts } = build({
      demographics: { id_details: { number: 'A999999' } },
    });
    await expect(service.afterProvisioning(request)).resolves.toContain(
      'left unchanged',
    );
    expect(puts()).toEqual([]);
  });

  it('saves the PPPoE id and service provider on an Ooredoo ONT, keeping other fields', async () => {
    const { service, puts } = build({
      custom_fields: [
        { key: 'customer_code', value: '5119003' },
        { key: 'id_number', value: 'old' },
      ],
    });
    await expect(
      service.afterProvisioning({
        ...request,
        ooredoo: true,
        pppoe_username: 'mdnP0121',
      }),
    ).resolves.toContain('PPPoE id mdnP0121 saved');
    expect(puts()).toEqual([
      {
        custom_fields: [
          { key: 'customer_code', value: '5119003', order: 1 },
          {
            key: 'service_provider',
            value: OOREDOO_ID,
            entity_edit_label: 'Medianet Ooredoo',
            order: 2,
          },
          { key: 'id_number', value: 'mdnP0121', order: 3 },
        ],
      },
    ]);
  });

  it('does not write the ID card for an Ooredoo ONT', async () => {
    const { service, puts } = build({ custom_fields: [] });
    await service.afterProvisioning({
      ...request,
      ooredoo: true,
      pppoe_username: null,
    });
    expect(puts()).toEqual([]);
  });

  it('reports a CRM failure without throwing', async () => {
    const { service, audit } = build(
      { demographics: { id_details: { number: null } } },
      false,
    );
    await expect(service.afterProvisioning(request)).resolves.toContain(
      'update it in the CRM manually',
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ crm_sync_ok: false }),
    );
  });
});
