import { parseTraccarPayload } from './traccar-payload';

describe('parseTraccarPayload', () => {
  it('reads the v9 JSON body and prefers the top-level device_id', () => {
    const result = parseTraccarPayload(
      {},
      {
        device_id: 'tk-abc123',
        location: {
          timestamp: '2026-10-13T08:00:00.000Z',
          coords: { latitude: 4.1755, longitude: 73.5093, accuracy: 12.5 },
          is_moving: true,
          battery: { level: 0.8, is_charging: false },
          _: '&id=stale-id&lat=4.1755&lon=73.5093&',
        },
      },
    );
    expect(result).toEqual({
      ok: true,
      fixes: [
        {
          deviceId: 'tk-abc123',
          latitude: 4.1755,
          longitude: 73.5093,
          accuracy: 12.5,
          timestamp: '2026-10-13T08:00:00.000Z',
          mock: false,
          isMoving: true,
          battery: 80,
          charging: false,
        },
      ],
    });
  });

  it('reads batched JSON locations', () => {
    const result = parseTraccarPayload(
      {},
      {
        device_id: 'tk-abc123',
        location: [
          {
            timestamp: '2026-10-13T08:00:00Z',
            coords: { latitude: 4.17, longitude: 73.5 },
          },
          {
            timestamp: '2026-10-13T08:01:00Z',
            coords: { latitude: 4.18, longitude: 73.51 },
          },
        ],
      },
    );
    expect(result.ok && result.fixes.map((f) => f.latitude)).toEqual([
      4.17, 4.18,
    ]);
  });

  it('reads the legacy query format with unix seconds', () => {
    const result = parseTraccarPayload(
      {
        id: 'tk-abc123',
        lat: '4.1755',
        lon: '73.5093',
        timestamp: '1792224000',
        accuracy: '20',
      },
      undefined,
    );
    expect(result).toEqual({
      ok: true,
      fixes: [
        {
          deviceId: 'tk-abc123',
          latitude: 4.1755,
          longitude: 73.5093,
          accuracy: 20,
          timestamp: new Date(1792224000 * 1000).toISOString(),
          mock: false,
          isMoving: null,
          battery: null,
          charging: null,
        },
      ],
    });
  });

  it('reads the legacy form body', () => {
    const result = parseTraccarPayload(
      {},
      { deviceid: 'tk-abc123', lat: '4.1', lon: '73.5' },
    );
    expect(result.ok && result.fixes[0].deviceId).toBe('tk-abc123');
  });

  it('reads stationary heartbeats and legacy battery fields', () => {
    const heartbeat = parseTraccarPayload(
      {},
      {
        device_id: 'tk-abc123',
        location: {
          event: 'heartbeat',
          is_moving: false,
          coords: { latitude: 4.1, longitude: 73.5 },
          battery: { level: -1, is_charging: true },
        },
      },
    );
    expect(heartbeat.ok && heartbeat.fixes[0]).toMatchObject({
      isMoving: false,
      battery: null,
      charging: true,
    });
    const legacy = parseTraccarPayload(
      { id: 'tk-abc123', lat: '4.1', lon: '73.5', batt: '42.6', charge: 'false', motion: 'true' },
      undefined,
    );
    expect(legacy.ok && legacy.fixes[0]).toMatchObject({
      isMoving: true,
      battery: 43,
      charging: false,
    });
  });

  it('flags mock locations', () => {
    const result = parseTraccarPayload(
      {},
      {
        device_id: 'tk-abc123',
        location: { mock: true, coords: { latitude: 4.1, longitude: 73.5 } },
      },
    );
    expect(result.ok && result.fixes[0].mock).toBe(true);
  });

  it('rejects missing or malformed device ids', () => {
    expect(parseTraccarPayload({ lat: '4', lon: '73' }, {})).toEqual({
      ok: false,
      reason: 'missing_device_id',
    });
    expect(
      parseTraccarPayload({ id: '../x', lat: '4', lon: '73' }, {}),
    ).toEqual({
      ok: false,
      reason: 'invalid_device_id',
    });
  });

  it('rejects out-of-range and 0,0 coordinates', () => {
    expect(
      parseTraccarPayload({ id: 'tk-abc123', lat: '0', lon: '0' }, {}).ok,
    ).toBe(false);
    expect(
      parseTraccarPayload({ id: 'tk-abc123', lat: '95', lon: '73' }, {}).ok,
    ).toBe(false);
    expect(
      parseTraccarPayload(
        {},
        { device_id: 'tk-abc123', location: { coords: {} } },
      ).ok,
    ).toBe(false);
  });
});
