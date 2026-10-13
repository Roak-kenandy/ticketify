import { createHash, randomBytes } from 'crypto';
import {
  IncaClient,
  IncaCreateSubscriber,
  IncaDevice,
  IncaLookupPurpose,
  IncaOpticalInfo,
  IncaOption,
  IncaRejectedError,
  IncaSubscriber,
  IncaTodo,
  IncaUnavailableError,
} from './inca.types';

type DummyOptions = { latencyMs: number; offline: boolean };

const SERVICE_AREAS: IncaOption[] = [
  "Male'",
  'Hulhumale',
  'Villimale',
  'Addu City',
  'Fuvahmulah',
  'Kulhudhuffushi',
  'Thinadhoo',
  'Naifaru',
].map((name) => ({
  code: name.toUpperCase().replace(/[^A-Z]/g, ''),
  label: name,
}));

const DEVICE_TYPES: IncaOption[] = [
  {
    code: 'HG8145X6',
    label: 'Dual band ONT (HG8145X6)',
    item_code: 'ONT_DUAL_BAND',
  },
  {
    code: 'HN8145XR',
    label: '10G dual band ONT (HN8145XR)',
    item_code: 'ONT_10G_DUAL_BAND',
  },
  { code: 'OOREDOO_ONT', label: 'Ooredoo ONT', item_code: 'ONT_OOREDOO' },
];

const PACKAGES: IncaOption[] = [
  'Fibre 30',
  'Fibre 50',
  'Fibre 100',
  'Fibre 200',
  'Fibre 500',
  'Fibre 1G',
].map((name) => ({
  code: name.toUpperCase().replace(/\s+/g, '_'),
  label: `${name} Mbps`.replace('1G Mbps', '1 Gbps'),
}));

/**
 * In-memory stand-in for INCA so the whole workflow can be built and tested
 * before the integration interface is approved. State lives for the process.
 *
 * Test serials: contains NODETECT (not seen on any OLT), FAILREG / FAILCFG /
 * FAILTODO (fails that stage on the first attempt only, so Retry succeeds),
 * WEAK (low signal until corrective work), LOS (no optical reading).
 */
export class DummyIncaClient implements IncaClient {
  readonly mode = 'dummy';
  private readonly subscribers = new Map<string, IncaSubscriber>();
  private readonly devices = new Map<string, IncaDevice>();
  private readonly todos = new Map<
    string,
    (IncaTodo & { ready_at: number; serial: string })[]
  >();
  private readonly failedOnce = new Set<string>();
  private readonly reads = new Map<string, number>();

  constructor(private readonly options: DummyOptions) {}

  async ping() {
    await this.call();
  }

  async serviceAreas() {
    await this.call(0.2);
    return SERVICE_AREAS;
  }

  async deviceTypes() {
    await this.call(0.2);
    return DEVICE_TYPES;
  }

  async packages() {
    await this.call(0.2);
    return PACKAGES;
  }

  async findSubscriber(clientIdentifier: string, purpose: IncaLookupPurpose) {
    await this.call();
    const existing = [...this.subscribers.values()].find(
      (sub) => sub.client_identifier === clientIdentifier,
    );
    if (existing || purpose === 'new_connection') {
      return existing ? clone(existing) : null;
    }
    return clone(this.seedExistingCustomer(clientIdentifier));
  }

  async getSubscriber(terminalNodeId: string) {
    await this.call();
    const sub = this.subscribers.get(terminalNodeId);
    return sub ? clone(sub) : null;
  }

  async findDevice(serial: string) {
    await this.call();
    const device = this.devices.get(serial);
    return device ? { ...device } : null;
  }

  async detectUnregistered(serial: string) {
    await this.call();
    if (serial.includes('NODETECT') || this.devices.get(serial)?.registered) {
      return null;
    }
    const h = hash(serial);
    return {
      olt_id: `OLT-${(h % 6) + 1}`,
      pon: `0/${h % 4}/${h % 16}`,
      device_type: guessDeviceType(serial),
    };
  }

  async registerOnt(input: {
    serial: string;
    service_area: string;
    device_type: string;
    olt_id: string;
    pon: string;
  }) {
    await this.call(1.5);
    this.failFirst(
      input.serial,
      'FAILREG',
      'INCA rejected ONT registration: OLT port busy',
    );
    const existing = this.devices.get(input.serial);
    if (existing?.registered) {
      throw new IncaRejectedError('ONT serial already registered');
    }
    const device: IncaDevice = {
      serial: input.serial,
      registered: true,
      device_type: input.device_type,
      service_area: input.service_area,
      olt_id: input.olt_id,
      pon: input.pon,
      terminal_node_id: null,
    };
    this.devices.set(input.serial, device);
    return { ...device };
  }

  async createSubscriber(input: IncaCreateSubscriber) {
    await this.call(1.5);
    this.failFirst(
      input.onu_serial,
      'FAILCFG',
      'Simple Subscriber Registration failed: Radius did not respond',
    );
    if (
      [...this.subscribers.values()].some(
        (sub) => sub.client_identifier === input.client_identifier,
      )
    ) {
      throw new IncaRejectedError(
        'A subscriber already exists for this client identifier',
      );
    }
    const device = this.devices.get(input.onu_serial);
    if (!device?.registered || device.terminal_node_id) {
      throw new IncaRejectedError('ONU is not registered or is already bound');
    }
    const terminalNodeId = `TN-${randomBytes(3).toString('hex').toUpperCase()}`;
    const sub: IncaSubscriber = {
      terminal_node_id: terminalNodeId,
      client_identifier: input.client_identifier,
      name: input.name,
      address: input.address,
      service_area: input.service_area,
      package: input.package,
      pppoe_username: input.pppoe_username,
      pppoe_enabled: true,
      connected: true,
      onu_serials: [input.onu_serial],
      olt_id: device.olt_id,
      pon: device.pon,
    };
    device.terminal_node_id = terminalNodeId;
    this.subscribers.set(terminalNodeId, sub);
    this.queueTodo(terminalNodeId, 'SERVICE_ACTIVATION', input.onu_serial);
    return clone(sub);
  }

  async revokeOnu(terminalNodeId: string, serial: string) {
    await this.call();
    const sub = this.mustGet(terminalNodeId);
    sub.onu_serials = sub.onu_serials.filter((value) => value !== serial);
    const device = this.devices.get(serial);
    if (device) device.terminal_node_id = null;
  }

  async addOnu(terminalNodeId: string, serial: string) {
    await this.call();
    this.failFirst(serial, 'FAILCFG', 'Add ONU failed: ONU list not ready');
    const sub = this.mustGet(terminalNodeId);
    const device = this.devices.get(serial);
    if (!device?.registered) {
      throw new IncaRejectedError('ONU is not registered');
    }
    if (device.terminal_node_id && device.terminal_node_id !== terminalNodeId) {
      throw new IncaRejectedError('ONU is bound to another Terminal Node');
    }
    if (!sub.onu_serials.includes(serial)) sub.onu_serials.push(serial);
    device.terminal_node_id = terminalNodeId;
    sub.olt_id = device.olt_id;
    sub.pon = device.pon;
    this.queueTodo(terminalNodeId, 'WAN_CONFIGURATION', serial);
  }

  async updateLocation(
    terminalNodeId: string,
    input: {
      service_area: string;
      address: string | null;
      olt_id: string;
      pon: string;
    },
  ) {
    await this.call();
    const sub = this.mustGet(terminalNodeId);
    sub.service_area = input.service_area;
    sub.address = input.address ?? sub.address;
    sub.olt_id = input.olt_id;
    sub.pon = input.pon;
    for (const serial of sub.onu_serials) {
      const device = this.devices.get(serial);
      if (device)
        Object.assign(device, {
          service_area: input.service_area,
          olt_id: input.olt_id,
          pon: input.pon,
        });
    }
    this.queueTodo(terminalNodeId, 'LOCATION_UPDATE', sub.onu_serials[0] ?? '');
  }

  async listTodo(terminalNodeId: string) {
    await this.call(0.3);
    const now = Date.now();
    const list = this.todos.get(terminalNodeId) ?? [];
    for (const todo of list) {
      if (todo.status === 'FAILED') {
        // INCA re-runs a failed task once it has been reported.
        todo.status = 'DONE';
        todo.message = undefined;
        continue;
      }
      if (todo.status !== 'PENDING' || now < todo.ready_at) continue;
      const key = `${todo.serial}:FAILTODO`;
      if (todo.serial.includes('FAILTODO') && !this.failedOnce.has(key)) {
        this.failedOnce.add(key);
        todo.status = 'FAILED';
        todo.message = `${todo.type} timed out on the OLT`;
      } else {
        todo.status = 'DONE';
      }
    }
    return list.map(({ id, type, status, message }) => ({
      id,
      type,
      status,
      message,
    }));
  }

  async getOpticalInfo(serial: string): Promise<IncaOpticalInfo | null> {
    await this.call();
    const device = this.devices.get(serial);
    if (!device?.registered) return null;
    const read_at = new Date().toISOString();
    if (serial.includes('LOS')) {
      return {
        online: false,
        rx_dbm: null,
        tx_dbm: null,
        olt_rx_dbm: null,
        alarms: ['LOS'],
        read_at,
      };
    }
    const count = (this.reads.get(serial) ?? 0) + 1;
    this.reads.set(serial, count);
    const h = hash(serial);
    const weak = serial.includes('WEAK') && count === 1;
    const rx = weak ? -29.4 : -(17 + (h % 70) / 10);
    return {
      online: true,
      rx_dbm: round1(rx),
      tx_dbm: round1(2 + (h % 20) / 10),
      olt_rx_dbm: round1(rx - 1.2),
      alarms: weak ? ['LOW_RX_POWER'] : [],
      read_at,
    };
  }

  private seedExistingCustomer(clientIdentifier: string): IncaSubscriber {
    const h = hash(clientIdentifier);
    const serial = `HWTC${h.toString(16).toUpperCase().padStart(8, '0').slice(0, 8)}`;
    const terminalNodeId = `TN-${serial.slice(-6)}`;
    const area = SERVICE_AREAS[h % SERVICE_AREAS.length];
    const device: IncaDevice = {
      serial,
      registered: true,
      device_type: DEVICE_TYPES[h % DEVICE_TYPES.length].code,
      service_area: area.label,
      olt_id: `OLT-${(h % 6) + 1}`,
      pon: `0/${h % 4}/${h % 16}`,
      terminal_node_id: terminalNodeId,
    };
    const sub: IncaSubscriber = {
      terminal_node_id: terminalNodeId,
      client_identifier: clientIdentifier,
      name: 'Existing subscriber',
      address: null,
      service_area: area.label,
      package: PACKAGES[h % PACKAGES.length].label,
      pppoe_username: `mn${(h % 900000) + 100000}`,
      pppoe_enabled: true,
      connected: true,
      onu_serials: [serial],
      olt_id: device.olt_id,
      pon: device.pon,
    };
    this.devices.set(serial, device);
    this.subscribers.set(terminalNodeId, sub);
    return sub;
  }

  private queueTodo(terminalNodeId: string, type: string, serial: string) {
    const list = this.todos.get(terminalNodeId) ?? [];
    list.push({
      id: randomBytes(4).toString('hex'),
      type,
      status: 'PENDING',
      serial,
      ready_at: Date.now() + this.options.latencyMs * 3,
    });
    this.todos.set(terminalNodeId, list);
  }

  private failFirst(serial: string, marker: string, message: string) {
    const key = `${serial}:${marker}`;
    if (serial.includes(marker) && !this.failedOnce.has(key)) {
      this.failedOnce.add(key);
      throw new IncaRejectedError(message);
    }
  }

  private mustGet(terminalNodeId: string) {
    const sub = this.subscribers.get(terminalNodeId);
    if (!sub) throw new IncaRejectedError('Terminal Node not found');
    return sub;
  }

  private async call(weight = 1) {
    if (this.options.offline) {
      throw new IncaUnavailableError('INCA is unavailable (simulated outage)');
    }
    const ms = Math.round(
      this.options.latencyMs * weight * (0.6 + Math.random() * 0.8),
    );
    if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/** Simulated OLT model report: 10G and Ooredoo units are told apart by serial. */
function guessDeviceType(serial: string): string | null {
  if (serial.includes('10G')) return 'HN8145XR';
  if (serial.startsWith('OOR')) return 'OOREDOO_ONT';
  if (serial.startsWith('HWTC') || serial.startsWith('4857')) return 'HG8145X6';
  return null;
}

function hash(value: string): number {
  return createHash('sha1').update(value).digest().readUInt32BE(0);
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
