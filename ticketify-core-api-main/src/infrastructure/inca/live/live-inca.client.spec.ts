import {
  IncaNotIntegratedError,
  IncaRejectedError,
  IncaTerminalNodeInput,
} from '../inca.types';
import { IncaTransport } from './inca-transport';
import { LiveIncaClient, toIncaSerial } from './live-inca.client';

function fakeTransport(responses: Record<string, unknown>) {
  const get = jest.fn(async (path: string) => responses[path] ?? []);
  const post = jest.fn(
    async (_path: string, body: Record<string, unknown>) => ({
      id: 70914,
      oltId: Number(body.oltId),
      opticalDeviceTypeId: Number(body.opticalDeviceTypeId),
      adminPassword: 'generated',
    }),
  );
  const transport = {
    get,
    post,
    userId: jest.fn(async () => 72),
  } as unknown as IncaTransport;
  return { transport, get, post };
}

describe('LiveIncaClient', () => {
  it('posts exactly the INCA registration body', async () => {
    const { transport, post } = fakeTransport({});
    const device = await new LiveIncaClient(transport).registerOnt({
      serial: '4857544388fe0a3c',
      service_area: 'MALE',
      device_type: '52',
      olt_id: '37',
      olt_name: 'OLT_2',
      pon: '0/1/6',
    });
    expect(post).toHaveBeenCalledWith('/fttx/optical-devices', {
      serialNumber: '4857544388FE0A3C',
      opticalDeviceTypeId: '52',
      oltId: '37',
      macAddress: null,
      guarantee: null,
      adminPassword: null,
      comment: null,
      description: null,
      fixIp: null,
      outerIdentity: null,
      profiles: null,
    });
    expect(device).toMatchObject({
      registered: true,
      olt_id: '37',
      olt_name: 'OLT_2',
      pon: '0/1/6',
    });
    expect(JSON.stringify(device)).not.toContain('generated');
  });

  it('refuses to register without a valid device type or OLT', async () => {
    const { transport, post } = fakeTransport({});
    const client = new LiveIncaClient(transport);
    const base = {
      serial: '4857544388FE0A3C',
      service_area: 'x',
      olt_name: null,
      pon: '',
    };
    await expect(
      client.registerOnt({ ...base, device_type: 'HG8145X6', olt_id: '37' }),
    ).rejects.toBeInstanceOf(IncaRejectedError);
    await expect(
      client.registerOnt({ ...base, device_type: '52', olt_id: '37 OR 1=1' }),
    ).rejects.toBeInstanceOf(IncaRejectedError);
    expect(post).not.toHaveBeenCalled();
  });

  it('scopes service areas to the signed-in INCA user', async () => {
    const { transport, get } = fakeTransport({
      '/views/inca-users/72/service-areas': [
        { serviceAreaId: 3, serviceAreaName: "Male'" },
      ],
    });
    await expect(new LiveIncaClient(transport).serviceAreas()).resolves.toEqual(
      [{ code: '3', label: "Male'" }],
    );
    expect(get).toHaveBeenCalledWith('/views/inca-users/72/service-areas', {
      order: 'serviceAreaName ASC',
    });
  });

  describe('detectOnOlt', () => {
    const row = (generalStatus: string) => ({
      resultList: [
        {
          requestedOltId: 37,
          requestedOlt: 'OLT_2',
          frameId: 0,
          slotId: 1,
          portId: 6,
          serialNumber: '4857544388FE0A3C',
          generalStatus,
        },
      ],
    });

    it('searches the unregistered and registered lists', async () => {
      const { transport, get } = fakeTransport({
        '/fttx/registered-active-devices': row('OFFLINE'),
      });
      await expect(
        new LiveIncaClient(transport).detectOnOlt('HWTC-88FE0A3C'),
      ).resolves.toMatchObject({
        olt_id: '37',
        pon: '0/1/6',
        olt_state: 'REGISTERED',
        online: false,
      });
      const filter = {
        skip: 0,
        limit: 10,
        order: 'serialNumber ASC',
        where: { and: [{ serialNumber: { ilike: '4857544388FE0A3C' } }] },
      };
      expect(get).toHaveBeenCalledWith(
        '/fttx/unregistered-active-devices',
        filter,
      );
      expect(get).toHaveBeenCalledWith(
        '/fttx/registered-active-devices',
        filter,
      );
    });

    it('prefers the unregistered list', async () => {
      const { transport } = fakeTransport({
        '/fttx/unregistered-active-devices': row('OFFLINE'),
        '/fttx/registered-active-devices': row('ONLINE'),
      });
      await expect(
        new LiveIncaClient(transport).detectOnOlt('4857544388FE0A3C'),
      ).resolves.toMatchObject({ olt_state: 'UNREGISTERED' });
    });

    it('never reports "not detected" when a list failed', async () => {
      const { transport, get } = fakeTransport({});
      get.mockImplementation(async (path: string) => {
        if (path === '/fttx/registered-active-devices') {
          throw new Error('timeout');
        }
        return [];
      });
      await expect(
        new LiveIncaClient(transport).detectOnOlt('4857544388FE0A3C'),
      ).rejects.toThrow('timeout');
    });
  });

  it('caches device types', async () => {
    const { transport, get } = fakeTransport({
      '/views/fttx/optical-device-types': [
        { id: 52, name: '1_EG8145V5', ftth: true },
      ],
    });
    const client = new LiveIncaClient(transport);
    await client.deviceTypes();
    await client.deviceTypes();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('reports subscriber steps as not integrated without calling INCA', async () => {
    const { transport, get, post } = fakeTransport({});
    const client = new LiveIncaClient(transport);
    await expect(
      client.findSubscriber('c1', 'existing_service'),
    ).rejects.toBeInstanceOf(IncaNotIntegratedError);
    await expect(
      client.findSubscriber('c1', 'new_connection'),
    ).resolves.toBeNull();
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  describe('ONU, package and status', () => {
    function nodeTransport(gets: Record<string, unknown>) {
      const get = jest.fn(async (path: string) => gets[path] ?? []);
      const post = jest.fn<Promise<unknown>, [string, unknown]>(async () => ({
        id: 1,
      }));
      const patch = jest.fn<Promise<unknown>, [string, unknown]>(
        async () => null,
      );
      const del = jest.fn<Promise<unknown>, [string]>(async () => null);
      const transport = {
        get,
        post,
        patch,
        delete: del,
        userId: jest.fn(async () => 72),
      } as unknown as IncaTransport;
      return { transport, get, post, patch, del };
    }

    it('switches PPPoE on by patching the Terminal Node like INCA', async () => {
      const node = nodeTransport({});
      const client = new LiveIncaClient(node.transport);
      await client.setPppoe('55674', {
        username: 'roak.test',
        password: 'pw-123456',
      });
      expect(node.patch).toHaveBeenCalledWith('/fttx/terminal-nodes/55674', {
        isPppoe: true,
        radiusUsername: 'roak.test',
        radiusPassword: 'pw-123456',
      });
      await expect(
        client.setPppoe('55674', { username: 'bad user', password: 'x' }),
      ).rejects.toThrow('PPPoE username');
      expect(node.patch).toHaveBeenCalledTimes(1);
    });

    it('moves a Terminal Node to a new address with only city, street and number', async () => {
      const node = nodeTransport({
        '/views/cities': [{ id: 49, name: 'Addu' }],
        '/views/streets': [{ id: 4205, name: 'Feydhoo Magu' }],
        '/views/fttx/terminal-nodes': [
          { id: 55674, cityId: 46, streetId: 4000, number: 1001 },
        ],
      });
      const client = new LiveIncaClient(node.transport);
      const location = {
        city_id: '49',
        new_city: null,
        street_id: '4205',
        new_street: null,
        number: '9451335',
      };
      await expect(
        client.updateLocation('55674', location),
      ).resolves.toMatchObject({
        address: 'Feydhoo Magu 9451335, Addu',
        changed: true,
      });
      expect(node.patch).toHaveBeenCalledWith('/fttx/terminal-nodes/55674', {
        cityId: '49',
        streetId: '4205',
        number: 9451335,
      });
      const body = JSON.stringify(node.patch.mock.calls[0][1]);
      expect(body).not.toMatch(/password|radius/i);

      const already = nodeTransport({
        '/views/cities': [{ id: 49, name: 'Addu' }],
        '/views/streets': [{ id: 4205, name: 'Feydhoo Magu' }],
        '/views/fttx/terminal-nodes': [
          { id: 55674, cityId: 49, streetId: 4205, number: 9451335 },
        ],
      });
      await expect(
        new LiveIncaClient(already.transport).updateLocation('55674', location),
      ).resolves.toMatchObject({ changed: false });
      expect(already.patch).not.toHaveBeenCalled();
    });

    it('points an unbound ONT at its new OLT, never sending the admin password', async () => {
      const device = (assigned: number | null) => ({
        '/views/fttx/optical-devices': [
          {
            id: 13002,
            serialNumber: '485754430060D99E',
            oltId: 38,
            assignedTerminalNodeId: assigned,
            adminPassword: 'never-sent',
          },
        ],
      });
      const free = nodeTransport(device(null));
      const client = new LiveIncaClient(free.transport);
      await expect(
        client.moveDevice('485754430060D99E', '38'),
      ).resolves.toEqual({
        changed: false,
      });
      await expect(
        client.moveDevice('485754430060D99E', '37'),
      ).resolves.toEqual({
        changed: true,
      });
      expect(free.patch).toHaveBeenCalledTimes(1);
      expect(free.patch).toHaveBeenCalledWith('/fttx/optical-devices/13002', {
        oltId: '37',
      });

      const bound = nodeTransport(device(12433));
      await expect(
        new LiveIncaClient(bound.transport).moveDevice(
          '485754430060D99E',
          '37',
        ),
      ).rejects.toThrow('revoke it before');
      expect(bound.patch).not.toHaveBeenCalled();
    });

    it('revokes the ONU by deleting its binding row, like INCA "Revoke"', async () => {
      const links = {
        '/views/fttx/terminal-nodes/55623/optical-devices': [
          {
            id: 68160,
            terminalNodeId: 55623,
            opticalDeviceId: 71053,
            serialNumber: '4857544388FE0A3C',
            startDate: '2026-10-29T14:35:29',
          },
        ],
      };
      const bound = nodeTransport(links);
      await new LiveIncaClient(bound.transport).revokeOnu(
        '55623',
        'HWTC-88FE0A3C',
      );
      expect(bound.del).toHaveBeenCalledWith(
        '/fttx/terminal-nodes-optical-device/68160',
      );

      const gone = nodeTransport(links);
      await new LiveIncaClient(gone.transport).revokeOnu(
        '55623',
        '48575443A43AD89E',
      );
      expect(gone.del).not.toHaveBeenCalled();
    });

    it('finds the Terminal Node by ONU serial', async () => {
      const node = {
        id: 55623,
        language: 'US',
        serialNumber: '4857544388FE0A3C',
        clientIdentifier: 'A9451335',
        packageName: 'NET_IPTV_PUB_WIFI',
        statusOperational: true,
        onuOltId: 37,
      };
      const { transport, get } = nodeTransport({
        '/views/fttx/terminal-nodes': [node],
      });
      const found = await new LiveIncaClient(transport).findSubscriberBySerial(
        '4857544388fe0a3c',
      );
      expect(found).toMatchObject({
        terminal_node_id: '55623',
        onu_serials: ['4857544388FE0A3C'],
        package: 'NET_IPTV_PUB_WIFI',
        connected: true,
      });
      expect(get).toHaveBeenCalledWith('/views/fttx/terminal-nodes', {
        limit: 20,
        where: {
          and: [
            { serialNumber: { ilike: '4857544388FE0A3C' } },
            { or: [{ language: 'US' }, { language: null }] },
          ],
        },
      });

      const twice = nodeTransport({
        '/views/fttx/terminal-nodes': [node, { ...node, id: 55649 }],
      });
      await expect(
        new LiveIncaClient(twice.transport).findSubscriberBySerial(
          '4857544388FE0A3C',
        ),
      ).rejects.toBeInstanceOf(IncaRejectedError);
    });
    const device = (assigned: number | null) => ({
      '/views/fttx/optical-devices': [
        {
          id: 71019,
          serialNumber: '4857544388FE0A3C',
          oltId: 37,
          assignedTerminalNodeId: assigned,
        },
      ],
    });

    it('attaches the registered ONT by its INCA device id', async () => {
      const { transport, post } = nodeTransport(device(null));
      await new LiveIncaClient(transport).addOnu('55596', '4857544388FE0A3C');
      expect(post).toHaveBeenCalledWith('/fttx/terminal-nodes-optical-device', {
        opticalDeviceId: '71019',
        terminalNodeId: 55596,
      });
    });

    it('skips an ONT already on the node and refuses one on another node', async () => {
      const same = nodeTransport(device(55596));
      await new LiveIncaClient(same.transport).addOnu(
        '55596',
        '4857544388FE0A3C',
      );
      expect(same.post).not.toHaveBeenCalled();
      const other = nodeTransport(device(55438));
      await expect(
        new LiveIncaClient(other.transport).addOnu('55596', '4857544388FE0A3C'),
      ).rejects.toBeInstanceOf(IncaRejectedError);
      expect(other.post).not.toHaveBeenCalled();
    });

    it('assigns the package once', async () => {
      const packages = [{ id: 110, name: 'NET_IPTV_PUB_WIFI' }];
      const fresh = nodeTransport({ '/views/fttx/packages': packages });
      await expect(
        new LiveIncaClient(fresh.transport).assignPackage('55596', '110'),
      ).resolves.toEqual({ label: 'NET_IPTV_PUB_WIFI', changed: true });
      expect(fresh.post).toHaveBeenCalledWith('/fttx/terminal-nodes-package', {
        packageId: '110',
        terminalNodeId: 55596,
      });

      const done = nodeTransport({
        '/views/fttx/packages': packages,
        '/views/fttx/terminal-nodes/55596/package': [
          { id: 55543, packageId: 110, deletedAt: null },
        ],
      });
      await expect(
        new LiveIncaClient(done.transport).assignPackage('55596', '110'),
      ).resolves.toEqual({ label: 'NET_IPTV_PUB_WIFI', changed: false });
      expect(done.post).not.toHaveBeenCalled();
      await expect(
        new LiveIncaClient(done.transport).assignPackage('55596', '999'),
      ).rejects.toBeInstanceOf(IncaRejectedError);
    });

    it('sets the status to Connected by patching the current status row', async () => {
      const statuses = [
        { id: 1, listValue: 'DD_STATUS_IGENY' },
        { id: 5, listValue: 'DD_STATUS_BEKOTVE' },
      ];
      const pending = nodeTransport({
        '/views/statuses': statuses,
        '/views/fttx/terminal-nodes/55596/status': [
          { id: 95793, statusId: 1, endDate: null },
        ],
      });
      await expect(
        new LiveIncaClient(pending.transport).markConnected('55596'),
      ).resolves.toEqual({ changed: true });
      expect(pending.patch).toHaveBeenCalledWith(
        '/fttx/terminal-nodes-status/95793',
        { statusId: '5' },
      );

      const connected = nodeTransport({
        '/views/statuses': statuses,
        '/views/fttx/terminal-nodes/55596/status': [
          { id: 95793, statusId: 5, endDate: null },
        ],
      });
      await expect(
        new LiveIncaClient(connected.transport).markConnected('55596'),
      ).resolves.toEqual({ changed: false });
      expect(connected.patch).not.toHaveBeenCalled();
    });

    it('reads Todo and optical info for the node and its OLT', async () => {
      const { transport, get } = nodeTransport({
        ...device(55596),
        '/views/fttx/todos': [
          { id: 1, task: 'WAN_CONFIGURATION', todoTries: 1 },
          {
            id: 2,
            task: 'SERVICE',
            todoTries: 7,
            additionalInfo: 'Not found on the normal or autofind list',
          },
        ],
        '/fttx/olts/37/optical-info/serial-numbers/4857544388FE0A3C': {
          response:
            'ONT Tx optical power (dBm): 2.18\nONT Rx optical power (dBm): -20.45\nOLT Rx ONT optical power (dBm): -22.15\nCATV Rx optical power(dBm): No signal\n',
          reason: null,
        },
      });
      const client = new LiveIncaClient(transport);
      const todos = await client.listTodo('55596');
      expect(todos.map((todo) => todo.status)).toEqual(['PENDING', 'FAILED']);
      expect(get).toHaveBeenCalledWith(
        '/views/fttx/todos',
        expect.objectContaining({
          where: {
            and: [{ params: { ilike: '%terminal_node_id=55596,%' } }],
          },
        }),
      );
      await expect(
        client.getOpticalInfo('4857544388FE0A3C'),
      ).resolves.toMatchObject({
        online: true,
        tx_dbm: 2.18,
        rx_dbm: -20.45,
        olt_rx_dbm: -22.15,
        details: expect.arrayContaining([
          { label: 'CATV Rx optical power(dBm)', value: 'No signal' },
        ]),
      });
    });
  });

  describe('terminal node creation', () => {
    const subscriberInput = (node: Partial<IncaTerminalNodeInput>) => ({
      client_identifier: 'x',
      name: 'Roak',
      address: null,
      service_area: '',
      onu_serial: '4857544388FE0A3C',
      package: '',
      pppoe_username: 'mn1',
      pppoe_password: 'secret',
      terminal_node: {
        name: 'roak',
        number: '9451335',
        client_identity: 'a123456',
        client_name: 'Roak',
        city_id: '46',
        new_city: null,
        street_id: '4213',
        new_street: null,
        phone: null,
        email: null,
        ...node,
      },
    });

    function chainTransport(gets: Record<string, unknown>) {
      let nextId = 900;
      const get = jest.fn(async (path: string) => gets[path] ?? []);
      const post = jest.fn<Promise<{ id: number }>, [string, unknown]>(
        async () => ({ id: nextId++ }),
      );
      const transport = {
        get,
        post,
        userId: jest.fn(async () => 72),
      } as unknown as IncaTransport;
      return { transport, get, post };
    }

    const cities = [{ id: 46, name: 'Male' }];
    const streets = [{ id: 4213, name: 'Asaree Hingun', cityId: 46 }];

    it('reuses the existing client and terminal node instead of duplicating them', async () => {
      const { transport, post } = chainTransport({
        '/views/cities': cities,
        '/views/streets': streets,
        '/views/clients': [{ id: 57817, identity: 'A123456', name: 'Roak' }],
        '/fttx/terminal-nodes': [
          { id: 55526, clientId: 57817, number: 9451335 },
        ],
      });
      const result = await new LiveIncaClient(transport).createSubscriber(
        subscriberInput({}),
      );
      expect(post).not.toHaveBeenCalled();
      expect(result.terminal_node_id).toBe('55526');
      expect(result.notes).toEqual([
        'INCA client A123456 found (Roak)',
        'Terminal Node 55526 already exists for this client; reused',
      ]);
    });

    it('creates the missing city, street, client and terminal node with INCA bodies', async () => {
      const { transport, post } = chainTransport({ '/views/cities': cities });
      const result = await new LiveIncaClient(transport).createSubscriber(
        subscriberInput({
          city_id: null,
          new_city: { name: 'Thinadhoo', area_code: '20003' },
          street_id: null,
          new_street: 'Magu',
          phone: '9451335',
        }),
      );
      expect(post.mock.calls.map((call) => call[0])).toEqual([
        '/cities',
        '/streets',
        '/clients',
        '/fttx/terminal-nodes',
      ]);
      expect(post).toHaveBeenNthCalledWith(1, '/cities', {
        serviceAreaId: null,
        name: 'Thinadhoo',
        areaCode: '20003',
        timeOffset: 18000,
        timeOffsetSummer: 18000,
        outerIdentity: null,
      });
      expect(post).toHaveBeenNthCalledWith(2, '/streets', {
        serviceAreaId: null,
        name: 'Magu',
        cityId: '900',
        outerIdentity: null,
      });
      expect(post).toHaveBeenNthCalledWith(
        3,
        '/clients',
        expect.objectContaining({
          identity: 'A123456',
          name: 'Roak',
          cityId: '900',
          street: 'Magu',
          password: null,
        }),
      );
      expect(post).toHaveBeenNthCalledWith(
        4,
        '/fttx/terminal-nodes',
        expect.objectContaining({
          clientId: '902',
          cityId: '900',
          streetId: '901',
          number: '9451335',
          name: 'roak',
          isFtth: true,
          radiusUsername: null,
          radiusPassword: null,
        }),
      );
      expect(result.terminal_node_id).toBe('903');
      expect(result.onu_serials).toEqual([]);
    });

    it('reuses a city or street that already exists under the typed name', async () => {
      const { transport, post } = chainTransport({
        '/views/cities': cities,
        '/views/streets': streets,
      });
      const result = await new LiveIncaClient(transport).createSubscriber(
        subscriberInput({
          city_id: null,
          new_city: { name: ' male ', area_code: '1' },
          street_id: null,
          new_street: 'asaree  hingun',
        }),
      );
      expect(post.mock.calls.map((call) => call[0])).toEqual([
        '/clients',
        '/fttx/terminal-nodes',
      ]);
      expect(result.notes?.slice(0, 2)).toEqual([
        'City Male already exists in INCA; reused',
        'Street Asaree Hingun already exists in Male; reused',
      ]);
    });

    it('rejects ids that are not in INCA and never posts', async () => {
      const { transport, post } = chainTransport({
        '/views/cities': cities,
        '/views/streets': streets,
      });
      const client = new LiveIncaClient(transport);
      await expect(
        client.createSubscriber(subscriberInput({ city_id: '999' })),
      ).rejects.toBeInstanceOf(IncaRejectedError);
      await expect(
        client.createSubscriber(subscriberInput({ street_id: '1' })),
      ).rejects.toBeInstanceOf(IncaRejectedError);
      await expect(
        client.createSubscriber(
          subscriberInput({ client_identity: "A1' OR 1" }),
        ),
      ).rejects.toBeInstanceOf(IncaRejectedError);
      expect(post).not.toHaveBeenCalled();
    });
  });

  it('accepts the vendor form printed on ONT labels', () => {
    expect(toIncaSerial('HWTC-88FE0A3C')).toBe('4857544388FE0A3C');
    expect(toIncaSerial('hwtc88fe0a3c')).toBe('4857544388FE0A3C');
    expect(toIncaSerial('4857544388fe0a3c')).toBe('4857544388FE0A3C');
    expect(() => toIncaSerial('%25')).toThrow(IncaRejectedError);
  });
});
