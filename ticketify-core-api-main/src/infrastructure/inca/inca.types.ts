/**
 * Port for the INCA OSS. The provisioning workflow only talks to this
 * interface; `INCA_MODE` picks the adapter (the simulator until the approved
 * INCA API/middleware is available).
 */
export const INCA_CLIENT = Symbol('INCA_CLIENT');

export type IncaDevice = {
  serial: string;
  registered: boolean;
  device_type: string | null;
  service_area: string | null;
  olt_id: string | null;
  pon: string | null;
  /** Terminal Node the ONU is bound to, if any. */
  terminal_node_id: string | null;
};

export type IncaSubscriber = {
  terminal_node_id: string;
  client_identifier: string;
  name: string;
  address: string | null;
  service_area: string;
  package: string;
  pppoe_username: string;
  pppoe_enabled: boolean;
  connected: boolean;
  onu_serials: string[];
  olt_id: string | null;
  pon: string | null;
};

export type IncaTodo = {
  id: string;
  type: string;
  status: 'PENDING' | 'DONE' | 'FAILED';
  message?: string;
};

export type IncaOpticalInfo = {
  online: boolean;
  rx_dbm: number | null;
  tx_dbm: number | null;
  olt_rx_dbm: number | null;
  alarms: string[];
  read_at: string;
};

export type IncaOption = { code: string; label: string; item_code?: string };

export type IncaDetection = {
  olt_id: string;
  pon: string;
  /** Model reported by the OLT, when INCA can identify it. */
  device_type?: string | null;
};

export type IncaCreateSubscriber = {
  client_identifier: string;
  name: string;
  address: string | null;
  service_area: string;
  onu_serial: string;
  package: string;
  pppoe_username: string;
  /** Never persisted or logged by Tiketify. */
  pppoe_password: string | null;
};

export type IncaLookupPurpose = 'new_connection' | 'existing_service';

export interface IncaClient {
  readonly mode: string;
  ping(): Promise<void>;
  serviceAreas(): Promise<IncaOption[]>;
  deviceTypes(): Promise<IncaOption[]>;
  packages(): Promise<IncaOption[]>;
  findSubscriber(
    clientIdentifier: string,
    purpose: IncaLookupPurpose,
  ): Promise<IncaSubscriber | null>;
  getSubscriber(terminalNodeId: string): Promise<IncaSubscriber | null>;
  findDevice(serial: string): Promise<IncaDevice | null>;
  /** Active Device List > Unregistered: where the ONT is currently detected. */
  detectUnregistered(serial: string): Promise<IncaDetection | null>;
  registerOnt(input: {
    serial: string;
    service_area: string;
    device_type: string;
    olt_id: string;
    pon: string;
  }): Promise<IncaDevice>;
  createSubscriber(input: IncaCreateSubscriber): Promise<IncaSubscriber>;
  revokeOnu(terminalNodeId: string, serial: string): Promise<void>;
  addOnu(terminalNodeId: string, serial: string): Promise<void>;
  updateLocation(
    terminalNodeId: string,
    input: {
      service_area: string;
      address: string | null;
      olt_id: string;
      pon: string;
    },
  ): Promise<void>;
  listTodo(terminalNodeId: string): Promise<IncaTodo[]>;
  getOpticalInfo(serial: string): Promise<IncaOpticalInfo | null>;
}

/** INCA could not be reached or refused the session; safe to retry later. */
export class IncaUnavailableError extends Error {
  constructor(message = 'INCA is unavailable') {
    super(message);
    this.name = 'IncaUnavailableError';
  }
}

/** INCA rejected the operation with a business reason. */
export class IncaRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IncaRejectedError';
  }
}
