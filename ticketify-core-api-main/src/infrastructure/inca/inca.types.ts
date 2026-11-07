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
  /** Display name of the OLT (e.g. OLT_2), when INCA reports it. */
  olt_name?: string | null;
  pon: string | null;
  /** Terminal Node the ONU is bound to, if any. */
  terminal_node_id: string | null;
  /** INCA's own id for the registered device, when known. */
  device_id?: string | null;
};

export type IncaSubscriber = {
  terminal_node_id: string;
  client_identifier: string;
  name: string;
  address: string | null;
  service_area: string;
  package: string;
  pppoe_username: string;
  /** PPPoE session is up (INCA isPppoeActive); needs the ONT online. */
  pppoe_enabled: boolean;
  /** PPPoE is switched on for the node with credentials (INCA isPppoe). */
  pppoe_configured?: boolean;
  connected: boolean;
  onu_serials: string[];
  olt_id: string | null;
  pon: string | null;
  /** The node's address as INCA ids, when INCA reports them. */
  location?: IncaNodeLocation | null;
};

export type IncaNodeLocation = {
  city_id: string | null;
  street_id: string | null;
  number: string | null;
};

/**
 * Destination address for a relocation. City and street are picked from INCA (ids) or
 * typed in, in which case they are created when missing.
 */
export type IncaLocationInput = {
  city_id: string | null;
  new_city: { name: string; area_code: string } | null;
  street_id: string | null;
  new_street: string | null;
  number: string;
};

export type IncaLocationUpdate = {
  address: string;
  location: IncaNodeLocation;
  changed: boolean;
  notes: string[];
};

export type IncaPppoeCredentials = { username: string; password: string };

/** Operator-customised ONTs (e.g. Ooredoo firmware) only get service over PPPoE. */
export function operatorNeedsPppoe(operator: string | null | undefined) {
  return /OOREDOO/i.test(operator ?? '');
}

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
  /** Every line of INCA's optical info (voltage, bias current, temperature, CATV …). */
  details?: { label: string; value: string }[];
};

export type IncaOption = { code: string; label: string; item_code?: string };

export type IncaDetection = {
  olt_id: string;
  olt_name?: string | null;
  pon: string;
  /** Model reported by the OLT, when INCA can identify it. */
  device_type?: string | null;
  /**
   * Which Active Device list the ONT is on: UNREGISTERED (autofind, not configured on the
   * OLT) or REGISTERED (already configured on the OLT).
   */
  olt_state?: 'UNREGISTERED' | 'REGISTERED';
  /** OLT-reported run state; null when the OLT does not say. */
  online?: boolean | null;
  /** Firmware customisation the ONT reports (ontCustomizedInfo, e.g. MVOOREDOO). */
  operator?: string | null;
  /** The ONT only gets service once PPPoE is set on its Terminal Node. */
  pppoe_required?: boolean;
};

/**
 * What the technician enters for INCA's Terminal Node. City, street and client are either
 * picked from INCA (ids) or typed in, in which case they are created when missing.
 */
export type IncaTerminalNodeInput = {
  name: string;
  /** INCA "Number" of the Terminal Node. */
  number: string;
  /** Customer ID card / passport number; identifies the INCA client. */
  client_identity: string;
  client_name: string;
  city_id: string | null;
  new_city: { name: string; area_code: string } | null;
  street_id: string | null;
  new_street: string | null;
  phone: string | null;
  email: string | null;
};

export type IncaClientRecord = { id: string; identity: string; name: string };

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
  terminal_node: IncaTerminalNodeInput | null;
};

/** A created subscriber plus what INCA had to create or reused on the way, for the run log. */
export type IncaCreatedSubscriber = IncaSubscriber & { notes?: string[] };

export type IncaLookupPurpose = 'new_connection' | 'existing_service';

export interface IncaClient {
  readonly mode: string;
  ping(): Promise<void>;
  serviceAreas(): Promise<IncaOption[]>;
  deviceTypes(): Promise<IncaOption[]>;
  packages(): Promise<IncaOption[]>;
  cities(): Promise<IncaOption[]>;
  streets(cityId: string): Promise<IncaOption[]>;
  findClient(identity: string): Promise<IncaClientRecord | null>;
  findSubscriber(
    clientIdentifier: string,
    purpose: IncaLookupPurpose,
  ): Promise<IncaSubscriber | null>;
  getSubscriber(terminalNodeId: string): Promise<IncaSubscriber | null>;
  /** The Terminal Node the ONU serial is attached to (INCA's terminal node search). */
  findSubscriberBySerial(serial: string): Promise<IncaSubscriber | null>;
  findDevice(serial: string): Promise<IncaDevice | null>;
  /**
   * Active Device List (Unregistered and Registered): where the ONT is physically seen on
   * an OLT. Unregistered wins when an ONT appears on both.
   */
  detectOnOlt(serial: string): Promise<IncaDetection | null>;
  registerOnt(input: {
    serial: string;
    service_area: string;
    device_type: string;
    olt_id: string;
    olt_name?: string | null;
    pon: string;
  }): Promise<IncaDevice>;
  createSubscriber(input: IncaCreateSubscriber): Promise<IncaCreatedSubscriber>;
  /** Removes the ONU from the node (INCA "Revoke"); INCA then deletes it from the OLT. */
  revokeOnu(terminalNodeId: string, serial: string): Promise<void>;
  addOnu(terminalNodeId: string, serial: string): Promise<void>;
  /** Switches PPPoE on for the Terminal Node with these Radius credentials. */
  setPppoe(
    terminalNodeId: string,
    credentials: IncaPppoeCredentials,
  ): Promise<void>;
  /** Assigns the package unless it is already the node's current one. */
  assignPackage(
    terminalNodeId: string,
    packageCode: string,
  ): Promise<{ label: string; changed: boolean }>;
  /** Sets the Terminal Node status to Connected unless it already is. */
  markConnected(terminalNodeId: string): Promise<{ changed: boolean }>;
  /** Moves the Terminal Node to a new address; PPPoE, package and ONUs are untouched. */
  updateLocation(
    terminalNodeId: string,
    input: IncaLocationInput,
  ): Promise<IncaLocationUpdate>;
  /**
   * Points an unbound ONT's INCA record at the OLT it is now connected to (the customer
   * moved it); a no-op when the record already names that OLT.
   */
  moveDevice(serial: string, oltId: string): Promise<{ changed: boolean }>;
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

/** The live adapter does not cover this INCA operation yet; nothing was sent to INCA. */
export class IncaNotIntegratedError extends IncaUnavailableError {
  constructor(operation: string) {
    super(`${operation} is not integrated with INCA yet`);
    this.name = 'IncaNotIntegratedError';
  }
}

/** INCA rejected the operation with a business reason. */
export class IncaRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IncaRejectedError';
  }
}
