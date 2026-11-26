import {
  hourWindowFilter,
  mapBandwidth,
  mapDetection,
  mapDeviceTypes,
  mapOpticalDevice,
  mapPackages,
  mapStatusPoints,
  mapTodos,
  mapTr069,
  matchDeviceType,
  parseLoginResponse,
  revokeAlreadyGone,
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

  it('treats a revoke the old OLT cannot see as already gone', () => {
    const [todo] = mapTodos([
      {
        id: 310860,
        task: 'WAN_CONFIGURATION',
        entityOperation: 'terminal_node_onu_revoke',
        todoTries: 10,
        additionalInfo: 'Not found on the normal or autofind list',
        params: 'delete_onu,terminal_node_id=55765,olt_id=40',
      },
    ]);
    expect(todo.operation).toBe('terminal_node_onu_revoke');
    expect(revokeAlreadyGone(todo)).toBe(true);
    const [statusChange] = mapTodos([
      {
        id: 310895,
        task: 'WAN_CONFIGURATION',
        entityOperation: 'terminal_node_status_change',
        todoTries: 8,
        additionalInfo:
          'Not found on the autofind list (normal list check is omitted)',
        params: 'delete_onu,terminal_node_id=56008,olt_id=37',
      },
    ]);
    expect(statusChange.operation).toBe('delete_onu');
    expect(revokeAlreadyGone(statusChange)).toBe(true);
    expect(
      revokeAlreadyGone({
        ...todo,
        operation: 'terminal_node_onu_add',
      }),
    ).toBe(false);
  });

  it('offers only the four packages a technician can assign', () => {
    expect(
      mapPackages([
        { id: 1, name: 'NET ONLY' },
        { id: 2, name: 'OLD_PACKAGE' },
        { id: 3, name: 'HM_PHS2_CPE' },
        { id: 4, name: 'NET_IPTV_PUB_WIFI' },
        { id: 5, name: 'NET_IPTV_ONLY', deletedAt: '2024-01-01' },
        { id: 6, name: 'net_iptv_only' },
      ]),
    ).toEqual([
      { code: '6', label: 'net_iptv_only' },
      { code: '4', label: 'NET_IPTV_PUB_WIFI' },
      { code: '1', label: 'NET ONLY' },
      { code: '3', label: 'HM_PHS2_CPE' },
    ]);
  });

  it('keeps only a short, token-free error message', () => {
    expect(
      safeIncaMessage(
        JSON.stringify({ message: 'Bad token eyJabc.def.ghi\nretry' }),
      ),
    ).toBe('Bad token [token] retry');
    expect(safeIncaMessage('<html>oops</html>')).toBe('');
  });

  it('keeps bandwidth and status numbers and the TR-069 addresses', () => {
    expect(hourWindowFilter('2026-11-19T00:00:00', '2026-11-26T23:59:59')).toEqual({
      order: 'subjectHour ASC',
      where: {
        and: [
          { subjectHour: { gt: '2026-11-19T00:00:00' } },
          { subjectHour: { lte: '2026-11-26T23:59:59' } },
        ],
      },
      include: {},
    });
    expect(
      mapBandwidth([
        {
          subjectHour: '2026-11-25T13:00:00+05:00',
          jsonData: {
            '42': { up: 0, down: 0, cause_of_zero: 'PREVIOUS_DATA_NOT_FOUND' },
            '56': { up: 72, down: 100736 },
          },
        },
      ]),
    ).toEqual([
      {
        at: '2026-11-25T13:00:00+05:00',
        services: [
          { id: '42', up: 0, down: 0 },
          { id: '56', up: 72, down: 100736 },
        ],
      },
    ]);
    expect(
      mapStatusPoints([
        {
          subjectHour: '2026-11-25T13:00:00+05:00',
          jsonData: { '56': { status: 1 }, '26': { status: 2 } },
        },
      ]),
    ).toEqual([
      {
        at: '2026-11-25T13:00:00+05:00',
        services: [
          { id: '26', status: 2 },
          { id: '56', status: 1 },
        ],
      },
    ]);
    expect(
      mapTr069([
        {
          InternetGatewayDevice: {
            DeviceInfo: { UpTime: { _value: 6800 } },
            WANDevice: {
              1: {
                WANConnectionDevice: {
                  1: {
                    WANIPConnection: {
                      1: {
                        ExternalIPAddress: { _value: '10.36.253.230' },
                        MACAddress: { _value: '3C:05:8E:D3:CE:2E' },
                      },
                    },
                  },
                  2: {
                    WANPPPConnection: {
                      1: {
                        ExternalIPAddress: { _value: '172.21.92.128' },
                        MACAddress: { _value: '3C:05:8E:D3:CE:2F' },
                        Uptime: { _value: 9 },
                      },
                    },
                  },
                  3: {
                    WANIPConnection: {
                      1: {
                        ExternalIPAddress: { _value: '10.20.21.47' },
                        MACAddress: { _value: '3C:05:8E:D3:CE:30' },
                      },
                    },
                  },
                  4: {
                    WANIPConnection: {
                      1: { ExternalIPAddress: { _value: '' }, MACAddress: { _value: '' } },
                    },
                  },
                },
              },
            },
          },
        },
      ]),
    ).toEqual([
      { label: 'Uptime', value: '6800 seconds' },
      { label: 'ONU IP', value: '10.36.253.230' },
      { label: 'ONU MAC', value: '3C:05:8E:D3:CE:2E' },
      { label: 'PPPoE IP', value: '172.21.92.128' },
      { label: 'PPPoE MAC', value: '3C:05:8E:D3:CE:2F' },
      { label: 'PPPoE uptime', value: '9 seconds' },
      { label: 'WAN3 IP', value: '10.20.21.47' },
      { label: 'WAN3 MAC', value: '3C:05:8E:D3:CE:30' },
    ]);
  });
});
