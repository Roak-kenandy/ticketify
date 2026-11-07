import {
  IncaClient,
  IncaClientRecord,
  IncaCreatedSubscriber,
  IncaCreateSubscriber,
  IncaDevice,
  IncaLocationInput,
  IncaLocationUpdate,
  IncaLookupPurpose,
  IncaNotIntegratedError,
  IncaOption,
  IncaPppoeCredentials,
  IncaRejectedError,
  IncaSubscriber,
  IncaTerminalNodeInput,
  IncaUnavailableError,
} from '../inca.types';
import {
  cityBody,
  clientBody,
  clientFilter,
  connectedStatusId,
  createdId,
  currentPackageId,
  currentStatus,
  deviceTypesFilter,
  mapPackages,
  mapTodos,
  nodeHistoryFilter,
  packagesFilter,
  parseOpticalInfo,
  terminalNodeViewFilter,
  todosFilter,
  US_LANGUAGE,
  existingTerminalNodeId,
  INCA_IDENTITY_PATTERN,
  INCA_SERIAL_PATTERN,
  isIncaId,
  mapClient,
  mapDetection,
  mapDeviceTypes,
  mapNamedOptions,
  mapOpticalDevice,
  mapRegisteredOnt,
  mapServiceAreas,
  mapTerminalNode,
  opticalDeviceFilter,
  registerOntBody,
  sameName,
  streetBody,
  streetsFilter,
  terminalNodeBody,
  terminalNodeFilter,
  activeDevicesFilter,
  onuLinkId,
  terminalNodeBySerialFilter,
  terminalNodeIdsBySerial,
  pppoeBody,
  locationBody,
  deviceOltBody,
} from './inca-live.mappers';
import { IncaTransport } from './inca-transport';

const LOOKUP_TTL_MS = 10 * 60 * 1000;

type AddressPick = Pick<
  IncaTerminalNodeInput,
  'city_id' | 'new_city' | 'street_id' | 'new_street'
>;

/**
 * INCA REST adapter (INCA_MODE=live). Covers the new-connection flow end to end (ONT
 * registration, Terminal Node, ONU, package, status, Todo, optical info); operations for
 * existing services report "not integrated" without contacting INCA until their APIs are
 * wired in, so no workflow can half-complete against an unknown endpoint.
 */
export class LiveIncaClient implements IncaClient {
  readonly mode = 'live';
  private typesCache: { at: number; value: Promise<IncaOption[]> } | null =
    null;
  private citiesCache: { at: number; value: Promise<IncaOption[]> } | null =
    null;
  private packagesCache: { at: number; value: Promise<IncaOption[]> } | null =
    null;
  private statusesCache: { at: number; value: Promise<unknown> } | null = null;

  constructor(
    private readonly transport: IncaTransport,
    private readonly now: () => number = Date.now,
  ) {}

  async ping() {
    await this.transport.userId();
  }

  async serviceAreas() {
    const userId = await this.transport.userId();
    return mapServiceAreas(
      await this.transport.get(`/views/inca-users/${userId}/service-areas`, {
        order: 'serviceAreaName ASC',
      }),
    );
  }

  deviceTypes() {
    if (!this.typesCache || this.now() - this.typesCache.at > LOOKUP_TTL_MS) {
      const value = this.transport
        .get('/views/fttx/optical-device-types', deviceTypesFilter())
        .then(mapDeviceTypes);
      value.catch(() => {
        if (this.typesCache?.value === value) this.typesCache = null;
      });
      this.typesCache = { at: this.now(), value };
    }
    return this.typesCache.value;
  }

  packages() {
    if (
      !this.packagesCache ||
      this.now() - this.packagesCache.at > LOOKUP_TTL_MS
    ) {
      const value = this.transport
        .get('/views/fttx/packages', packagesFilter())
        .then(mapPackages);
      value.catch(() => {
        if (this.packagesCache?.value === value) this.packagesCache = null;
      });
      this.packagesCache = { at: this.now(), value };
    }
    return this.packagesCache.value;
  }

  async findSubscriber(
    _clientIdentifier: string,
    purpose: IncaLookupPurpose,
  ): Promise<IncaSubscriber | null> {
    // A new connection finds its own client and Terminal Node again in createSubscriber;
    // existing-service work genuinely needs this lookup and is refused until integrated.
    if (purpose === 'new_connection') return null;
    throw new IncaNotIntegratedError('Subscriber lookup');
  }

  async getSubscriber(terminalNodeId: string): Promise<IncaSubscriber | null> {
    if (!isIncaId(terminalNodeId)) return null;
    return mapTerminalNode(
      await this.transport.get(
        '/views/fttx/terminal-nodes',
        terminalNodeViewFilter(terminalNodeId),
      ),
    );
  }

  async findSubscriberBySerial(serial: string): Promise<IncaSubscriber | null> {
    const incaSerial = toIncaSerial(serial);
    const nodes = terminalNodeIdsBySerial(
      await this.transport.get(
        '/views/fttx/terminal-nodes',
        terminalNodeBySerialFilter(incaSerial),
      ),
      incaSerial,
    );
    if (nodes.length > 1) {
      throw new IncaRejectedError(
        `ONT ${incaSerial} is on several Terminal Nodes (${nodes.join(', ')}); fix it in INCA first`,
      );
    }
    return nodes.length ? this.getSubscriber(nodes[0]) : null;
  }

  async findDevice(serial: string): Promise<IncaDevice | null> {
    const incaSerial = toIncaSerial(serial);
    return mapOpticalDevice(
      await this.transport.get(
        '/views/fttx/optical-devices',
        opticalDeviceFilter(incaSerial),
      ),
      incaSerial,
    );
  }

  /**
   * Searches both Active Device lists at once. A list that fails only matters when the
   * other one did not find the ONT: "not detected" is never reported on partial data.
   */
  async detectOnOlt(serial: string) {
    const incaSerial = toIncaSerial(serial);
    const filter = activeDevicesFilter(incaSerial);
    const [unregistered, registered, types] = await Promise.allSettled([
      this.transport.get('/fttx/unregistered-active-devices', filter),
      this.transport.get('/fttx/registered-active-devices', filter),
      this.deviceTypes().catch(() => [] as IncaOption[]),
    ]);
    const known = types.status === 'fulfilled' ? types.value : [];
    const found =
      (unregistered.status === 'fulfilled' &&
        mapDetection(unregistered.value, incaSerial, known, 'UNREGISTERED')) ||
      (registered.status === 'fulfilled' &&
        mapDetection(registered.value, incaSerial, known, 'REGISTERED'));
    if (found) return found;
    const failed = [unregistered, registered].find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failed) throw failed.reason;
    return null;
  }

  async registerOnt(input: {
    serial: string;
    service_area: string;
    device_type: string;
    olt_id: string;
    olt_name?: string | null;
    pon: string;
  }) {
    const serial = toIncaSerial(input.serial);
    if (!isIncaId(input.device_type)) {
      throw new IncaRejectedError('Choose an INCA device type');
    }
    if (!isIncaId(input.olt_id)) {
      throw new IncaRejectedError(
        'The detected OLT is not valid; detect the ONT again',
      );
    }
    const created = await this.transport.post(
      '/fttx/optical-devices',
      registerOntBody({
        serial,
        device_type: input.device_type,
        olt_id: input.olt_id,
      }),
    );
    return mapRegisteredOnt(created, { ...input, serial });
  }

  cities() {
    if (!this.citiesCache || this.now() - this.citiesCache.at > LOOKUP_TTL_MS) {
      const value = this.transport
        .get('/views/cities', { order: 'name ASC' })
        .then(mapNamedOptions);
      value.catch(() => {
        if (this.citiesCache?.value === value) this.citiesCache = null;
      });
      this.citiesCache = { at: this.now(), value };
    }
    return this.citiesCache.value;
  }

  async streets(cityId: string) {
    if (!isIncaId(cityId)) throw new IncaRejectedError('Choose a valid city');
    return mapNamedOptions(
      await this.transport.get('/views/streets', streetsFilter(cityId)),
    );
  }

  async findClient(identity: string): Promise<IncaClientRecord | null> {
    const wanted = toIdentity(identity);
    return mapClient(
      await this.transport.get('/views/clients', clientFilter(wanted)),
      wanted,
    );
  }

  /**
   * Creates the INCA Terminal Node for a new connection: city, street and client are reused
   * when they exist (or were created by an earlier attempt) and created only when missing,
   * so a retry after any failure never duplicates them.
   */
  async createSubscriber(
    input: IncaCreateSubscriber,
  ): Promise<IncaCreatedSubscriber> {
    const node = input.terminal_node;
    if (!node)
      throw new IncaRejectedError('Terminal node details are required');
    const number = node.number.trim();
    if (!/^\d{1,15}$/.test(number))
      throw new IncaRejectedError('Terminal node number must be digits');
    const identity = toIdentity(node.client_identity);
    const notes: string[] = [];
    const serviceAreaId = await this.serviceAreaId(input.service_area);

    const city = await this.ensureCity(node, serviceAreaId, notes);
    const street = await this.ensureStreet(city, node, serviceAreaId, notes);

    let client = await this.findClient(identity);
    if (client) {
      notes.push(`INCA client ${identity} found (${client.name || 'no name'})`);
    } else {
      const created = await this.transport.post(
        '/clients',
        clientBody({
          identity,
          name: required(node.client_name, 'Client name'),
          city_id: city.code,
          street: street.label,
          phone: node.phone,
          email: node.email,
          service_area_id: serviceAreaId,
        }),
      );
      const clientId = createdId(created);
      if (!clientId)
        throw new IncaUnavailableError('INCA did not return the new client');
      client = { id: clientId, identity, name: node.client_name };
      notes.push(`INCA client ${identity} created`);
    }

    let nodeId = existingTerminalNodeId(
      await this.transport.get(
        '/fttx/terminal-nodes',
        terminalNodeFilter(client.id, number),
      ),
    );
    if (nodeId) {
      notes.push(
        `Terminal Node ${nodeId} already exists for this client; reused`,
      );
    } else {
      nodeId = createdId(
        await this.transport.post(
          '/fttx/terminal-nodes',
          terminalNodeBody({
            name: required(node.name, 'Terminal node name'),
            number,
            client_id: client.id,
            city_id: city.code,
            street_id: street.code,
            phone: node.phone,
            email: node.email,
            service_area_id: serviceAreaId,
          }),
        ),
      );
      if (!nodeId)
        throw new IncaUnavailableError(
          'INCA did not return the new Terminal Node',
        );
      notes.push(
        `Terminal Node ${nodeId} created (${street.label} ${number}, ${city.label})`,
      );
    }

    return {
      terminal_node_id: nodeId,
      client_identifier: identity,
      name: node.name,
      address: `${street.label} ${number}, ${city.label}`,
      service_area: input.service_area,
      package: input.package,
      pppoe_username: input.pppoe_username,
      pppoe_enabled: false,
      connected: false,
      onu_serials: [],
      olt_id: null,
      pon: null,
      notes,
    };
  }

  private async serviceAreaId(label: string): Promise<string | null> {
    if (!label) return null;
    const match = (await this.serviceAreas()).find(
      (area) => area.label === label,
    );
    if (!match)
      throw new IncaRejectedError(
        `Service area "${label}" is not available in INCA`,
      );
    return match.code;
  }

  private async ensureCity(
    node: AddressPick,
    serviceAreaId: string | null,
    notes: string[],
  ): Promise<IncaOption> {
    const cities = await this.cities();
    if (node.city_id) {
      const city = cities.find((item) => item.code === node.city_id);
      if (!city)
        throw new IncaRejectedError('The chosen city no longer exists in INCA');
      return city;
    }
    const wanted = node.new_city;
    if (!wanted) throw new IncaRejectedError('Choose or add the city');
    const existing = cities.find((item) => sameName(item.label, wanted.name));
    if (existing) {
      notes.push(`City ${existing.label} already exists in INCA; reused`);
      return existing;
    }
    if (!/^\d{1,10}$/.test(wanted.area_code)) {
      throw new IncaRejectedError('City area code must be digits');
    }
    const created = createdId(
      await this.transport.post(
        '/cities',
        cityBody({
          name: wanted.name.trim(),
          area_code: wanted.area_code,
          service_area_id: serviceAreaId,
        }),
      ),
    );
    this.citiesCache = null;
    if (!created)
      throw new IncaUnavailableError('INCA did not return the new city');
    notes.push(`City ${wanted.name.trim()} created in INCA`);
    return { code: created, label: wanted.name.trim() };
  }

  private async ensureStreet(
    city: IncaOption,
    node: AddressPick,
    serviceAreaId: string | null,
    notes: string[],
  ): Promise<IncaOption> {
    const streets = await this.streets(city.code);
    if (node.street_id) {
      const street = streets.find((item) => item.code === node.street_id);
      if (!street)
        throw new IncaRejectedError(
          `The chosen street is not in ${city.label}`,
        );
      return street;
    }
    const wanted = node.new_street?.trim();
    if (!wanted) throw new IncaRejectedError('Choose or add the street');
    const existing = streets.find((item) => sameName(item.label, wanted));
    if (existing) {
      notes.push(
        `Street ${existing.label} already exists in ${city.label}; reused`,
      );
      return existing;
    }
    const created = createdId(
      await this.transport.post(
        '/streets',
        streetBody({
          name: wanted,
          city_id: city.code,
          service_area_id: serviceAreaId,
        }),
      ),
    );
    if (!created)
      throw new IncaUnavailableError('INCA did not return the new street');
    notes.push(`Street ${wanted} created in ${city.label}`);
    return { code: created, label: wanted };
  }

  /** INCA's "Revoke": deletes the node's ONU binding; a binding already gone is a no-op. */
  async revokeOnu(terminalNodeId: string, serial: string): Promise<void> {
    const nodeId = nodeIdOf(terminalNodeId);
    const linkId = onuLinkId(
      await this.transport.get(
        `/views/fttx/terminal-nodes/${nodeId}/optical-devices`,
        { limit: 20 },
      ),
      toIncaSerial(serial),
    );
    if (!linkId) return;
    await this.transport.delete(
      `/fttx/terminal-nodes-optical-device/${linkId}`,
    );
  }

  /** Binds the registered ONT to the Terminal Node (INCA's "Add ONU"). */
  async addOnu(terminalNodeId: string, serial: string): Promise<void> {
    const nodeId = nodeIdOf(terminalNodeId);
    const device = await this.findDevice(serial);
    if (!device?.device_id) {
      throw new IncaRejectedError(`ONT ${serial} is not registered in INCA`);
    }
    if (device.terminal_node_id === nodeId) return;
    if (device.terminal_node_id) {
      throw new IncaRejectedError(
        `ONT ${serial} is bound to another Terminal Node (${device.terminal_node_id})`,
      );
    }
    await this.transport.post('/fttx/terminal-nodes-optical-device', {
      opticalDeviceId: device.device_id,
      terminalNodeId: Number(nodeId),
    });
  }

  /** INCA's Terminal Node "PPPoE" switch; the credentials are sent only in this body. */
  async setPppoe(terminalNodeId: string, credentials: IncaPppoeCredentials) {
    const nodeId = nodeIdOf(terminalNodeId);
    if (!/^[A-Za-z0-9._@-]{3,64}$/.test(credentials.username)) {
      throw new IncaRejectedError(
        'PPPoE username may use letters, digits and . _ @ -',
      );
    }
    if (!credentials.password) {
      throw new IncaRejectedError('PPPoE password is required');
    }
    await this.transport.patch(
      `/fttx/terminal-nodes/${nodeId}`,
      pppoeBody(credentials),
    );
  }

  async assignPackage(terminalNodeId: string, packageCode: string) {
    const nodeId = nodeIdOf(terminalNodeId);
    const pkg = (await this.packages()).find(
      (item) => item.code === packageCode,
    );
    if (!pkg) throw new IncaRejectedError('Choose a package offered by INCA');
    const current = currentPackageId(
      await this.transport.get(
        `/views/fttx/terminal-nodes/${nodeId}/package`,
        nodeHistoryFilter(),
      ),
    );
    if (current === pkg.code) return { label: pkg.label, changed: false };
    await this.transport.post('/fttx/terminal-nodes-package', {
      packageId: pkg.code,
      terminalNodeId: Number(nodeId),
    });
    return { label: pkg.label, changed: true };
  }

  async markConnected(terminalNodeId: string) {
    const nodeId = nodeIdOf(terminalNodeId);
    const [statuses, history] = await Promise.all([
      this.statuses(),
      this.transport.get(
        `/views/fttx/terminal-nodes/${nodeId}/status`,
        nodeHistoryFilter(true),
      ),
    ]);
    const connected = connectedStatusId(statuses);
    if (!connected) {
      throw new IncaUnavailableError('INCA has no "Connected" status');
    }
    const current = currentStatus(history);
    if (!current) {
      throw new IncaRejectedError(
        `Terminal Node ${nodeId} has no status to update`,
      );
    }
    if (current.statusId === connected) return { changed: false };
    await this.transport.patch(`/fttx/terminal-nodes-status/${current.rowId}`, {
      statusId: connected,
    });
    return { changed: true };
  }

  /**
   * INCA's Terminal Node address edit. City and street are reused or created like on a new
   * connection; the PATCH is skipped when the node already has this address.
   */
  async updateLocation(
    terminalNodeId: string,
    input: IncaLocationInput,
  ): Promise<IncaLocationUpdate> {
    const nodeId = nodeIdOf(terminalNodeId);
    const number = input.number.trim();
    if (!/^\d{1,15}$/.test(number))
      throw new IncaRejectedError('Terminal node number must be digits');
    const notes: string[] = [];
    const city = await this.ensureCity(input, null, notes);
    const street = await this.ensureStreet(city, input, null, notes);
    const location = { city_id: city.code, street_id: street.code, number };
    const address = `${street.label} ${number}, ${city.label}`;
    const current = (await this.getSubscriber(nodeId))?.location;
    if (
      current?.city_id === location.city_id &&
      current.street_id === location.street_id &&
      current.number === location.number
    ) {
      return { address, location, changed: false, notes };
    }
    await this.transport.patch(
      `/fttx/terminal-nodes/${nodeId}`,
      locationBody(location),
    );
    return { address, location, changed: true, notes };
  }

  /** INCA's optical device edit, OLT only; refused while the ONT is still on a node. */
  async moveDevice(serial: string, oltId: string) {
    if (!isIncaId(oltId))
      throw new IncaRejectedError(
        'The detected OLT is not valid; detect the ONT again',
      );
    const device = await this.findDevice(serial);
    if (!device?.device_id)
      throw new IncaRejectedError(`ONT ${serial} is not registered in INCA`);
    if (device.olt_id === oltId) return { changed: false };
    if (device.terminal_node_id) {
      throw new IncaRejectedError(
        `ONT ${serial} is still on Terminal Node ${device.terminal_node_id}; revoke it before moving it to another OLT`,
      );
    }
    await this.transport.patch(
      `/fttx/optical-devices/${device.device_id}`,
      deviceOltBody(oltId),
    );
    return { changed: true };
  }

  async listTodo(terminalNodeId: string) {
    return mapTodos(
      await this.transport.get(
        '/views/fttx/todos',
        todosFilter(nodeIdOf(terminalNodeId)),
      ),
    );
  }

  /** Reads the OLT's live optical levels for the ONT; null while INCA has no reading. */
  async getOpticalInfo(serial: string) {
    const device = await this.findDevice(serial);
    if (!device?.olt_id) return null;
    return parseOpticalInfo(
      await this.transport.get(
        `/fttx/olts/${device.olt_id}/optical-info/serial-numbers/${device.serial}`,
        { where: US_LANGUAGE },
      ),
      new Date(this.now()).toISOString(),
    );
  }

  private statuses() {
    if (
      !this.statusesCache ||
      this.now() - this.statusesCache.at > LOOKUP_TTL_MS
    ) {
      const value = this.transport.get<unknown>('/views/statuses', {
        where: US_LANGUAGE,
      });
      value.catch(() => {
        if (this.statusesCache?.value === value) this.statusesCache = null;
      });
      this.statusesCache = { at: this.now(), value };
    }
    return this.statusesCache.value;
  }
}

function nodeIdOf(terminalNodeId: string): string {
  if (!isIncaId(terminalNodeId)) {
    throw new IncaRejectedError('Not a valid INCA Terminal Node');
  }
  return terminalNodeId;
}

function toIdentity(value: string): string {
  const identity = value.trim().toUpperCase();
  if (!INCA_IDENTITY_PATTERN.test(identity)) {
    throw new IncaRejectedError('Enter a valid ID card or passport number');
  }
  return identity;
}

function required(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new IncaRejectedError(`${label} is required`);
  return trimmed;
}

/**
 * INCA stores Huawei serials as 16 hex digits. ONT labels also print the vendor form
 * (HWTC-074C049E / HWTC074C049E), which is the same serial with the vendor id in ASCII.
 */
export function toIncaSerial(serial: string): string {
  const compact = serial.trim().toUpperCase().replace(/-/g, '');
  const vendorForm = compact.match(/^([A-Z]{4})([0-9A-F]{8})$/);
  const value = vendorForm
    ? Buffer.from(vendorForm[1], 'ascii').toString('hex').toUpperCase() +
      vendorForm[2]
    : compact;
  if (!INCA_SERIAL_PATTERN.test(value)) {
    throw new IncaRejectedError(
      `"${serial}" is not a valid ONT serial for INCA`,
    );
  }
  return value;
}
