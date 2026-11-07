import {
  mapDetection,
  mapDeviceTypes,
  mapOpticalDevice,
  matchDeviceType,
  parseLoginResponse,
  safeIncaMessage,
} from './inca-live.mappers';

const TYPES = mapDeviceTypes([
  { id: 52, name: '1_EG8145V5', ftth: true, deletedAt: null },
  { id: 68, name: 'EG8145V5_VLAN555', ftth: true, deletedAt: null },
  { id: 53, name: 'HG8546M', ftth: true, deletedAt: null },
  { id: 66, name: 'HG8546M_VLAN555', ftth: true, deletedAt: null },
  { id: 99, name: 'OLD', ftth: true, deletedAt: '2024-01-01' },
]);

/** Shape of GET /fttx/unregistered-active-devices (customer fields faked). */
const UNREGISTERED = {
  resultList: [
    {
      dbOnuId: 70914,
      dbSerialNumber: '4857544388FE0A3C',
      dbOltId: 37,
      dbOpticalDeviceTypeId: 52,
      dbTerminalNodeAddress: 'Somewhere 1',
      dbClientName: 'Someone',
      dbOlt: 'OLT_2',
      requestedOltId: 37,
      requestedOlt: 'OLT_2',
      frameId: 0,
      slotId: 1,
      portId: 6,
      serialNumber: '4857544388FE0A3C',
      generalStatus: 'OFFLINE',
      typeSpecificDataAggregated:
        'lineWithoutFsp:  | password: 0x0000 | vendorId: HWTC | ontSn: 4857544388FE0A3C (HWTC-88FE0A3C) | ontEquipmentId: EG8145V5 | ontCustomizedInfo: COMMON',
    },
  ],
  oltsWithEmptyResponses: [],
};

describe('INCA live mappers', () => {
  it('reads the token and user from the login response', () => {
    const exp = Math.floor(Date.UTC(2026, 9, 20) / 1000);
    const payload = Buffer.from(JSON.stringify({ sub: '72', exp })).toString(
      'base64url',
    );
    const token = `eyJhbGciOiJIUzUxMiJ9.${payload}.sig`;
    expect(
      parseLoginResponse({ token: { id: token }, user: { id: 72 } }, 0),
    ).toEqual({
      token,
      userId: 72,
      expiresAt: exp * 1000,
    });
  });

  it('rejects login responses without a usable token or user', () => {
    expect(
      parseLoginResponse({ token: { id: 'a b' }, user: { id: 72 } }, 0),
    ).toBeNull();
    expect(parseLoginResponse({ token: { id: 'abc' } }, 0)).toBeNull();
    expect(parseLoginResponse(null, 0)).toBeNull();
  });

  it('maps a detected ONT to its OLT, PON and standard device type only', () => {
    const detection = mapDetection(UNREGISTERED, '4857544388FE0A3C', TYPES);
    expect(detection).toEqual({
      olt_id: '37',
      olt_name: 'OLT_2',
      pon: '0/1/6',
      device_type: '52',
      olt_state: 'UNREGISTERED',
      online: false,
      operator: 'COMMON',
      pppoe_required: false,
    });
    expect(JSON.stringify(detection)).not.toMatch(/Somewhere|Someone|password/);
  });

  it('flags Ooredoo-firmware ONTs as needing PPPoE', () => {
    const ooredoo = {
      resultList: [
        {
          requestedOltId: 37,
          requestedOlt: 'OLT_2',
          frameId: 0,
          slotId: 1,
          portId: 6,
          serialNumber: '485754437F1568B9',
          generalStatus: 'OFFLINE',
          typeSpecificDataAggregated:
            'lineWithoutFsp:  | password: 0x0000 | vendorId: HWTC | ontSn: 485754437F1568B9 (HWTC-7F1568B9) | ontEquipmentId: HG8145X6-6Te | ontCustomizedInfo: MVOOREDOO',
        },
      ],
    };
    expect(mapDetection(ooredoo, '485754437F1568B9', TYPES)).toMatchObject({
      operator: 'MVOOREDOO',
      pppoe_required: true,
    });
  });

  it('maps an ONT already configured on the OLT (registered list)', () => {
    const registered = {
      resultList: [
        {
          requestedOltId: 37,
          requestedOlt: 'OLT_2',
          frameId: 0,
          slotId: 1,
          portId: 6,
          onuId: 6,
          serialNumber: '4857544388FE0A3C',
          generalStatus: 'ONLINE',
          typeSpecificDataAggregated:
            'fsp: 0/1/6 | controlFlag: active | runState: online | configState: normal',
        },
      ],
      oltsWithEmptyResponses: [],
      filteredListTotalSize: 1,
    };
    expect(
      mapDetection(registered, '4857544388FE0A3C', TYPES, 'REGISTERED'),
    ).toEqual({
      olt_id: '37',
      olt_name: 'OLT_2',
      pon: '0/1/6',
      device_type: null,
      olt_state: 'REGISTERED',
      online: true,
      operator: null,
      pppoe_required: false,
    });
  });

  it('ignores partial serial matches', () => {
    expect(mapDetection(UNREGISTERED, '4857544388FE0A3', TYPES)).toBeNull();
  });

  it('only guesses a device type when the model is unambiguous', () => {
    expect(matchDeviceType('EG8145V5', TYPES)).toBe('52');
    expect(matchDeviceType('HG8546M', TYPES)).toBe('53');
    expect(matchDeviceType('HG8245A', TYPES)).toBeNull();
    expect(matchDeviceType(null, TYPES)).toBeNull();
  });

  it('drops deleted device types', () => {
    expect(TYPES.map((type) => type.code)).not.toContain('99');
  });

  it('maps a registered optical device without its admin password', () => {
    const device = mapOpticalDevice(
      [
        {
          id: 70914,
          serialNumber: '4857544388FE0A3C',
          oltId: 37,
          oltName: 'OLT_2',
          opticalDeviceTypeId: 52,
          adminPassword: 'secret',
          assignedTerminalNodeId: null,
          deletedAt: null,
        },
      ],
      '4857544388FE0A3C',
    );
    expect(device).toMatchObject({
      registered: true,
      olt_id: '37',
      olt_name: 'OLT_2',
      device_type: '52',
      terminal_node_id: null,
    });
    expect(JSON.stringify(device)).not.toContain('secret');
  });

  it('treats deleted optical devices as not registered', () => {
    expect(
      mapOpticalDevice(
        [
          {
            serialNumber: 'ABCD1234ABCD1234',
            oltId: 1,
            deletedAt: '2026-01-01',
          },
        ],
        'ABCD1234ABCD1234',
      ),
    ).toBeNull();
  });

  it('keeps only a short, token-free error message', () => {
    expect(
      safeIncaMessage(
        JSON.stringify({ message: 'Bad token eyJabc.def.ghi\nretry' }),
      ),
    ).toBe('Bad token [token] retry');
    expect(safeIncaMessage('<html>oops</html>')).toBe('');
  });
});
