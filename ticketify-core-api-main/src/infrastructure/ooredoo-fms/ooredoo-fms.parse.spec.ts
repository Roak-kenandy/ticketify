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
