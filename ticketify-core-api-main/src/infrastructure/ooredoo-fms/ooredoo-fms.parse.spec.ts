import { ConfigService } from '@nestjs/config';
import { OoredooFmsClient } from './ooredoo-fms.client';
import { FMS_TICKET_STATUS, FMS_MEDIANET_QUEUES } from './ooredoo-fms.types';

describe('Ooredoo FMS constants', () => {
  it('keeps Fault Resolved as status 5 (from Change_Ticket_Status capture)', () => {
    expect(FMS_TICKET_STATUS.FAULT_RESOLVED).toBe(5);
  });

  it('lists the three Medianet queues', () => {
    const names = FMS_MEDIANET_QUEUES.map((q) => q.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "MediaNet Male'",
        'Hulhumale Phase 1',
        'S_Feydhoo_MN',
      ]),
    );
    expect(
      FMS_MEDIANET_QUEUES.find((q) => q.name === 'Hulhumale Phase 1')?.id,
    ).toBe(86);
    expect(FMS_MEDIANET_QUEUES.find((q) => q.name === 'S_Feydhoo_MN')?.id).toBe(
      186,
    );
  });
});

describe('Ooredoo FMS DataTables row parse', () => {
  const client = new OoredooFmsClient(
    new ConfigService({ OOREDOO_FMS_ENABLED: 'false' }),
  );

  it('maps an open-tab row', () => {
    const summary = client.summaryFromDataTableRow(
      [
        '21 Hours',
        '<a href="https://www.ooredoo.mv/webapps/FMS/public/tickets/ticket_info/177080">177080</a>',
        '40030937  ',
        '2026-11-18 11:58:35',
        '<a style="color: #00ff00">Open</a>',
        "MediaNet Male&#039;",
        'Fault',
        'LOS blinking (Red)- Fiber',
        '2026-11-18 18:42:03',
        'tech2@medianet.com.mv',
        '20 Hours',
      ],
      'open',
    );
    expect(summary).toMatchObject({
      id: '177080',
      account_number: '40030937',
      queue: "MediaNet Male'",
      status: 'Open',
      category: 'Fault',
      sub_category: 'LOS blinking (Red)- Fiber',
      assignee_email: 'tech2@medianet.com.mv',
    });
  });

  it('marks closed-tab rows as Fault Resolved', () => {
    const summary = client.summaryFromDataTableRow(
      [
        '<a style="color: #0000ff">Closed</a>',
        '<a href="https://www.ooredoo.mv/webapps/FMS/public/tickets/ticket_info/177000">177000</a>',
        '4009193  ',
        '2026-11-17 12:22:46',
        '<a style="color: #0000ff">Close</a>',
        "MediaNet Male&#039;",
        'Fault',
        'LOS blinking (Red)- Fiber',
        '2026-11-17 21:33:53',
        'tech2@medianet.com.mv',
        '<a style="color: #0000ff">Closed</a>',
      ],
      'closed',
    );
    expect(summary?.status).toBe('Fault Resolved');
    expect(summary?.id).toBe('177000');
  });
});
